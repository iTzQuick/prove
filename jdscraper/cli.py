"""Interfaccia a riga di comando."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from bs4 import BeautifulSoup

from .config import SiteConfig, available_configs
from .db import init_db, make_session_factory, upsert_product
from .discovery import discover_product_urls
from .export import export, stats
from .extract import extract_product
from .fetcher import DEFAULT_USER_AGENT, Fetcher, RobotsDisallowed
from .parsing import extract_state_blobs, find_jsonld_product
from .pipeline import crawl, estimate_duration, format_duration, ingest_directory

DEFAULT_DB = "sqlite:///catalogo.db"


def _setup_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(message)s",
        datefmt="%H:%M:%S",
    )


def _make_fetcher(config: SiteConfig, args) -> Fetcher:
    return Fetcher(
        user_agent=args.user_agent or config.user_agent or DEFAULT_USER_AGENT,
        delay=args.delay if args.delay is not None else config.delay,
    )


# --------------------------------------------------------------------------
# comandi
# --------------------------------------------------------------------------

def cmd_discover(args) -> int:
    config = SiteConfig.load(args.config)
    fetcher = _make_fetcher(config, args)
    fetcher.apply_robots_delay(config.root)

    if not fetcher.can_fetch(config.root):
        print(f"robots.txt di {config.root} vieta l'accesso a questo user-agent.", file=sys.stderr)
        return 2

    urls = discover_product_urls(
        fetcher,
        root=config.root,
        product_pattern=config.product_url_pattern,
        sitemap_pattern=config.sitemap_pattern,
        extra_sitemaps=config.sitemaps,
        limit=args.limit,
    )
    print(f"Trovate {len(urls)} URL prodotto.")
    if urls:
        eta = estimate_duration(len(urls), fetcher.limiter.delay)
        print(f"Crawl stimato a delay {fetcher.limiter.delay:g}s: {format_duration(eta)}"
              f" (con --images: {format_duration(estimate_duration(len(urls), fetcher.limiter.delay, 6))})")
    if args.out:
        Path(args.out).write_text("\n".join(urls), encoding="utf-8")
        print(f"Salvate in {args.out}")
    else:
        for url in urls[:20]:
            print(" ", url)
        if len(urls) > 20:
            print(f"  ... e altre {len(urls) - 20}")
    fetcher.close()
    return 0


def cmd_scrape(args) -> int:
    config = SiteConfig.load(args.config)
    fetcher = _make_fetcher(config, args)
    fetcher.apply_robots_delay(config.root)

    if args.urls:
        urls = [u.strip() for u in Path(args.urls).read_text(encoding="utf-8").splitlines() if u.strip()]
    else:
        print("Scopro le URL prodotto dalle sitemap...")
        urls = discover_product_urls(
            fetcher,
            root=config.root,
            product_pattern=config.product_url_pattern,
            sitemap_pattern=config.sitemap_pattern,
            extra_sitemaps=config.sitemaps,
            limit=args.limit,
        )
    if args.limit:
        urls = urls[: args.limit]
    if not urls:
        print("Nessuna URL da processare.", file=sys.stderr)
        return 1

    engine = init_db(args.db)
    session_factory = make_session_factory(engine)
    images_dir = Path(args.download_images) if args.download_images else None

    eta = estimate_duration(len(urls), fetcher.limiter.delay, 6 if images_dir else 0)
    print(f"Avvio crawl su {len(urls)} URL (delay {fetcher.limiter.delay:g}s).")
    print(f"Durata stimata: {format_duration(eta)}. Ctrl+C interrompe senza perdere nulla.")
    summary = crawl(
        urls,
        config,
        fetcher,
        session_factory,
        images_dir=images_dir,
        workers=args.workers,
        on_progress=lambda s: print("  ...", s.as_text()),
    )
    print(summary.as_text())
    print(f"Richieste HTTP: {fetcher.stats.requests}, MB scaricati: {fetcher.stats.bytes_downloaded / 1e6:.1f}")
    fetcher.close()
    return 0


def cmd_parse_file(args) -> int:
    config = SiteConfig.load(args.config)
    html = Path(args.path).read_text(encoding="utf-8", errors="replace")
    record = extract_product(html, args.url, source=config.source, selectors=config.selectors)
    if record is None:
        print("La pagina non sembra una scheda prodotto.", file=sys.stderr)
        return 1
    data = record.as_dict()
    data.pop("raw", None)
    print(json.dumps(data, ensure_ascii=False, indent=2, default=str))

    if args.db:
        engine = init_db(args.db)
        with make_session_factory(engine)() as session:
            outcome = upsert_product(session, record)
            session.commit()
        print(f"\nScritto nel database ({outcome}): {args.db}")
    return 0


def cmd_check_selectors(args) -> int:
    """Diagnostica: mostra cosa fornisce ogni livello di estrazione."""
    config = SiteConfig.load(args.config)
    if args.file:
        html = Path(args.file).read_text(encoding="utf-8", errors="replace")
        url = args.url or "https://example.invalid/product/test"
    else:
        fetcher = _make_fetcher(config, args)
        try:
            resp = fetcher.get(args.url)
        except RobotsDisallowed:
            print(f"robots.txt vieta {args.url}", file=sys.stderr)
            return 2
        if resp is None or resp.status_code >= 400:
            print(f"Download fallito ({resp.status_code if resp else 'nessuna risposta'})", file=sys.stderr)
            return 1
        html, url = resp.text, args.url
        fetcher.close()

    soup = BeautifulSoup(html, "lxml")
    print(f"JSON-LD Product trovato: {'si' if find_jsonld_product(soup) else 'NO'}")
    print(f"Blob di stato JS trovati: {len(extract_state_blobs(html, soup))}")
    print("\nSelettori CSS configurati:")
    for field, rules in (config.selectors or {}).items():
        for rule in rules:
            selector = rule.get("selector") if isinstance(rule, dict) else rule
            try:
                count = len(soup.select(selector))
            except Exception as exc:
                print(f"  {field:<12} {selector!r:<45} SELETTORE NON VALIDO ({exc})")
                continue
            mark = "OK " if count else "-- "
            print(f"  {mark}{field:<12} {selector!r:<45} {count} match")

    record = extract_product(html, url, source=config.source, selectors=config.selectors)
    print("\nRisultato estrazione:")
    if record is None:
        print("  nessun prodotto estratto")
        return 1
    data = record.as_dict()
    data.pop("raw", None)
    for key, value in data.items():
        flag = "  " if value not in (None, [], "", False) else "! "
        print(f"  {flag}{key:<18} {value}")
    return 0


def cmd_ingest_dir(args) -> int:
    """Importa pagine HTML gia' salvate su disco: nessuna connessione di rete."""
    config = SiteConfig.load(args.config)
    directory = Path(args.directory)
    if not directory.is_dir():
        print(f"{directory} non e' una cartella", file=sys.stderr)
        return 2

    engine = init_db(args.db)
    summary = ingest_directory(
        directory,
        config,
        make_session_factory(engine),
        recursive=not args.no_recursive,
    )
    print(summary.as_text())
    return 0 if summary.new or summary.updated else 1


