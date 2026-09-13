"""Utility di parsing: prezzi, JSON-LD, blob di stato JS."""

from __future__ import annotations

import json
import re
from typing import Any, Iterable, Iterator, Optional

_CURRENCY_SYMBOLS = {"€": "EUR", "£": "GBP", "$": "USD"}
_NUM_RE = re.compile(r"\d[\d.\s ']*(?:[.,]\d+)?")


def parse_price(value: Any) -> Optional[float]:
    """Converte una stringa prezzo in float, gestendo il formato italiano.

    Accetta ``"€ 1.299,00"``, ``"109,99 €"``, ``"109.99"``, ``1299`` ecc.
    Restituisce ``None`` se non c'e' nessun numero riconoscibile.
    """
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)

    text = str(value).strip()
    if not text:
        return None

    match = _NUM_RE.search(text)
    if not match:
        return None
    num = re.sub(r"[\s ']", "", match.group(0))

    has_dot, has_comma = "." in num, "," in num
    if has_dot and has_comma:
        # L'ultimo separatore che compare e' quello decimale.
        dec_sep = "," if num.rfind(",") > num.rfind(".") else "."
        thou_sep = "." if dec_sep == "," else ","
        num = num.replace(thou_sep, "").replace(dec_sep, ".")
    elif has_comma:
        num = num.replace(",", ".") if re.search(r",\d{1,2}$", num) else num.replace(",", "")
    elif has_dot:
        # "1.299" senza decimali e' un separatore di migliaia.
        if not re.search(r"\.\d{1,2}$", num):
            num = num.replace(".", "")

    try:
        return float(num)
    except ValueError:
        return None


def detect_currency(*candidates: Any) -> Optional[str]:
    """Ricava il codice valuta da un codice ISO esplicito o da un simbolo."""
    for cand in candidates:
        if not cand:
            continue
        text = str(cand).strip()
        if re.fullmatch(r"[A-Z]{3}", text):
            return text
        for symbol, code in _CURRENCY_SYMBOLS.items():
            if symbol in text:
                return code
    return None


def clean_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        value = " ".join(str(v) for v in value if v)
    text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", str(value))).strip()
    return text or None


def iter_jsonld(soup) -> Iterator[dict]:
    """Restituisce tutti i nodi JSON-LD della pagina, appiattendo ``@graph``."""
    for tag in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw = tag.string or tag.get_text() or ""
        raw = raw.strip()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            # Alcuni siti emettono JSON-LD con virgole finali o commenti HTML.
            cleaned = re.sub(r"<!--.*?-->", "", raw, flags=re.S)
            cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)
            try:
                data = json.loads(cleaned)
            except json.JSONDecodeError:
                continue
        yield from _flatten_jsonld(data)


def _flatten_jsonld(data: Any) -> Iterator[dict]:
    if isinstance(data, list):
        for item in data:
            yield from _flatten_jsonld(item)
    elif isinstance(data, dict):
        if "@graph" in data:
            yield from _flatten_jsonld(data["@graph"])
        yield data


def has_type(node: dict, wanted: str) -> bool:
    types = node.get("@type") or node.get("type") or []
    if isinstance(types, str):
        types = [types]
    return any(str(t).lower() == wanted.lower() for t in types)


def find_jsonld_product(soup) -> Optional[dict]:
    for node in iter_jsonld(soup):
        if has_type(node, "Product"):
            return node
    return None


def find_jsonld_breadcrumb(soup) -> Optional[list[str]]:
    for node in iter_jsonld(soup):
        if not has_type(node, "BreadcrumbList"):
            continue
        items = node.get("itemListElement") or []
        crumbs: list[str] = []
        for item in items if isinstance(items, list) else []:
            if not isinstance(item, dict):
                continue
            name = item.get("name")
            if not name and isinstance(item.get("item"), dict):
                name = item["item"].get("name")
            name = clean_text(name)
            if name:
                crumbs.append(name)
        if crumbs:
            return crumbs
    return None


_STATE_PATTERNS = (
    re.compile(r"window\.__INITIAL_STATE__\s*=\s*(\{.*?\})\s*;?\s*</script>", re.S),
    re.compile(r"window\.__PRELOADED_STATE__\s*=\s*(\{.*?\})\s*;?\s*</script>", re.S),
    re.compile(r"window\.__NUXT__\s*=\s*(\{.*?\})\s*;?\s*</script>", re.S),
)


def extract_state_blobs(html: str, soup=None) -> list[dict]:
    """Estrae i blob JSON che i framework moderni inseriscono nella pagina.

    Copre ``__NEXT_DATA__`` (tag script con id) e le assegnazioni a ``window.*``
    usate da Nuxt/Redux. Utile quando il sito rende i dati lato client e il
    JSON-LD e' assente o parziale.
    """
    blobs: list[dict] = []
    if soup is not None:
        for tag in soup.find_all("script", attrs={"type": "application/json"}):
            raw = (tag.string or tag.get_text() or "").strip()
            if not raw:
                continue
            try:
                blobs.append(json.loads(raw))
            except json.JSONDecodeError:
                continue
    for pattern in _STATE_PATTERNS:
        for match in pattern.finditer(html):
            try:
                blobs.append(json.loads(match.group(1)))
            except json.JSONDecodeError:
                continue
    return [b for b in blobs if isinstance(b, dict)]


def deep_find(data: Any, keys: Iterable[str], _depth: int = 0) -> Optional[Any]:
    """Cerca in profondita' la prima chiave presente in ``keys``.

    Le chiavi sono confrontate senza distinzione di maiuscole e di ``_``/``-``,
    cosi' ``list_price`` intercetta anche ``listPrice`` e ``ListPrice``.
    """
    if _depth > 12:
        return None
    wanted = {re.sub(r"[_\-\s]", "", k).lower() for k in keys}
    if isinstance(data, dict):
        for key, value in data.items():
            if re.sub(r"[_\-\s]", "", str(key)).lower() in wanted and value not in (None, "", [], {}):
                return value
        for value in data.values():
            found = deep_find(value, keys, _depth + 1)
            if found is not None:
                return found
    elif isinstance(data, list):
        for item in data:
            found = deep_find(item, keys, _depth + 1)
            if found is not None:
                return found
    return None
