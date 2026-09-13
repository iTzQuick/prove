import pytest

from jdscraper.parsing import clean_text, detect_currency, deep_find, parse_price


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("€ 1.299,00", 1299.0),
        ("109,99 €", 109.99),
        ("109.99", 109.99),
        ("1.299", 1299.0),
        ("1,299.00", 1299.0),
        ("Prezzo: 89,90€", 89.9),
        ("EUR 45", 45.0),
        (45, 45.0),
        (12.5, 12.5),
        ("", None),
        (None, None),
        ("gratis", None),
    ],
)
def test_parse_price(raw, expected):
    assert parse_price(raw) == expected


def test_detect_currency():
    assert detect_currency("€ 99,00") == "EUR"
    assert detect_currency("EUR") == "EUR"
    assert detect_currency(None, "", "$5") == "USD"
    assert detect_currency(None) is None


def test_clean_text_strips_markup_and_whitespace():
    assert clean_text("  Sneaker <b>Nike</b>\n  Air ") == "Sneaker Nike Air"
    assert clean_text(None) is None
    assert clean_text("   ") is None


def test_deep_find_is_case_and_separator_insensitive():
    blob = {"a": {"b": [{"list_price": "149,99"}]}}
    assert deep_find(blob, ("listPrice",)) == "149,99"
    assert deep_find(blob, ("wasPrice",)) is None
