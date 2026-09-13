"""Scoperta delle URL prodotto a partire dalle sitemap XML."""

from __future__ import annotations

import gzip
import io
import logging
import re
from typing import Iterable, Iterator, Optional
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from .fetcher import Fetcher, RobotsDisallowed

log = logging.getLogger(__name__)


def sitemaps_from_robots(fetcher: Fetcher, root: str) -> list[str]:
    """Legge le direttive ``Sitemap:`` dal robots.txt."""
    robots_url = urljoin(root, "/robots.txt")
    try:
        resp = fetcher.session.get(robots_url, timeout=fetcher.timeout)
    except Exception as exc:
        log.warning("robots.txt non leggibile: %s", exc)
        return []
    if resp.status_code != 200:
        return []
    found = re.findall(r"(?im)^\s*sitemap:\s*(\S+)\s*$", resp.text)
    return [u.strip() for u in found]


def _decode(content: bytes, url: str) -> str:
    if url.endswith(".gz") or content[:2] == b"\x1f\x8b":
        try:
            content = gzip.GzipFile(fileobj=io.BytesIO(content)).read()
        except OSError:
            pass
    return content.decode("utf-8", errors="replace")


def iter_sitemap(
    fetcher: Fetcher,
    sitemap_url: str,
    url_filter: Optional[re.Pattern] = None,
    _seen: Optional[set[str]] = None,
    _depth: int = 0,
) -> Iterator[str]:
    """Percorre ricorsivamente un sitemap index e restituisce le ``<loc>``."""
    seen = _seen if _seen is not None else set()
    if sitemap_url in seen or _depth > 5:
        return
    seen.add(sitemap_url)

    try:
        resp = fetcher.get(sitemap_url)
    except RobotsDisallowed:
        log.warning("sitemap vietata da robots.txt: %s", sitemap_url)
        return
    if resp is None or resp.status_code >= 400:
        return

    soup = BeautifulSoup(_decode(resp.content, sitemap_url), "xml")

    for node in soup.find_all("sitemap"):
        loc = node.find("loc")
        if loc and loc.text.strip():
            yield from iter_sitemap(fetcher, loc.text.strip(), url_filter, seen, _depth + 1)

    for node in soup.find_all("url"):
        loc = node.find("loc")
        if not loc or not loc.text.strip():
            continue
        url = loc.text.strip()
        if url_filter is None or url_filter.search(url):
            yield url


def discover_product_urls(
    fetcher: Fetcher,
    root: str,
    product_pattern: str,
    sitemap_pattern: Optional[str] = None,
    extra_sitemaps: Iterable[str] = (),
    limit: Optional[int] = None,
) -> list[str]:
    """Restituisce le URL prodotto trovate nelle sitemap del sito."""
    product_re = re.compile(product_pattern)
    sitemap_re = re.compile(sitemap_pattern) if sitemap_pattern else None

    sitemaps = list(extra_sitemaps) or sitemaps_from_robots(fetcher, root)
    if not sitemaps:
        sitemaps = [urljoin(root, "/sitemap.xml")]
    if sitemap_re:
        filtered = [s for s in sitemaps if sitemap_re.search(s)]
        sitemaps = filtered or sitemaps

    log.info("sitemap da esplorare: %d", len(sitemaps))

    out: list[str] = []
    seen: set[str] = set()
    host = urlparse(root).netloc
    for sitemap in sitemaps:
        for url in iter_sitemap(fetcher, sitemap, product_re):
            if urlparse(url).netloc != host:
                continue
            url = url.split("#")[0]
            if url in seen:
                continue
            seen.add(url)
            out.append(url)
            if limit and len(out) >= limit:
                log.info("raggiunto il limite di %d URL", limit)
                return out
    return out
