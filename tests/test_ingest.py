"""Test del percorso offline: cartella di pagine salvate -> database."""

from pathlib import Path

import pytest
from bs4 import BeautifulSoup
from sqlalchemy import select

from jdscraper.config import SiteConfig
from jdscraper.db import init_db, make_session_factory
from jdscraper.models import Product
from jdscraper.parsing import find_canonical_url
from jdscraper.pipeline import ingest_directory

FIXTURES = Path(__file__).parent / "fixtures"
CONFIG = SiteConfig.load("jdsports_it")


@pytest.fixture()
def session_factory(tmp_path):
    return make_session_factory(init_db(f"sqlite:///{tmp_path}/ingest.db"))


def test_find_canonical_url_from_link_tag():
    html = '<html><head><link rel="canonical" href="https://www.jdsports.it/product/x/99/"></head></html>'
    assert find_canonical_url(BeautifulSoup(html, "lxml")) == "https://www.jdsports.it/product/x/99/"


def test_find_canonical_url_from_og_url():
    html = '<html><head><meta property="og:url" content="https://www.jdsports.it/product/y/88/"></head></html>'
    assert find_canonical_url(BeautifulSoup(html, "lxml")) == "https://www.jdsports.it/product/y/88/"


def test_find_canonical_url_absent():
    assert find_canonical_url(BeautifulSoup("<html></html>", "lxml")) is None


def test_ingest_directory_imports_products(tmp_path, session_factory):
    pages = tmp_path / "pagine"
    pages.mkdir()
    (pages / "a.html").write_text(
        (FIXTURES / "product_jsonld.html").read_text(encoding="utf-8"), encoding="utf-8"
    )
    (pages / "b.html").write_text(
        (FIXTURES / "product_css_only.html").read_text(encoding="utf-8"), encoding="utf-8"
    )
    (pages / "c.html").write_text(
        (FIXTURES / "not_a_product.html").read_text(encoding="utf-8"), encoding="utf-8"
    )

    summary = ingest_directory(pages, CONFIG, session_factory)
    assert summary.seen == 3
    assert summary.new == 2
    assert summary.not_a_product == 1
    assert summary.failed == 0

    with session_factory() as session:
        names = sorted(p.name for p in session.execute(select(Product)).scalars())
    assert names == ["Nike Air Max 90", "adidas Samba OG"]


def test_sidecar_url_file_is_used(tmp_path, session_factory):
    pages = tmp_path / "pagine"
    pages.mkdir()
    (pages / "a.html").write_text(
        (FIXTURES / "product_css_only.html").read_text(encoding="utf-8"), encoding="utf-8"
    )
    (pages / "a.html.url").write_text("https://www.jdsports.it/product/samba/555111/", encoding="utf-8")

    summary = ingest_directory(pages, CONFIG, session_factory)
    # il file sidecar .url non deve essere scambiato per una pagina
    assert summary.seen == 1 and summary.new == 1
    with session_factory() as session:
        product = session.execute(select(Product)).scalar_one()
    assert product.url == "https://www.jdsports.it/product/samba/555111/"
    # le immagini relative diventano assolute usando l'URL ritrovato
    assert product.images[0].url == "https://www.jdsports.it/media/samba_1.jpg"


def test_canonical_link_survives_a_saved_page(tmp_path, session_factory):
    pages = tmp_path / "pagine"
    pages.mkdir()
    html = (FIXTURES / "product_css_only.html").read_text(encoding="utf-8")
    html = html.replace(
        "<head>", '<head><link rel="canonical" href="https://www.jdsports.it/product/samba/777222/">'
    )
    (pages / "salvata.html").write_text(html, encoding="utf-8")

    ingest_directory(pages, CONFIG, session_factory)
    with session_factory() as session:
        assert session.execute(select(Product)).scalar_one().url.endswith("/777222/")


def test_rerunning_ingest_updates_instead_of_duplicating(tmp_path, session_factory):
    pages = tmp_path / "pagine"
    pages.mkdir()
    (pages / "a.html").write_text(
        (FIXTURES / "product_jsonld.html").read_text(encoding="utf-8"), encoding="utf-8"
    )
    ingest_directory(pages, CONFIG, session_factory)
    summary = ingest_directory(pages, CONFIG, session_factory)
    assert summary.new == 0 and summary.updated == 1
    with session_factory() as session:
        assert session.execute(select(Product)).scalars().all().__len__() == 1


def test_nested_directories_are_walked(tmp_path, session_factory):
    pages = tmp_path / "pagine"
    (pages / "uomo").mkdir(parents=True)
    (pages / "uomo" / "a.html").write_text(
        (FIXTURES / "product_jsonld.html").read_text(encoding="utf-8"), encoding="utf-8"
    )
    assert ingest_directory(pages, CONFIG, session_factory).new == 1
    assert ingest_directory(pages, CONFIG, session_factory, recursive=False).seen == 0
