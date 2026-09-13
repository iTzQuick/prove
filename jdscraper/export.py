"""Esportazione del catalogo in CSV / JSON."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Product

COLUMNS = [
    "id", "source", "source_id", "url", "name", "brand", "style_code", "sku",
    "colour", "gender", "category", "breadcrumb", "currency", "price",
    "list_price", "discount_amount", "discount_percent", "is_discounted",
    "availability", "in_stock", "rating", "review_count", "first_seen", "last_seen",
]


def _row(product: Product) -> dict:
    row = {c: getattr(product, c) for c in COLUMNS}
    row["first_seen"] = product.first_seen.isoformat() if product.first_seen else None
    row["last_seen"] = product.last_seen.isoformat() if product.last_seen else None
    row["images"] = [i.url for i in sorted(product.images, key=lambda i: i.position)]
    row["sizes"] = [
        {"label": s.label, "available": s.available, "sku": s.variant_sku} for s in product.sizes
    ]
    return row


def _query(session: Session, only_discounted: bool, brand: Optional[str]):
    stmt = select(Product)
    if only_discounted:
        stmt = stmt.where(Product.is_discounted.is_(True))
    if brand:
        stmt = stmt.where(func.lower(Product.brand) == brand.lower())
    return session.execute(stmt.order_by(Product.brand, Product.name)).scalars().all()


def export(
    session: Session,
    out_path: Path,
    fmt: str = "csv",
    only_discounted: bool = False,
    brand: Optional[str] = None,
) -> int:
    products = _query(session, only_discounted, brand)
    rows = [_row(p) for p in products]
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if fmt == "json":
        out_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    else:
        with out_path.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=COLUMNS + ["images", "sizes"])
            writer.writeheader()
            for row in rows:
                row = dict(row)
                row["images"] = " | ".join(row["images"])
                row["sizes"] = " | ".join(
                    f"{s['label']}{'' if s['available'] is None else ('✓' if s['available'] else '✗')}"
                    for s in row["sizes"]
                )
                writer.writerow(row)
    return len(rows)


def stats(session: Session) -> dict:
    total = session.execute(select(func.count(Product.id))).scalar_one()
    discounted = session.execute(
        select(func.count(Product.id)).where(Product.is_discounted.is_(True))
    ).scalar_one()
    brands = session.execute(
        select(Product.brand, func.count(Product.id))
        .group_by(Product.brand)
        .order_by(func.count(Product.id).desc())
        .limit(15)
    ).all()
    avg_price = session.execute(select(func.avg(Product.price))).scalar_one()
    avg_disc = session.execute(
        select(func.avg(Product.discount_percent)).where(Product.is_discounted.is_(True))
    ).scalar_one()
    return {
        "prodotti_totali": total,
        "in_sconto": discounted,
        "percentuale_in_sconto": round(discounted / total * 100, 1) if total else 0.0,
        "prezzo_medio": round(avg_price, 2) if avg_price else None,
        "sconto_medio_percento": round(avg_disc, 1) if avg_disc else None,
        "top_brand": [{"brand": b or "(sconosciuto)", "prodotti": c} for b, c in brands],
    }
