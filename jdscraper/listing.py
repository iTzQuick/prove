"""Estrazione di piu' prodotti da una singola pagina di categoria.

Una pagina di listing mostra 60-120 prodotti con nome, brand, prezzo, prezzo
pieno e immagine: sono quasi tutti i campi del catalogo, al costo di **una sola**
richiesta invece di una per prodotto. Su un catalogo da ventimila pezzi la
differenza e' fra qualche centinaio di richieste e ventimila.

Cio' che il listing non puo' dare sono le taglie e la descrizione: per quelle
serve la scheda prodotto, ma solo per i prodotti che interessano davvero
(vedi ``pipeline.enrich_missing_sizes``).
"""

from __future__ import annotations

import logging
import re
from typing import Any, Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .extract import ProductRecord, _source_id, finalise_prices
from .parsing import (
    clean_text,
    detect_currency,
    extract_state_blobs,
    has_type,
    iter_jsonld,
    parse_price,
)

log = logging.getLogger(__name__)

_LIST_PRICE_KEYS = ("listPrice", "wasPrice", "originalPrice", "regularPrice", "rrp")


def _record_from_parts(
    source: str, url: str, name: Optional[str], **fields: Any
) -> Optional[ProductRecord]:
    if not url or not (name or fields.get("price") is not None):
        return None
    rec = ProductRecord(source=source, source_id="", url=url, name=name)
    for key, value in fields.items():
        if value is not None:
            setattr(rec, key, value)
    rec.extraction_method = "listing"
    rec.source_id = _source_id(rec, url)
    finalise_prices(rec)
    return rec


# --------------------------------------------------------------------------
# livello 1: JSON-LD ItemList
# --------------------------------------------------------------------------

def _from_jsonld(soup: BeautifulSoup, base_url: str, source: str) -> list[ProductRecord]:
    out: list[ProductRecord] = []
    for node in iter_jsonld(soup):
        if not has_type(node, "ItemList"):
            continue
        for entry in node.get("itemListElement") or []:
            if not isinstance(entry, dict):
                continue
            item = entry.get("item") if isinstance(entry.get("item"), dict) else entry
            if not isinstance(item, dict):
                continue

            url = clean_text(item.get("url") or entry.get("url"))
            if not url:
                continue
            url = urljoin(base_url, url)

            brand = item.get("brand")
            if isinstance(brand, dict):
                brand = brand.get("name")

            offers = item.get("offers")
            if isinstance(offers, list):
                offers = offers[0] if offers else None
            price = currency = list_price = None
            if isinstance(offers, dict):
                price = parse_price(offers.get("price") or offers.get("lowPrice"))
                currency = detect_currency(offers.get("priceCurrency"))
                for key in _LIST_PRICE_KEYS:
                    if offers.get(key):
                        list_price = parse_price(offers[key])
                        break

            image = item.get("image")
            if isinstance(image, list):
                image = image[0] if image else None
            if isinstance(image, dict):
                image = image.get("url")

            rec = _record_from_parts(
                source, url,
                clean_text(item.get("name")),
                brand=clean_text(brand),
                sku=clean_text(item.get("sku")),
                price=price,
                list_price=list_price,
                currency=currency,
                images=[urljoin(base_url, image)] if clean_text(image) else [],
            )
            if rec:
                out.append(rec)
    return out


# --------------------------------------------------------------------------
# livello 2: blob di stato JS
# --------------------------------------------------------------------------

def _looks_like_product(entry: Any) -> bool:
    return (
        isinstance(entry, dict)
        and any(k in entry for k in ("name", "title", "productName"))
        and any(k in entry for k in ("price", "prices", "sellingPrice", "currentPrice"))
    )


def _from_state(html: str, soup: BeautifulSoup, base_url: str, source: str) -> list[ProductRecord]:
    out: list[ProductRecord] = []
    seen: set[str] = set()

    def walk(data: Any, depth: int = 0) -> None:
        if depth > 10:
            return
        if isinstance(data, list):
            products = [e for e in data if _looks_like_product(e)]
            if len(products) >= 3:  # un elenco, non un prodotto isolato
                for entry in products:
                    url = clean_text(entry.get("url") or entry.get("href") or entry.get("link"))
                    if not url:
                        continue
                    url = urljoin(base_url, url)
                    if url in seen:
                        continue
                    seen.add(url)
                    price = entry.get("price")
                    if isinstance(price, dict):
                        price = price.get("value") or price.get("current") or price.get("amount")
                    list_price = None
                    for key in _LIST_PRICE_KEYS:
                        if entry.get(key):
                            list_price = parse_price(entry[key])
                            break
                    image = entry.get("image") or entry.get("imageUrl") or entry.get("thumbnail")
                    if isinstance(image, (list, tuple)):
                        image = image[0] if image else None
                    rec = _record_from_parts(
                        source, url,
                        clean_text(entry.get("name") or entry.get("title") or entry.get("productName")),
                        brand=clean_text(entry.get("brand")),
                        price=parse_price(price),
                        list_price=list_price,
                        colour=clean_text(entry.get("colour") or entry.get("color")),
                        images=[urljoin(base_url, str(image))] if image else [],
                    )
                    if rec:
                        out.append(rec)
                return
            for entry in data:
                walk(entry, depth + 1)
        elif isinstance(data, dict):
            for value in data.values():
                walk(value, depth + 1)

    for blob in extract_state_blobs(html, soup):
        walk(blob)
    return out


