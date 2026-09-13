"""Orchestrazione del crawl: scoperta -> download -> estrazione -> database."""

from __future__ import annotations

import hashlib
import logging
import mimetypes
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Optional

from sqlalchemy.orm import Session, sessionmaker

from .config import SiteConfig
from .db import upsert_product
from .extract import ProductRecord, extract_product
from .fetcher import Fetcher, RobotsDisallowed
from .models import CrawlRun, utcnow

log = logging.getLogger(__name__)


@dataclass
class CrawlSummary:
    seen: int = 0
    new: int = 0
    updated: int = 0
    skipped_robots: int = 0
    failed: int = 0
    not_a_product: int = 0

    def as_text(self) -> str:
        return (
            f"URL processate: {self.seen} | nuovi: {self.new} | aggiornati: {self.updated} | "
            f"vietati da robots: {self.skipped_robots} | non-prodotto: {self.not_a_product} | "
            f"errori: {self.failed}"
        )


def fetch_and_extract(
    fetcher: Fetcher, url: str, config: SiteConfig
) -> tuple[str, Optional[ProductRecord], Optional[str]]:
    """Scarica una pagina e ne estrae il prodotto.

    Restituisce ``(url, record, errore)``: esattamente uno fra record ed errore
    e' valorizzato, tranne quando la pagina non e' una scheda prodotto.
    """
    try:
        resp = fetcher.get(url)
    except RobotsDisallowed:
        return url, None, "robots"
    if resp is None:
        return url, None, "network"
    if resp.status_code >= 400:
        return url, None, f"http{resp.status_code}"

    try:
        record = extract_product(resp.text, url, source=config.source, selectors=config.selectors)
    except Exception as exc:  # pragma: no cover - difensivo
        log.exception("estrazione fallita su %s", url)
        return url, None, f"parse:{exc}"

    if record is None:
        return url, None, "not-a-product"
    return url, record, None


def download_images(
    fetcher: Fetcher, record: ProductRecord, dest_dir: Path, max_images: int = 6
) -> dict[str, str]:
    """Scarica le immagini del prodotto, restituisce ``{url: percorso locale}``."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    saved: dict[str, str] = {}
    for url in record.images[:max_images]:
        digest = hashlib.sha1(url.encode()).hexdigest()[:16]
        try:
            resp = fetcher.get(url)
        except RobotsDisallowed:
            continue
        if resp is None or resp.status_code >= 400:
            continue
        ext = mimetypes.guess_extension(resp.headers.get("Content-Type", "").split(";")[0]) or ".jpg"
        path = dest_dir / f"{record.source_id}_{digest}{ext}"
        path.write_bytes(resp.content)
        saved[url] = str(path)
    return saved


def crawl(
    urls: Iterable[str],
    config: SiteConfig,
    fetcher: Fetcher,
    session_factory: sessionmaker[Session],
    images_dir: Optional[Path] = None,
    workers: int = 2,
    on_progress: Optional[Callable[[CrawlSummary], None]] = None,
) -> CrawlSummary:
    """Esegue il crawl e scrive nel database. Il rate limit resta globale."""
    urls = list(urls)
    summary = CrawlSummary()

    with session_factory() as session:
        run = CrawlRun(source=config.source, urls_seen=0)
        session.add(run)
        session.commit()
        run_id = run.id

    def worker(url: str):
        return fetch_and_extract(fetcher, url, config)

    with session_factory() as session, ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {pool.submit(worker, url): url for url in urls}
        for future in as_completed(futures):
            url, record, error = future.result()
            summary.seen += 1

            if error == "robots":
                summary.skipped_robots += 1
            elif error == "not-a-product":
                summary.not_a_product += 1
            elif error:
                summary.failed += 1
                log.warning("scarto %s (%s)", url, error)
            elif record is not None:
                if images_dir is not None:
                    try:
                        record.raw["local_images"] = download_images(fetcher, record, images_dir)
                    except Exception as exc:  # pragma: no cover - difensivo
                        log.warning("download immagini fallito per %s: %s", url, exc)
                try:
                    outcome = upsert_product(session, record)
                    session.commit()
                except Exception:
                    session.rollback()
                    summary.failed += 1
                    log.exception("scrittura su database fallita per %s", url)
                else:
                    if outcome == "new":
                        summary.new += 1
                    else:
                        summary.updated += 1

            if on_progress and summary.seen % 10 == 0:
                on_progress(summary)

    with session_factory() as session:
        run = session.get(CrawlRun, run_id)
        if run is not None:
            run.finished_at = utcnow()
            run.urls_seen = summary.seen
            run.products_new = summary.new
            run.products_updated = summary.updated
            run.errors = summary.failed
            run.notes = summary.as_text()
            session.commit()

    return summary
