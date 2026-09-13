"""Test dell'estrazione multi-prodotto dalle pagine di categoria."""

from pathlib import Path

import pytest
from sqlalchemy import select

from jdscraper.config import SiteConfig
from jdscraper.db import init_db, make_session_factory, upsert_product
from jdscraper.extract import extract_product
from jdscraper.listing import bump_page_param, extract_listing
from jdscraper.models import Product
from jdscraper.pipeline import harvest_listings

FIXTURES = Path(__file__).parent / "fixtures"
CONFIG = SiteConfig.load("jdsports_it")
BASE = "https://www.jdsports.it/uomo/scarpe-uomo/"


def load(name, url=BASE):
    html = (FIXTURES / name).read_text(encoding="utf-8")
    return extract_listing(html, url, source=CONFIG.source, selectors=CONFIG.selectors)


def test_jsonld_listing_yields_every_product():
    records, _ = load("listing_jsonld.html")
    assert [r.name for r in records] == ["Nike Air Max 90", "adidas Samba OG", "New Balance 550"]
    assert [r.brand for r in records] == ["Nike", "adidas", "New Balance"]


def test_jsonld_listing_prices_and_discounts():
    records, _ = load("listing_jsonld.html")
    by_name = {r.name: r for r in records}
    nike = by_name["Nike Air Max 90"]
    assert (nike.price, nike.list_price, nike.is_discounted) == (109.99, 149.99, True)
    assert nike.discount_percent == pytest.approx(26.67, abs=0.01)
    # senza prezzo pieno non si inventa uno sconto
    assert by_name["adidas Samba OG"].is_discounted is False
    # wasPrice e' un sinonimo accettato di listPrice
    assert by_name["New Balance 550"].list_price == 129.99


def test_listing_urls_are_absolutised_and_ids_derived():
    records, _ = load("listing_jsonld.html")
    assert records[0].url == "https://www.jdsports.it/product/nike-air-max-90/16095432/"
    assert records[0].source_id == "16095432"


def test_next_page_from_link_rel():
    _, next_url = load("listing_jsonld.html")
    assert next_url == "https://www.jdsports.it/uomo/scarpe-uomo/?page=2"


def test_css_listing_and_next_selector():
    records, next_url = load("listing_css.html", "https://www.jdsports.it/donna/scarpe-donna/")
    assert {r.name for r in records} == {"Puma Suede Classic", "Vans Old Skool"}
    assert next_url == "https://www.jdsports.it/donna/scarpe-donna/?page=2"


def test_duplicate_cards_are_collapsed():
    records, _ = load("listing_css.html", "https://www.jdsports.it/donna/scarpe-donna/")
    assert len(records) == 2  # la terza card ripete il primo prodotto


def test_css_listing_reads_prices_and_images():
    records, _ = load("listing_css.html", "https://www.jdsports.it/donna/scarpe-donna/")
    puma = next(r for r in records if r.brand == "Puma")
    assert (puma.price, puma.list_price, puma.is_discounted) == (62.99, 90.0, True)
    assert puma.images == ["https://www.jdsports.it/media/puma.jpg"]


def test_non_listing_page_yields_nothing():
    records, _ = load("not_a_product.html")
    assert records == []


@pytest.mark.parametrize("url,page,expected", [
    ("https://x.it/c/", 2, "https://x.it/c/?page=2"),
    ("https://x.it/c/?sort=new", 3, "https://x.it/c/?sort=new&page=3"),
    ("https://x.it/c/?page=1", 5, "https://x.it/c/?page=5"),
])
def test_bump_page_param(url, page, expected):
    assert bump_page_param(url, page) == expected


# --------------------------------------------------------------------------
# integrazione: harvest -> enrich
# --------------------------------------------------------------------------

class FakeResponse:
    def __init__(self, text):
        self.text = text
        self.status_code = 200
        self.headers = {}
        self.content = text.encode()


class FakeFetcher:
    """Fetcher finto: serve fixture, conta le richieste, nessuna rete."""

    def __init__(self, routes):
        self.routes = routes
        self.calls = []

    def get(self, url, asset=False, **kwargs):
        self.calls.append(url)
        return self.routes.get(url)


@pytest.fixture()
def session_factory(tmp_path):
    return make_session_factory(init_db(f"sqlite:///{tmp_path}/h.db"))


