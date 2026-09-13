from pathlib import Path

import pytest

from jdscraper.config import SiteConfig
from jdscraper.extract import extract_product

FIXTURES = Path(__file__).parent / "fixtures"
CONFIG = SiteConfig.load("jdsports_it")


def load(name: str, url: str = "https://www.jdsports.it/product/test/16095432/"):
    html = (FIXTURES / name).read_text(encoding="utf-8")
    return extract_product(html, url, source=CONFIG.source, selectors=CONFIG.selectors)


@pytest.fixture(scope="module")
def jsonld_record():
    return load("product_jsonld.html")


@pytest.fixture(scope="module")
def css_record():
    return load("product_css_only.html", "https://www.jdsports.it/product/adidas-samba/17001122/")


def test_jsonld_core_fields(jsonld_record):
    rec = jsonld_record
    assert rec.name == "Nike Air Max 90"
    assert rec.brand == "Nike"
    assert rec.style_code == "CN8490-100"
    assert rec.sku == "16095432"
    assert rec.colour == "Bianco/Nero"
    assert rec.description == "Sneaker Nike Air Max 90 in pelle e mesh."
    assert rec.rating == 4.6
    assert rec.review_count == 238
    assert "jsonld" in rec.extraction_method


def test_jsonld_prices_and_discount(jsonld_record):
    rec = jsonld_record
    assert rec.currency == "EUR"
    assert rec.price == 109.99
    assert rec.list_price == 149.99
    assert rec.is_discounted is True
    assert rec.discount_amount == 40.0
    assert rec.discount_percent == pytest.approx(26.67, abs=0.01)


def test_jsonld_sizes_and_stock(jsonld_record):
    labels = {s.label: s.available for s in jsonld_record.sizes}
    assert labels == {"EU 41": True, "EU 42": True, "EU 43": False}
    assert jsonld_record.in_stock is True
    assert jsonld_record.sizes[0].variant_sku == "16095432-41"


def test_jsonld_images_and_breadcrumb(jsonld_record):
    assert jsonld_record.images == [
        "https://images.example.com/16095432_a.jpg",
        "https://images.example.com/16095432_b.jpg",
    ]
    assert jsonld_record.breadcrumb == "Home > Uomo > Scarpe > Nike Air Max 90"
    assert jsonld_record.category == "Scarpe"
    assert jsonld_record.gender == "men"


def test_css_fallback_without_jsonld(css_record):
    rec = css_record
    assert rec.name == "adidas Samba OG"
    assert rec.brand == "adidas"
    assert rec.price == 89.9
    assert rec.list_price == 120.0
    assert rec.is_discounted is True
    assert rec.discount_percent == pytest.approx(25.08, abs=0.01)
    assert rec.currency == "EUR"
    assert rec.gender == "women"
    assert rec.colour == "Nero/Bianco"


def test_css_fallback_relative_images_are_absolutised(css_record):
    assert css_record.images == [
        "https://www.jdsports.it/media/samba_1.jpg",
        "https://www.jdsports.it/media/samba_2.jpg",
    ]


def test_state_blob_supplies_sizes_and_style_code(css_record):
    assert css_record.style_code == "IE3438"
    assert {s.label: s.available for s in css_record.sizes} == {
        "EU 36": True, "EU 37": True, "EU 38": False
    }


def test_source_id_falls_back_to_url_digits():
    rec = load("product_css_only.html", "https://www.jdsports.it/product/x/17001122/")
    # lo style code ha la precedenza sull'ID estratto dall'URL
    assert rec.source_id == "IE3438"


def test_non_product_page_returns_none():
    assert load("not_a_product.html") is None


def test_swapped_prices_are_normalised():
    html = """<html><body><h1 class="itemTitle">Test</h1>
    <div class="pdp-price"><span class="was">€ 50,00</span><span class="pri">€ 80,00</span></div>
    </body></html>"""
    rec = extract_product(html, "https://www.jdsports.it/product/a/1/", selectors=CONFIG.selectors)
    assert rec.price == 50.0 and rec.list_price == 80.0 and rec.is_discounted is True


def test_full_price_product_is_not_flagged_as_discounted():
    html = """<html><body><h1 class="itemTitle">Test</h1>
    <div class="pdp-price"><span class="pri">€ 80,00</span></div></body></html>"""
    rec = extract_product(html, "https://www.jdsports.it/product/a/1/", selectors=CONFIG.selectors)
    assert rec.is_discounted is False
    assert rec.discount_percent is None
    assert rec.list_price == 80.0