def cmd_export(args) -> int:
    engine = init_db(args.db)
    with make_session_factory(engine)() as session:
        count = export(
            session,
            Path(args.out),
            fmt=args.format,
            only_discounted=args.only_discounted,
            brand=args.brand,
        )
    print(f"Esportati {count} prodotti in {args.out}")
    return 0


def cmd_stats(args) -> int:
    engine = init_db(args.db)
    with make_session_factory(engine)() as session:
        print(json.dumps(stats(session), ensure_ascii=False, indent=2))
    return 0


# --------------------------------------------------------------------------
# parser
# --------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="jdscraper",
        description="Estrae un catalogo prodotti e lo salva in un database relazionale.",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    def add_common(p, net=True):
        p.add_argument("--config", default="jdsports_it",
                       help=f"configurazione sito (disponibili: {', '.join(available_configs())})")
        if net:
            p.add_argument("--delay", type=float, default=None, help="secondi fra le richieste")
            p.add_argument("--user-agent", default=None)

    p = sub.add_parser("discover", help="elenca le URL prodotto dalle sitemap")
    add_common(p)
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--out", default=None, help="file dove salvare le URL")
    p.set_defaults(func=cmd_discover)

    p = sub.add_parser("scrape", help="scarica i prodotti e li scrive nel database")
    add_common(p)
    p.add_argument("--db", default=DEFAULT_DB)
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--urls", default=None, help="file con una URL per riga (salta la scoperta)")
    p.add_argument("--download-images", default=None, metavar="DIR")
    p.add_argument("--workers", type=int, default=2)
    p.set_defaults(func=cmd_scrape)

    p = sub.add_parser("parse-file", help="estrae un prodotto da un HTML gia' salvato")
    add_common(p, net=False)
    p.add_argument("path")
    p.add_argument("--url", default="https://www.jdsports.it/product/locale/000000/")
    p.add_argument("--db", default=None, help="se indicato, scrive il risultato nel database")
    p.set_defaults(func=cmd_parse_file)

    p = sub.add_parser("check-selectors", help="diagnostica i selettori su una pagina")
    add_common(p)
    p.add_argument("url", nargs="?", default=None)
    p.add_argument("--file", default=None, help="usa un HTML locale invece di scaricarlo")
    p.set_defaults(func=cmd_check_selectors)

    p = sub.add_parser("ingest-dir", help="importa una cartella di pagine HTML salvate (offline)")
    add_common(p, net=False)
    p.add_argument("directory")
    p.add_argument("--db", default=DEFAULT_DB)
    p.add_argument("--no-recursive", action="store_true")
    p.set_defaults(func=cmd_ingest_dir)

    p = sub.add_parser("export", help="esporta il catalogo in CSV o JSON")
    p.add_argument("--db", default=DEFAULT_DB)
    p.add_argument("--out", required=True)
    p.add_argument("--format", choices=("csv", "json"), default="csv")
    p.add_argument("--only-discounted", action="store_true")
    p.add_argument("--brand", default=None)
    p.set_defaults(func=cmd_export)

    p = sub.add_parser("stats", help="statistiche sul catalogo in database")
    p.add_argument("--db", default=DEFAULT_DB)
    p.set_defaults(func=cmd_stats)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    _setup_logging(args.verbose)
    if args.command == "check-selectors" and not args.url and not args.file:
        print("serve una URL oppure --file", file=sys.stderr)
        return 2
    return args.func(args)