# --------------------------------------------------------------------------
# livello 3: selettori CSS
# --------------------------------------------------------------------------

def _text(node, selectors: list[str]) -> Optional[str]:
    for selector in selectors or []:
        try:
            found = node.select_one(selector)
        except Exception:
            continue
        if found is not None:
            value = clean_text(found.get_text(" ", strip=True))
            if value:
                return value
    return None


def _attr(node, selectors: list[str], attr: str) -> Optional[str]:
    for selector in selectors or []:
        try:
            found = node.select_one(selector)
        except Exception:
            continue
        if found is not None and found.get(attr):
            value = found[attr]
            if isinstance(value, list):
                value = " ".join(value)
            value = clean_text(value)
            if value:
                return value.split()[0] if attr == "srcset" else value
    return None


def _from_css(soup: BeautifulSoup, base_url: str, source: str, cfg: dict) -> list[ProductRecord]:
    out: list[ProductRecord] = []
    for container in cfg.get("item") or []:
        try:
            nodes = soup.select(container)
        except Exception:
            continue
        if not nodes:
            continue
        for node in nodes:
            href = _attr(node, cfg.get("link") or ["a"], "href")
            if not href:
                continue
            price = parse_price(_text(node, cfg.get("price") or []))
            rec = _record_from_parts(
                source, urljoin(base_url, href),
                _text(node, cfg.get("name") or []),
                brand=_text(node, cfg.get("brand") or []),
                price=price,
                list_price=parse_price(_text(node, cfg.get("list_price") or [])),
                currency=detect_currency(_text(node, cfg.get("price") or [])),
                images=[urljoin(base_url, i) for i in filter(None, [
                    _attr(node, cfg.get("image") or ["img"], "src")
                    or _attr(node, cfg.get("image") or ["img"], "data-src")
                    or _attr(node, cfg.get("image") or ["img"], "srcset")
                ])],
            )
            if rec:
                out.append(rec)
        if out:
            break
    return out


# --------------------------------------------------------------------------
# paginazione
# --------------------------------------------------------------------------

def find_next_page(soup: BeautifulSoup, base_url: str, cfg: dict) -> Optional[str]:
    tag = soup.find("link", attrs={"rel": lambda v: v and "next" in (v if isinstance(v, list) else [v])})
    if tag and tag.get("href"):
        return urljoin(base_url, tag["href"])
    for selector in cfg.get("next") or []:
        try:
            found = soup.select_one(selector)
        except Exception:
            continue
        if found is not None and found.get("href"):
            return urljoin(base_url, found["href"])
    return None


def bump_page_param(url: str, page: int) -> str:
    """Costruisce l'URL della pagina N quando il sito non espone un link next."""
    if re.search(r"[?&]page=\d+", url):
        return re.sub(r"([?&]page=)\d+", rf"\g<1>{page}", url)
    return f"{url}{'&' if '?' in url else '?'}page={page}"


# --------------------------------------------------------------------------
# entrypoint
# --------------------------------------------------------------------------

def extract_listing(
    html: str,
    url: str,
    source: str = "jdsports.it",
    selectors: Optional[dict] = None,
) -> tuple[list[ProductRecord], Optional[str]]:
    """Estrae i prodotti di una pagina di categoria e l'URL della successiva."""
    soup = BeautifulSoup(html, "lxml")
    cfg = (selectors or {}).get("listing") or {}

    records = _from_jsonld(soup, url, source)
    if not records:
        records = _from_state(html, soup, url, source)
    if not records:
        records = _from_css(soup, url, source, cfg)

    # deduplica mantenendo l'ordine di pagina
    unique: dict[str, ProductRecord] = {}
    for rec in records:
        unique.setdefault(rec.source_id, rec)

    return list(unique.values()), find_next_page(soup, url, cfg)
