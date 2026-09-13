"""Schema del database per il catalogo prodotti.

Il modello e' pensato per essere indipendente dal sito sorgente: ogni riga
porta un campo ``source`` cosi' lo stesso database puo' ospitare piu' store.
La chiave naturale di un prodotto e' la coppia ``(source, source_id)``, dove
``source_id`` e' lo style/PLU code del negozio quando disponibile, altrimenti
l'URL normalizzato.
"""

from __future__ import annotations

import datetime as _dt
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


class Base(DeclarativeBase):
    pass


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)

    # --- identita' -----------------------------------------------------
    source: Mapped[str] = mapped_column(String(64), index=True)
    source_id: Mapped[str] = mapped_column(String(128), index=True)
    url: Mapped[str] = mapped_column(Text)

    # --- anagrafica ----------------------------------------------------
    name: Mapped[Optional[str]] = mapped_column(String(512))
    brand: Mapped[Optional[str]] = mapped_column(String(128), index=True)
    style_code: Mapped[Optional[str]] = mapped_column(String(128), index=True)
    sku: Mapped[Optional[str]] = mapped_column(String(128))
    gtin: Mapped[Optional[str]] = mapped_column(String(64))
    colour: Mapped[Optional[str]] = mapped_column(String(128))
    gender: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    category: Mapped[Optional[str]] = mapped_column(String(256), index=True)
    breadcrumb: Mapped[Optional[str]] = mapped_column(Text)
    description: Mapped[Optional[str]] = mapped_column(Text)

    # --- prezzi --------------------------------------------------------
    currency: Mapped[Optional[str]] = mapped_column(String(8))
    price: Mapped[Optional[float]] = mapped_column(Float, index=True)
    list_price: Mapped[Optional[float]] = mapped_column(Float)
    discount_amount: Mapped[Optional[float]] = mapped_column(Float)
    discount_percent: Mapped[Optional[float]] = mapped_column(Float, index=True)
    is_discounted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    # --- disponibilita' / social proof ---------------------------------
    availability: Mapped[Optional[str]] = mapped_column(String(64))
    in_stock: Mapped[Optional[bool]] = mapped_column(Boolean, index=True)
    rating: Mapped[Optional[float]] = mapped_column(Float)
    review_count: Mapped[Optional[int]] = mapped_column(Integer)

    # --- tracciamento --------------------------------------------------
    first_seen: Mapped[_dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen: Mapped[_dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    extraction_method: Mapped[Optional[str]] = mapped_column(String(64))
    raw: Mapped[Optional[dict]] = mapped_column(JSON)

    images: Mapped[list["ProductImage"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", lazy="selectin"
    )
    sizes: Mapped[list["ProductSize"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", lazy="selectin"
    )
    prices: Mapped[list["PriceSnapshot"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        UniqueConstraint("source", "source_id", name="uq_product_source_id"),
        Index("ix_product_brand_price", "brand", "price"),
    )

    def __repr__(self) -> str:  # pragma: no cover - solo debug
        return f"<Product {self.brand!r} {self.name!r} {self.price!r} {self.currency!r}>"


class ProductImage(Base):
    __tablename__ = "product_images"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    url: Mapped[str] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, default=0)
    local_path: Mapped[Optional[str]] = mapped_column(Text)

    product: Mapped[Product] = relationship(back_populates="images")

    __table_args__ = (UniqueConstraint("product_id", "url", name="uq_image_product_url"),)


class ProductSize(Base):
    __tablename__ = "product_sizes"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(64))
    size_system: Mapped[Optional[str]] = mapped_column(String(32))
    variant_sku: Mapped[Optional[str]] = mapped_column(String(128))
    available: Mapped[Optional[bool]] = mapped_column(Boolean)
    price: Mapped[Optional[float]] = mapped_column(Float)

    product: Mapped[Product] = relationship(back_populates="sizes")

    __table_args__ = (UniqueConstraint("product_id", "label", name="uq_size_product_label"),)


class PriceSnapshot(Base):
    """Storico prezzi: una riga per ogni crawl in cui il prezzo e' cambiato."""

    __tablename__ = "price_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    captured_at: Mapped[_dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    price: Mapped[Optional[float]] = mapped_column(Float)
    list_price: Mapped[Optional[float]] = mapped_column(Float)
    discount_percent: Mapped[Optional[float]] = mapped_column(Float)
    is_discounted: Mapped[bool] = mapped_column(Boolean, default=False)
    in_stock: Mapped[Optional[bool]] = mapped_column(Boolean)

    product: Mapped[Product] = relationship(back_populates="prices")


class CrawlRun(Base):
    __tablename__ = "crawl_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(64))
    started_at: Mapped[_dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[Optional[_dt.datetime]] = mapped_column(DateTime(timezone=True))
    urls_seen: Mapped[int] = mapped_column(Integer, default=0)
    products_new: Mapped[int] = mapped_column(Integer, default=0)
    products_updated: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text)
