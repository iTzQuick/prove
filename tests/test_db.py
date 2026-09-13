from pathlib import Path

import pytest
from sqlalchemy import select

from jdscraper.config import SiteConfig
from jdscraper.db import init_db, make_session_factory, upsert_product
from jdscraper.export import export, stats
from jdscraper.extract import extract_product
from jdscraper.models import PriceSnapshot, Product

FIXTURES = Path(__file__).parent / "fixtures"
CONFIG = SiteConfig.load("jdsports_it")


@pytest.fixture()
def session_factory(tmp_path):
    engine = init_db(f"sqlite:///{tmp_path}/test.db")
    return make_session_factory(engine)


def record(name="product_jsonld.html", url="https://www.jdsports.it/product/test/16095432/"):
    html = (FIXTURES / name).read_text(encoding="utf-8")
    return extract_product(html, url, source=CONFIG.source, selectors=CONFIG.selectors)


def test_insert_then_update_is_idempotent(session_factory):
    rec = record()
    with session_factory() as session:
        assert upsert_product(session, rec) == "new"
        session.commit()
        assert upsert_product(session, rec) == "updated"
        session.commit()
        products = session.execute(select(Product)).scalars().all()
        assert len(products) == 1
        product = products[0]
        assert product.name == "Nike Air Max 90"
        assert len(product.images) == 2
        assert len(product.sizes) == 3
        # prezzo invariato => nessuno snapshot aggiuntivo
        assert len(product.prices) == 1


def test_price_history_grows_only_on_change(session_factory):
    rec = record()
    with session_factory() as session:
        upsert_product(session, rec)
        session.commit()

        rec.price = 89.99
        rec.list_price = 149.99
        rec.is_discounted = True
        rec.discount_percent = 40.0
        upsert_product(session, rec)
        session.commit()

        snapshots = session.execute(select(PriceSnapshot).order_by(PriceSnapshot.id)).scalars().all()
        assert [s.price for s in snapshots] == [109.99, 89.99]
        product = session.execute(select(Product)).scalar_one()
        assert product.price == 89.99


def test_sizes_are_replaced_not_duplicated(session_factory):
    rec = record()
    with session_factory() as session:
        upsert_product(session, rec)
        session.commit()
        rec.sizes = rec.sizes[:1]
        upsert_product(session, rec)
        session.commit()
        product = session.execute(select(Product)).scalar_one()
        assert [s.label for s in product.sizes] == ["EU 41"]


def test_partial_crawl_does_not_wipe_existing_values(session_factory):
    rec = record()
    with session_factory() as session:
        upsert_product(session, rec)
        session.commit()
        rec.brand = None  # crawl degradato: campo mancante
        upsert_product(session, rec)
        session.commit()
        assert session.execute(select(Product)).scalar_one().brand == "Nike"


def test_export_csv_and_json(session_factory, tmp_path):
    with session_factory() as session:
        upsert_product(session, record())
        upsert_product(session, record("product_css_only.html", "https://www.jdsports.it/product/s/1/"))
        session.commit()

        csv_path = tmp_path / "out.csv"
        assert export(session, csv_path, fmt="csv") == 2
        text = csv_path.read_text(encoding="utf-8")
        assert "Nike Air Max 90" in text and "adidas Samba OG" in text

        json_path = tmp_path / "out.json"
        assert export(session, json_path, fmt="json") == 2
        assert '"is_discounted": true' in json_path.read_text(encoding="utf-8")

        assert export(session, tmp_path / "nike.csv", fmt="csv", brand="nike") == 1


def test_stats(session_factory):
    with session_factory() as session:
        upsert_product(session, record())
        session.commit()
        result = stats(session)
        assert result["prodotti_totali"] == 1
        assert result["in_sconto"] == 1
        assert result["percentuale_in_sconto"] == 100.0
        assert result["top_brand"][0]["brand"] == "Nike"