def test_harvest_walks_pages_until_exhausted(session_factory):
    page1 = (FIXTURES / "listing_jsonld.html").read_text(encoding="utf-8")
    page2 = (FIXTURES / "listing_css.html").read_text(encoding="utf-8").replace(
        '<a class="pagination__next" href="/donna/scarpe-donna/?page=2">Avanti</a>', "")
    fetcher = FakeFetcher({
        BASE: FakeResponse(page1),
        BASE + "?page=2": FakeResponse(page2),
    })

    summary = harvest_listings([BASE], CONFIG, fetcher, session_factory)
    assert summary.seen == 2           # due richieste
    assert summary.new == 5            # cinque prodotti raccolti
    assert summary.failed == 0

    with session_factory() as session:
        assert session.execute(select(Product)).scalars().all().__len__() == 5


def test_harvest_yields_many_products_per_request(session_factory):
    fetcher = FakeFetcher({BASE: FakeResponse((FIXTURES / "listing_jsonld.html").read_text("utf-8"))})
    summary = harvest_listings([BASE], CONFIG, fetcher, session_factory, max_pages_per_category=1)
    assert summary.new / summary.seen == 3.0


def test_listing_data_survives_later_enrichment(session_factory):
    """Il dettaglio aggiunge le taglie senza perdere quanto visto nel listing."""
    fetcher = FakeFetcher({BASE: FakeResponse((FIXTURES / "listing_jsonld.html").read_text("utf-8"))})
    harvest_listings([BASE], CONFIG, fetcher, session_factory, max_pages_per_category=1)

    with session_factory() as session:
        nike = session.execute(
            select(Product).where(Product.source_id == "16095432")).scalar_one()
        assert nike.sizes == []                       # il listing non porta taglie
        assert nike.price == 109.99
        assert len(nike.images) == 1

        pdp = extract_product(
            (FIXTURES / "product_jsonld.html").read_text("utf-8"),
            "https://www.jdsports.it/product/nike-air-max-90/16095432/",
            source=CONFIG.source, selectors=CONFIG.selectors,
        )
        pdp.source_id = "16095432"
        upsert_product(session, pdp)
        session.commit()

        nike = session.execute(
            select(Product).where(Product.source_id == "16095432")).scalar_one()
        assert len(nike.sizes) == 3                   # ora ci sono
        assert nike.rating == 4.6                     # e i campi del dettaglio
        assert nike.price == 109.99                   # senza perdere il prezzo


def test_enrichment_does_not_wipe_sizes_on_a_later_listing_pass(session_factory):
    """Un secondo giro di listing non deve cancellare le taglie gia' raccolte."""
    with session_factory() as session:
        pdp = extract_product(
            (FIXTURES / "product_jsonld.html").read_text("utf-8"),
            "https://www.jdsports.it/product/nike-air-max-90/16095432/",
            source=CONFIG.source, selectors=CONFIG.selectors,
        )
        pdp.source_id = "16095432"
        upsert_product(session, pdp)
        session.commit()

    fetcher = FakeFetcher({BASE: FakeResponse((FIXTURES / "listing_jsonld.html").read_text("utf-8"))})
    harvest_listings([BASE], CONFIG, fetcher, session_factory, max_pages_per_category=1)

    with session_factory() as session:
        nike = session.execute(
            select(Product).where(Product.source_id == "16095432")).scalar_one()
        assert len(nike.sizes) == 3


def test_guessed_pagination_stops_without_wasting_requests(session_factory):
    """Senza link 'avanti' si costruisce ?page=N, fermandosi alla prima vuota."""
    page1 = (FIXTURES / "listing_jsonld.html").read_text("utf-8").replace(
        '<link rel="next" href="/uomo/scarpe-uomo/?page=2">', "")
    page2 = (FIXTURES / "listing_css.html").read_text("utf-8").replace(
        '<a class="pagination__next" href="/donna/scarpe-donna/?page=2">Avanti</a>', "")
    fetcher = FakeFetcher({
        BASE: FakeResponse(page1),
        BASE + "?page=2": FakeResponse(page2),
        # ?page=3 non esiste: il fetcher finto restituisce None
    })

    summary = harvest_listings([BASE], CONFIG, fetcher, session_factory)
    assert summary.new == 5
    assert summary.seen == 2      # la pagina inesistente non conta come lavoro
    assert summary.failed == 0    # ne' come errore


def test_explicit_next_link_is_not_second_guessed(session_factory):
    """Con il link 'avanti' non si tenta ?page=N a fine categoria."""
    page2 = (FIXTURES / "listing_css.html").read_text("utf-8").replace(
        '<a class="pagination__next" href="/donna/scarpe-donna/?page=2">Avanti</a>', "")
    fetcher = FakeFetcher({
        BASE: FakeResponse((FIXTURES / "listing_jsonld.html").read_text("utf-8")),
        BASE + "?page=2": FakeResponse(page2),
    })
    harvest_listings([BASE], CONFIG, fetcher, session_factory)
    assert BASE + "?page=3" not in fetcher.calls
