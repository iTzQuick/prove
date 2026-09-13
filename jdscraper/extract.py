"""Estrazione di un prodotto da una pagina HTML.

La strategia e' a cascata, dalla fonte piu' stabile alla piu' fragile:

1. **JSON-LD** (``schema.org/Product``) — dato strutturato pensato per i motori
   di ricerca, e' la fonte piu' affidabile e cambia raramente.
2. **Blob di stato JS** (``__NEXT_DATA__``, ``window.__INITIAL_STATE__``) — copre
   i campi che il sito rende lato client (spesso taglie e prezzo barrato).
3. **Selettori CSS** definiti in un file di configurazione — ultima spiaggia,
   ed e' il livello che va ritarato quando il sito cambia il markup.

Ogni campo viene preso dal primo livello che lo fornisce, quindi un cambio di
markup degrada la qualita' del dato invece di rompere l'estrazione.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any, Optional
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from .parsing import (
    clean_text,
    deep_find,
    detect_currency,
    extract_state_blobs,
    find_jsonld_breadcrumb,
    find_jsonld_product,
    has_type,
    parse_price,
)

LIST_PRICE_KEYS = (
    "listPrice", "wasPrice", "originalPrice", "regularPrice", "fullPrice",
    "compareAtPrice", "previousPrice", "rrp", "strikePrice", "priceBeforeDiscount",
)
SIZE_KEYS = ("sizes", "variants", "skus", "variantOptions", "sizeOptions")


@dataclass
class SizeRecord:
    label: str
    available: Optional[bool] = None
    variant_sku: Optional[str] = None
    size_system: Optional[str] = None
    price: Optional[float] = None


@dataclass
class ProductRecord:
    source: str
    source_id: str
    url: str
    name: Optional[str] = None
    brand: Optional[str] = None
    style_code: Optional[str] = None
    sku: Optional[str] = None
    gtin: Optional[str] = None
    colour: Optional[str] = None
    gender: Optional[str] = None
    category: Optional[str] = None
    breadcrumb: Optional[str] = None
    description: Optional[str] = None
    currency: Optional[str] = None
    price: Optional[float] = None
    list_price: Optional[float] = None
    discount_amount: Optional[float] = None
    discount_percent: Optional[float] = None
    is_discounted: bool = False
    availability: Optional[str] = None
    in_stock: Optional[bool] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    extraction_method: Optional[str] = None
    images: list[str] = field(default_factory=list)
    sizes: list[SizeRecord] = field(default_factory=list)
    raw: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return asdict(self)


# --------------------------------------------------------------------------
# helper
# --------------------------------------------------------------------------

def _availability_to_bool(value: Any) -> Optional[bool]:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    text = str(value).lower()
    if any(k in text for k in ("instock", "in_stock", "limitedavailability", "disponibil", "backorder", "preorder")):
        return True
    if any(k in text for k in ("outofstock", "out_of_stock", "soldout", "esaurit", "discontinued", "non disponibil")):
        return False
    return None


def _as_list(value: Any) -> list:
    if value is None:
        return []
    return list(value) if isinstance(value, (list, tuple)) else [value]


def _gender_from(*texts: Any) -> Optional[str]:
    blob = " ".join(str(t) for t in texts if t).lower()
    checks = (
        ("kids", ("bambin", "junior", "kids", "ragazz", "infant", "neonat")),
        ("women", ("donna", "women", "femmin")),
        ("men", ("uomo", "men", "maschil")),
        ("unisex", ("unisex",)),
    )
    for label, needles in checks:
        if any(n in blob for n in needles):
            return label
    return None


def _select_values(soup: BeautifulSoup, rules: list[dict]) -> list[str]:
    """Applica una lista di regole ``{"selector": ..., "attr": ...}``."""
    out: list[str] = []
    for rule in rules or []:
        selector = rule.get("selector") if isinstance(rule, dict) else rule
        if not selector:
            continue
        attr = rule.get("attr") if isinstance(rule, dict) else None
        try:
            nodes = soup.select(selector)
        except Exception:  # selettore non valido nel file di config
            continue
        for node in nodes:
            value = node.get(attr) if attr else node.get_text(" ", strip=True)
            if isinstance(value, list):
                value = " ".join(value)
            value = clean_text(value)
            if value:
                out.append(value)
        if out:
            break
    return out


def _select_first(soup: BeautifulSoup, rules: list[dict]) -> Optional[str]:
    values = _select_values(soup, rules)
    return values[0] if values else None


# --------------------------------------------------------------------------
# livello 1: JSON-LD
# --------------------------------------------------------------------------

def _offers_from_jsonld(node: dict) -> tuple[list[dict], list[dict]]:
    """Separa le offerte singole dalle AggregateOffer."""
    singles, aggregates = [], []
    for offer in _as_list(node.get("offers")):
        if not isinstance(offer, dict):
            continue
        if has_type(offer, "AggregateOffer"):
            aggregates.append(offer)
            singles.extend(o for o in _as_list(offer.get("offers")) if isinstance(o, dict))
        else:
            singles.append(offer)
    return singles, aggregates


def _list_price_from_offer(offer: dict) -> Optional[float]:
    for spec in _as_list(offer.get("priceSpecification")):
        if not isinstance(spec, dict):
            continue
        price_type = str(spec.get("priceType") or "").lower()
        if "list" in price_type or "strike" in price_type or "msrp" in price_type:
            value = parse_price(spec.get("price") or spec.get("minPrice"))
            if value:
                return value
    for key in LIST_PRICE_KEYS:
        if key in offer:
            value = parse_price(offer[key])
            if value:
                return value
    return None


def _size_label_from_offer(offer: dict) -> Optional[str]:
    for key in ("size", "sizeLabel"):
        value = offer.get(key)
        if isinstance(value, dict):
            value = value.get("name") or value.get("value")
        label = clean_text(value)
        if label:
            return label
    name = clean_text(offer.get("name"))
    if name:
        # "Nike Air Max 90 - EU 42" -> "EU 42"
        parts = re.split(r"\s[-–|]\s", name)
        return parts[-1].strip() if len(parts) > 1 else name
    return None


def _apply_jsonld(rec: ProductRecord, node: dict, soup: BeautifulSoup) -> None:
    rec.name = rec.name or clean_text(node.get("name"))
    rec.description = rec.description or clean_text(node.get("description"))

    brand = node.get("brand")
    if isinstance(brand, dict):
        brand = brand.get("name")
    rec.brand = rec.brand or clean_text(brand)

    rec.sku = rec.sku or clean_text(node.get("sku"))
    rec.style_code = rec.style_code or clean_text(node.get("mpn") or node.get("productID") or node.get("sku"))
    rec.gtin = rec.gtin or clean_text(node.get("gtin13") or node.get("gtin") or node.get("gtin12"))
    rec.colour = rec.colour or clean_text(node.get("color"))
    rec.category = rec.category or clean_text(node.get("category"))

    for image in _as_list(node.get("image")):
        if isinstance(image, dict):
            image = image.get("url") or image.get("contentUrl")
        image = clean_text(image)
        if image and image not in rec.images:
            rec.images.append(image)

    rating = node.get("aggregateRating")
    if isinstance(rating, dict):
        rec.rating = rec.rating if rec.rating is not None else parse_price(rating.get("ratingValue"))
        count = parse_price(rating.get("reviewCount") or rating.get("ratingCount"))
        rec.review_count = rec.review_count if rec.review_count is not None else (int(count) if count else None)

    singles, aggregates = _offers_from_jsonld(node)
    prices = [p for p in (parse_price(o.get("price")) for o in singles) if p is not None]

    if prices:
        rec.price = rec.price if rec.price is not None else min(prices)
    elif aggregates:
        low = parse_price(aggregates[0].get("lowPrice") or aggregates[0].get("price"))
        rec.price = rec.price if rec.price is not None else low

    currency_candidates = [o.get("priceCurrency") for o in singles] + [a.get("priceCurrency") for a in aggregates]
    rec.currency = rec.currency or detect_currency(*currency_candidates)

    for offer in singles:
        list_price = _list_price_from_offer(offer)
        if list_price:
            rec.list_price = rec.list_price or list_price
            break

    availabilities = [o.get("availability") for o in singles if o.get("availability")]
    if availabilities and not rec.availability:
        rec.availability = clean_text(availabilities[0])
        rec.in_stock = any(_availability_to_bool(a) for a in availabilities)

    # Le offerte multiple sono, di norma, una per taglia.
    if len(singles) > 1 and not rec.sizes:
        for offer in singles:
            label = _size_label_from_offer(offer)
            if not label:
                continue
            rec.sizes.append(
                SizeRecord(
                    label=label,
                    available=_availability_to_bool(offer.get("availability")),
                    variant_sku=clean_text(offer.get("sku") or offer.get("gtin13")),
                    price=parse_price(offer.get("price")),
                )
            )

    # Varianti esplicite (ProductGroup/hasVariant).
    for variant in _as_list(node.get("hasVariant")):
        if not isinstance(variant, dict):
            continue
        label = clean_text(variant.get("size") or variant.get("name"))
        if label and not any(s.label == label for s in rec.sizes):
            v_singles, _ = _offers_from_jsonld(variant)
            available = any(_availability_to_bool(o.get("availability")) for o in v_singles) if v_singles else None
            rec.sizes.append(SizeRecord(label=label, available=available, variant_sku=clean_text(variant.get("sku"))))

    crumbs = find_jsonld_breadcrumb(soup)
    if crumbs and not rec.breadcrumb:
        rec.breadcrumb = " > ".join(crumbs)
        rec.category = rec.category or (crumbs[-2] if len(crumbs) > 1 else crumbs[-1])


# --------------------------------------------------------------------------
# livello 2: blob di stato JS
# --------------------------------------------------------------------------

def _normalise_size_entry(entry: Any) -> Optional[SizeRecord]:
    if isinstance(entry, str):
        label = clean_text(entry)
        return SizeRecord(label=label) if label else None
    if not isinstance(entry, dict):
        return None
    label = clean_text(
        entry.get("size") or entry.get("label") or entry.get("name")
        or entry.get("value") or entry.get("sizeLabel")
    )
    if not label:
        return None
    available = entry.get("available")
    if available is None:
        available = entry.get("inStock", entry.get("isAvailable", entry.get("stock")))
    if isinstance(available, (int, float)) and not isinstance(available, bool):
        available = available > 0
    elif isinstance(available, str):
        available = _availability_to_bool(available)
    return SizeRecord(
        label=label,
        available=available if isinstance(available, bool) else None,
        variant_sku=clean_text(entry.get("sku") or entry.get("id") or entry.get("variantId")),
        price=parse_price(entry.get("price")),
    )


def _apply_state(rec: ProductRecord, blobs: list[dict]) -> None:
    for blob in blobs:
        if rec.list_price is None:
            rec.list_price = parse_price(deep_find(blob, LIST_PRICE_KEYS))
        if rec.price is None:
            rec.price = parse_price(deep_find(blob, ("sellingPrice", "currentPrice", "nowPrice", "price")))
        if rec.colour is None:
            rec.colour = clean_text(deep_find(blob, ("colour", "color", "colourway")))
        if rec.style_code is None:
            rec.style_code = clean_text(deep_find(blob, ("styleCode", "style", "plu", "productId", "mpn")))
        if not rec.sizes:
            raw_sizes = deep_find(blob, SIZE_KEYS)
            for entry in _as_list(raw_sizes):
                size = _normalise_size_entry(entry)
                if size and not any(s.label == size.label for s in rec.sizes):
                    rec.sizes.append(size)


# --------------------------------------------------------------------------
# livello 3: selettori CSS
# --------------------------------------------------------------------------

def _apply_selectors(rec: ProductRecord, soup: BeautifulSoup, sel: dict, base_url: str) -> None:
    rec.name = rec.name or _select_first(soup, sel.get("name"))
    rec.brand = rec.brand or _select_first(soup, sel.get("brand"))
    rec.colour = rec.colour or _select_first(soup, sel.get("colour"))
    rec.description = rec.description or _select_first(soup, sel.get("description"))
    rec.style_code = rec.style_code or _select_first(soup, sel.get("style_code"))

    if rec.price is None:
        rec.price = parse_price(_select_first(soup, sel.get("price")))
    if rec.list_price is None:
        rec.list_price = parse_price(_select_first(soup, sel.get("list_price")))
    if rec.currency is None:
        rec.currency = detect_currency(_select_first(soup, sel.get("price")))

    for image in _select_values(soup, sel.get("images")):
        # I srcset contengono piu' URL: teniamo il primo di ogni candidato.
        url = image.split()[0] if " " in image and "," in image else image
        url = urljoin(base_url, url)
        if url.startswith("http") and url not in rec.images:
            rec.images.append(url)

    if not rec.sizes:
        for rule in sel.get("sizes") or []:
            selector = rule.get("selector")
            if not selector:
                continue
            try:
                nodes = soup.select(selector)
            except Exception:
                continue
            for node in nodes:
                label = clean_text(node.get(rule["label_attr"]) if rule.get("label_attr") else node.get_text(" ", strip=True))
                if not label:
                    continue
                available: Optional[bool] = None
                if rule.get("available_attr"):
                    available = _availability_to_bool(node.get(rule["available_attr"]))
                if available is None:
                    classes = " ".join(node.get("class") or []).lower()
                    if node.has_attr("disabled") or any(k in classes for k in ("disabled", "sold-out", "unavailable", "esaurit")):
                        available = False
                    elif classes:
                        available = True
                if not any(s.label == label for s in rec.sizes):
                    rec.sizes.append(SizeRecord(label=label, available=available))
            if rec.sizes:
                break

    if rec.breadcrumb is None:
        crumbs = _select_values(soup, sel.get("breadcrumb"))
        if crumbs:
            rec.breadcrumb = " > ".join(crumbs)
            rec.category = rec.category or (crumbs[-2] if len(crumbs) > 1 else crumbs[-1])


# --------------------------------------------------------------------------
# entrypoint
# --------------------------------------------------------------------------

def _source_id(rec: ProductRecord, url: str) -> str:
    if rec.style_code:
        return str(rec.style_code)
    if rec.sku:
        return str(rec.sku)
    path = urlparse(url).path.rstrip("/")
    match = re.search(r"(\d{5,})", path)
    return match.group(1) if match else (path or url)


def finalise_prices(rec: ProductRecord) -> None:
    """Normalizza prezzo/prezzo pieno e calcola lo sconto."""
    if rec.list_price is not None and rec.price is not None and rec.list_price < rec.price:
        # Alcune pagine invertono i due valori: il maggiore e' sempre il pieno.
        rec.price, rec.list_price = rec.list_price, rec.price
    if rec.list_price is not None and rec.price is not None and rec.list_price > rec.price:
        rec.discount_amount = round(rec.list_price - rec.price, 2)
        rec.discount_percent = round(rec.discount_amount / rec.list_price * 100, 2)
        rec.is_discounted = True
    else:
        rec.discount_amount = None
        rec.discount_percent = None
        rec.is_discounted = False
        if rec.list_price is None:
            rec.list_price = rec.price

    if rec.in_stock is None and rec.sizes:
        known = [s.available for s in rec.sizes if s.available is not None]
        if known:
            rec.in_stock = any(known)


def extract_product(
    html: str,
    url: str,
    source: str = "jdsports.it",
    selectors: Optional[dict] = None,
) -> Optional[ProductRecord]:
    """Estrae un prodotto dalla pagina. ``None`` se non sembra una scheda prodotto."""
    soup = BeautifulSoup(html, "lxml")
    selectors = selectors or {}
    rec = ProductRecord(source=source, source_id="", url=url)
    methods: list[str] = []

    node = find_jsonld_product(soup)
    if node:
        _apply_jsonld(rec, node, soup)
        methods.append("jsonld")
        rec.raw["jsonld"] = node

    blobs = extract_state_blobs(html, soup)
    if blobs:
        before = (rec.price, rec.list_price, len(rec.sizes))
        _apply_state(rec, blobs)
        if (rec.price, rec.list_price, len(rec.sizes)) != before:
            methods.append("state")

    before = (rec.name, rec.price, len(rec.sizes), len(rec.images))
    _apply_selectors(rec, soup, selectors, url)
    if (rec.name, rec.price, len(rec.sizes), len(rec.images)) != before:
        methods.append("css")

    if not rec.name and rec.price is None:
        return None

    rec.images = [urljoin(url, i) for i in rec.images]
    rec.gender = _gender_from(rec.breadcrumb, rec.category, rec.name, url)
    rec.source_id = _source_id(rec, url)
    rec.extraction_method = "+".join(methods) or "none"
    finalise_prices(rec)
    return rec
