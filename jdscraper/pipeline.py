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
            resp = fetcher.get(url, asset=True)
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


def ingest_directory(
    directory: Path,
    config: SiteConfig,
    session_factory: sessionmaker[Session],
    fallback_url: str = "https://www.jdsports.it/product/sconosciuto/0/",
    recursive: bool = True,
) -> CrawlSummary:
    """Importa nel database le pagine HTML gia' salvate su disco.

    Percorso completamente offline: non viene aperta nessuna connessione. Serve
    quando le pagine vengono salvate a mano dal browser (Ctrl+S) oppure con un
    downloader esterno. L'URL di origine viene ripreso, in ordine, da un file
    affiancato ``<nome>.url``, dal ``<link rel=canonical>`` della pagina stessa
    o infine da ``fallback_url``.
    """
    from bs4 import BeautifulSoup

    from .parsing import find_canonical_url

    # Il suffisso va confrontato in modo esatto: un glob "*.htm*" raccoglierebbe
    # anche i file sidecar "pagina.html.url", trattandoli come pagine.
    pattern = "**/*" if recursive else "*"
    files = sorted(
        p for p in directory.glob(pattern)
        if p.is_file() and p.suffix.lower() in (".html", ".htm", ".xhtml")
    )
    summary = CrawlSummary()

    with session_factory() as session:
        for path in files:
            summary.seen += 1
            html = path.read_text(encoding="utf-8", errors="replace")

            sidecar = path.with_suffix(path.suffix + ".url")
            if sidecar.exists():
                url = sidecar.read_text(encoding="utf-8").strip()
            else:
                url = find_canonical_url(BeautifulSoup(html, "lxml")) or fallback_url

            try:
                record = extract_product(html, url, source=config.source, selectors=config.selectors)
            except Exception:
                log.exception("estrazione fallita su %s", path)
                summary.failed += 1
                continue

            if record is None:
                log.info("%s non e' una scheda prodotto", path.name)
                summary.not_a_product += 1
                continue

            try:
                outcome = upsert_product(session, record)
                session.commit()
            except Exception:
                session.rollback()
                summary.failed += 1
                log.exception("scrittura su database fallita per %s", path)
            else:
                if outcome == "new":
                    summary.new += 1
                else:
                    summary.updated += 1

    return summary


def estimate_duration(
    n_urls: int,
    delay: float,
    images_per_product: int = 0,
    asset_delay: float = 0.25,
    jitter: float = 0.3,
) -> float:
    """Stima in secondi la durata del crawl.

    Il collo di bottiglia e' il rate limiter, non la rete ne' il numero di
    worker: le richieste partono comunque una ogni ``delay`` secondi. Le
    immagini viaggiano sul limitatore separato, molto piu' rapido.
    """
    per_page = delay + jitter / 2
    per_assets = images_per_product * (asset_delay + 0.05 / 2)
    return n_urls * (per_page + per_assets)


def format_duration(seconds: float) -> str:
    if seconds < 90:
        return f"{seconds:.0f} secondi"
    minutes = seconds / 60
    if minutes < 90:
        return f"{minutes:.0f} minuti"
    hours = minutes / 60
    if hours < 36:
        return f"{hours:.1f} ore"
    return f"{hours / 24:.1f} giorni"


def harvest_listings(
    start_urls: Iterable[str],
    config: SiteConfig,
    fetcher: Fetcher,
    session_factory: sessionmaker[Session],
    max_pages_per_category: Optional[int] = None,
    on_progress: Optional[Callable[[CrawlSummary], None]] = None,
) -> CrawlSummary:
    """Raccoglie i prodotti dalle pagine di categoria, seguendo la paginazione.

    Una richiesta rende decine di prodotti invece di uno: e' la strada rapida
    per avere l'intero catalogo con prezzi, sconti e immagini. Taglie e
    descrizioni restano da riempire con ``enrich_missing_sizes``.
    """
    from .listing import bump_page_param, extract_listing

    summary = CrawlSummary()
    visited: set[str] = set()

    with session_factory() as session:
        for start_url in start_urls:
            url: Optional[str] = start_url
            page = 1
            # Finche' la prima pagina non ci dice come si pagina, non lo sappiamo:
            # se espone un link "avanti" ci fidiamo solo di quello, altrimenti
            # proviamo a costruire ?page=N e ci fermiamo appena una pagina e'
            # vuota. Indovinare anche quando il link esiste sprecherebbe una
            # richiesta a vuoto in fondo a ogni categoria.
            explicit_pagination: Optional[bool] = None
            guessing = False

            while url and url not in visited:
                visited.add(url)
                summary.seen += 1
                try:
                    resp = fetcher.get(url)
                except RobotsDisallowed:
                    summary.skipped_robots += 1
                    break
                if resp is None or resp.status_code >= 400:
                    if guessing:
                        summary.seen -= 1  # pagina inesistente: fine categoria
                        break
                    summary.failed += 1
                    break

                try:
                    records, next_url = extract_listing(
                        resp.text, url, source=config.source, selectors=config.selectors
                    )
                except Exception:
                    log.exception("estrazione listing fallita su %s", url)
                    summary.failed += 1
                    break

                if not records:
                    log.info("nessun prodotto su %s: fine della categoria", url)
                    if guessing:
                        summary.seen -= 1
                    break

                if explicit_pagination is None:
                    explicit_pagination = next_url is not None

                for record in records:
                    try:
                        outcome = upsert_product(session, record)
                    except Exception:
                        session.rollback()
                        summary.failed += 1
                        log.exception("scrittura fallita per %s", record.url)
                    else:
                        if outcome == "new":
                            summary.new += 1
                        else:
                            summary.updated += 1
                session.commit()

                if on_progress:
                    on_progress(summary)

                page += 1
                if max_pages_per_category and page > max_pages_per_category:
                    break
                if explicit_pagination:
                    url, guessing = next_url, False
                else:
                    url, guessing = bump_page_param(start_url, page), True
                if url in visited:
                    break

    return summary


def enrich_missing_sizes(
    config: SiteConfig,
    fetcher: Fetcher,
    session_factory: sessionmaker[Session],
    limit: Optional[int] = None,
    workers: int = 4,
    on_progress: Optional[Callable[[CrawlSummary], None]] = None,
) -> CrawlSummary:
    """Scarica la scheda dei soli prodotti a cui mancano le taglie.

    Completa il lavoro di ``harvest_listings`` pagando una richiesta per
    prodotto solo dove serve davvero, invece che su tutto il catalogo.
    """
    from sqlalchemy import select

    from .models import Product, ProductSize

    with session_factory() as session:
        stmt = (
            select(Product.url)
            .where(~Product.sizes.any(ProductSize.id.isnot(None)))
            .order_by(Product.id)
        )
        if limit:
            stmt = stmt.limit(limit)
        urls = [u for (u,) in session.execute(stmt).all()]

    log.info("prodotti senza taglie da completare: %d", len(urls))
    return crawl(urls, config, fetcher, session_factory, workers=workers, on_progress=on_progress)
