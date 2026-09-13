from jdscraper.pipeline import estimate_duration, format_duration


def test_duration_scales_linearly_with_url_count():
    assert estimate_duration(100, 3) == 2 * estimate_duration(50, 3)


def test_duration_includes_jitter_not_just_delay():
    # delay 3s + meta' del jitter (0.3) = 3.15s per pagina
    assert estimate_duration(1000, 3) == 3150.0


def test_images_add_the_asset_delay_not_the_page_delay():
    solo_dati = estimate_duration(1000, 3)
    con_immagini = estimate_duration(1000, 3, images_per_product=6)
    extra = con_immagini - solo_dati
    # 6 immagini * 0.275s, non 6 * 3.15s
    assert extra == 1650.0
    assert con_immagini < solo_dati * 2


def test_zero_urls_is_zero_time():
    assert estimate_duration(0, 3) == 0.0


def test_format_duration_picks_sensible_units():
    assert format_duration(45) == "45 secondi"
    assert format_duration(600) == "10 minuti"
    assert format_duration(3600 * 5) == "5.0 ore"
    assert format_duration(3600 * 48) == "2.0 giorni"
