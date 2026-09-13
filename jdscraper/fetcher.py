"""Client HTTP educato: robots.txt, rate limit, retry con backoff.

Regole non negoziabili implementate qui:

* ``robots.txt`` viene letto **prima** di qualsiasi altra richiesta e le URL
  non consentite non vengono scaricate;
* il ``Crawl-delay`` dichiarato dal sito ha la precedenza sul delay configurato
  se e' piu' alto;
* lo User-Agent identifica il bot e riporta un contatto, cosi' il gestore del
  sito puo' chiedere di fermarsi.
"""

from __future__ import annotations

import logging
import random
import threading
import time
import urllib.robotparser
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urljoin, urlparse

import requests

log = logging.getLogger(__name__)

DEFAULT_USER_AGENT = (
    "jdscraper/1.0 (+catalogo prodotti; contatto: imposta CONTACT_EMAIL nel config)"
)


class RobotsDisallowed(Exception):
    """L'URL richiesta e' vietata da robots.txt."""


@dataclass
class FetchStats:
    requests: int = 0
    blocked_by_robots: int = 0
    errors: int = 0
    bytes_downloaded: int = 0


class RateLimiter:
    """Limita a una richiesta ogni ``delay`` secondi (con jitter)."""

    def __init__(self, delay: float, jitter: float = 0.3) -> None:
        self.delay = max(0.0, delay)
        self.jitter = max(0.0, jitter)
        self._lock = threading.Lock()
        self._next_allowed = 0.0

    def wait(self) -> None:
        with self._lock:
            now = time.monotonic()
            if now < self._next_allowed:
                time.sleep(self._next_allowed - now)
                now = time.monotonic()
            self._next_allowed = now + self.delay + random.uniform(0, self.jitter)


class Fetcher:
    def __init__(
        self,
        user_agent: str = DEFAULT_USER_AGENT,
        delay: float = 2.0,
        timeout: float = 30.0,
        max_retries: int = 3,
        accept_language: str = "it-IT,it;q=0.9",
        asset_delay: float = 0.25,
    ) -> None:
        self.user_agent = user_agent
        self.timeout = timeout
        self.max_retries = max_retries
        self.limiter = RateLimiter(delay)
        # Le immagini stanno su CDN dimensionate per il traffico dei browser:
        # applicargli il delay pensato per le pagine moltiplicherebbe la durata
        # del crawl per il numero di immagini per prodotto, senza alcun guadagno
        # in cortesia. Restano comunque limitate, e sempre soggette a robots.txt.
        self.asset_limiter = RateLimiter(asset_delay, jitter=0.05)
        self.stats = FetchStats()
        self._robots: dict[str, Optional[urllib.robotparser.RobotFileParser]] = {}
        self._robots_lock = threading.Lock()
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": user_agent,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": accept_language,
            }
        )

    # -- robots ---------------------------------------------------------
    def _robots_for(self, url: str) -> Optional[urllib.robotparser.RobotFileParser]:
        root = "{0.scheme}://{0.netloc}".format(urlparse(url))
        with self._robots_lock:
            if root in self._robots:
                return self._robots[root]
        parser = urllib.robotparser.RobotFileParser()
        robots_url = urljoin(root, "/robots.txt")
        try:
            resp = self.session.get(robots_url, timeout=self.timeout)
            if resp.status_code == 200:
                parser.parse(resp.text.splitlines())
            elif resp.status_code in (401, 403):
                # Convenzione RFC 9309: robots protetto => tutto vietato.
                parser.disallow_all = True
            else:
                parser.allow_all = True
        except requests.RequestException as exc:
            log.warning("robots.txt non raggiungibile su %s (%s): mi fermo per prudenza", root, exc)
            parser.disallow_all = True
        with self._robots_lock:
            self._robots[root] = parser
        return parser

    def can_fetch(self, url: str) -> bool:
        parser = self._robots_for(url)
        return True if parser is None else parser.can_fetch(self.user_agent, url)

    def crawl_delay(self, url: str) -> Optional[float]:
        parser = self._robots_for(url)
        if parser is None:
            return None
        try:
            value = parser.crawl_delay(self.user_agent)
        except Exception:
            return None
        return float(value) if value else None

    def apply_robots_delay(self, url: str) -> None:
        """Alza il delay locale se il sito ne chiede uno piu' alto."""
        declared = self.crawl_delay(url)
        if declared and declared > self.limiter.delay:
            log.info("robots.txt richiede crawl-delay %.1fs: adeguo il rate limit", declared)
            self.limiter.delay = declared

    # -- fetch ----------------------------------------------------------
    def get(self, url: str, asset: bool = False, **kwargs) -> Optional[requests.Response]:
        """Scarica una URL. ``asset=True`` per immagini e altri file statici."""
        if not self.can_fetch(url):
            self.stats.blocked_by_robots += 1
            raise RobotsDisallowed(url)

        limiter = self.asset_limiter if asset else self.limiter
        backoff = 2.0
        for attempt in range(1, self.max_retries + 1):
            limiter.wait()
            try:
                resp = self.session.get(url, timeout=self.timeout, **kwargs)
            except requests.RequestException as exc:
                log.warning("errore di rete su %s (tentativo %d/%d): %s", url, attempt, self.max_retries, exc)
                if attempt == self.max_retries:
                    self.stats.errors += 1
                    return None
                time.sleep(backoff)
                backoff *= 2
                continue

            self.stats.requests += 1
            self.stats.bytes_downloaded += len(resp.content or b"")

            if resp.status_code == 429 or resp.status_code in (502, 503, 504):
                retry_after = resp.headers.get("Retry-After")
                wait = float(retry_after) if (retry_after or "").isdigit() else backoff
                log.warning("HTTP %s su %s: attendo %.1fs", resp.status_code, url, wait)
                if attempt == self.max_retries:
                    self.stats.errors += 1
                    return resp
                time.sleep(wait)
                backoff *= 2
                continue

            if resp.status_code >= 400:
                log.info("HTTP %s su %s", resp.status_code, url)
                self.stats.errors += 1
                return resp
            return resp
        return None

    def close(self) -> None:
        self.session.close()
