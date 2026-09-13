"""Accesso al database: creazione schema e upsert dei prodotti."""

from __future__ import annotations

import logging
from typing import Literal, Optional

from sqlalchemy import create_engine, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from .extract import ProductRecord
from .models import Base, PriceSnapshot, Product, ProductImage, ProductSize, utcnow

log = logging.getLogger(__name__)

UpsertResult = Literal["new", "updated"]

_SCALAR_FIELDS = (
    "url", "name", "brand", "style_code", "sku", "gtin", "colour", "gender",
    "category", "breadcrumb", "description", "currency", "price", "list_price",
    "discount_amount", "discount_percent", "is_discounted", "availability",
    "in_stock", "rating", "review_count", "extraction_method",
)


def init_db(database_url: str, echo: bool = False) -> Engine:
    """Crea l'engine e le tabelle mancanti."""
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    engine = create_engine(database_url, echo=echo, future=True, connect_args=connect_args)
    Base.metadata.create_all(engine)
    return engine


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False, future=True)


def _price_changed(product: Product, rec: ProductRecord) -> bool:
    last = max(product.prices, key=lambda p: p.captured_at) if product.prices else None
    if last is None:
        return True
    return (
        last.price != rec.price
        or last.list_price != rec.list_price
        or last.is_discounted != rec.is_discounted
        or last.in_stock != rec.in_stock
    )


def upsert_product(session: Session, rec: ProductRecord) -> UpsertResult:
    """Inserisce o aggiorna un prodotto, mantenendo lo storico prezzi.

    Immagini e taglie vengono riscritte da zero a ogni passaggio (sono la foto
    dello stato attuale), mentre ``price_history`` cresce solo quando prezzo,
    sconto o disponibilita' cambiano davvero.
    """
    stmt = select(Product).where(Product.source == rec.source, Product.source_id == rec.source_id)
    product: Optional[Product] = session.execute(stmt).scalar_one_or_none()
    result: UpsertResult = "updated"

    if product is None:
        product = Product(source=rec.source, source_id=rec.source_id)
        session.add(product)
        result = "new"

    price_changed = _price_changed(product, rec) if result == "updated" else True

    for field in _SCALAR_FIELDS:
        value = getattr(rec, field)
        # Non sovrascrivere un dato buono con un None di un crawl parziale.
        if value is not None or getattr(product, field, None) is None:
            setattr(product, field, value)

    product.raw = rec.raw or None
    product.last_seen = utcnow()

    # Le collezioni figlie vanno svuotate e scaricate PRIMA di reinserirle:
    # in un unico flush SQLAlchemy emetterebbe gli INSERT prima dei DELETE,
    # violando i vincoli UNIQUE su (product_id, url) e (product_id, label).
    if result == "updated":
        product.images.clear()
        product.sizes.clear()
        session.flush()

    product.images = [
        ProductImage(url=url, position=i) for i, url in enumerate(dict.fromkeys(rec.images))
    ]

    seen_labels: set[str] = set()
    sizes: list[ProductSize] = []
    for size in rec.sizes:
        if size.label in seen_labels:
            continue
        seen_labels.add(size.label)
        sizes.append(
            ProductSize(
                label=size.label,
                size_system=size.size_system,
                variant_sku=size.variant_sku,
                available=size.available,
                price=size.price,
            )
        )
    product.sizes = sizes

    if price_changed:
        product.prices.append(
            PriceSnapshot(
                price=rec.price,
                list_price=rec.list_price,
                discount_percent=rec.discount_percent,
                is_discounted=rec.is_discounted,
                in_stock=rec.in_stock,
            )
        )

    session.flush()
    return result
