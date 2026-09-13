"""Test offline del client HTTP: nessuna richiesta di rete reale."""

import pytest
import requests

from jdscraper.fetcher import Fetcher, RateLimiter, RobotsDisallowed


class FakeResponse:
    def __init__(self, text="", status_code=200, headers=None):
        self.text = text
        self.status_code = status_code
        self.headers = headers or {}
        self.content = text.encode()


class FakeSession:
    def __init__(self, routes):
        self.routes = routes
        self.headers = {}
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append(url)
        if url not in self.routes:
            raise requests.RequestException(f"no route: {url}")
        return self.routes[url]

    def close(self):
        pass


ROBOTS = """User-agent: *
Disallow: /checkout/
Disallow: /search
Crawl-delay: 7
Sitemap: https://shop.test/sitemap.xml
"""


def make_fetcher(robots_text=ROBOTS, robots_status=200, extra_routes=None):
    fetcher = Fetcher(user_agent="testbot", delay=0)
    routes = {"https://shop.test/robots.txt": FakeResponse(robots_text, robots_status)}
    routes.update(extra_routes or {})
    fetcher.session = FakeSession(routes)
    return fetcher


def test_allowed_and_disallowed_paths():
    fetcher = make_fetcher()
    assert fetcher.can_fetch("https://shop.test/product/abc/") is True
    assert fetcher.can_fetch("https://shop.test/checkout/cart") is False
    assert fetcher.can_fetch("https://shop.test/search?q=nike") is False


def test_get_refuses_disallowed_url_without_requesting_it():
    fetcher = make_fetcher()
    with pytest.raises(RobotsDisallowed):
        fetcher.get("https://shop.test/checkout/cart")
    assert "https://shop.test/checkout/cart" not in fetcher.session.calls
    assert fetcher.stats.blocked_by_robots == 1


def test_crawl_delay_from_robots_raises_local_delay():
    fetcher = make_fetcher()
    fetcher.limiter.delay = 1.0
    fetcher.apply_robots_delay("https://shop.test/")
    assert fetcher.limiter.delay == 7.0


def test_lower_declared_delay_never_lowers_our_own():
    fetcher = make_fetcher("User-agent: *\nCrawl-delay: 0.5\n")
    fetcher.limiter.delay = 3.0
    fetcher.apply_robots_delay("https://shop.test/")
    assert fetcher.limiter.delay == 3.0


def test_unreachable_robots_blocks_everything():
    fetcher = Fetcher(user_agent="testbot", delay=0)
    fetcher.session = FakeSession({})  # ogni richiesta solleva RequestException
    assert fetcher.can_fetch("https://shop.test/product/abc/") is False


def test_forbidden_robots_blocks_everything():
    fetcher = make_fetcher(robots_text="", robots_status=403)
    assert fetcher.can_fetch("https://shop.test/product/abc/") is False


def test_missing_robots_allows_crawling():
    fetcher = make_fetcher(robots_text="", robots_status=404)
    assert fetcher.can_fetch("https://shop.test/product/abc/") is True


def test_robots_is_fetched_once_per_host():
    fetcher = make_fetcher()
    for _ in range(5):
        fetcher.can_fetch("https://shop.test/product/abc/")
    assert fetcher.session.calls.count("https://shop.test/robots.txt") == 1


def test_successful_get_records_stats():
    page = FakeResponse("<html>ok</html>")
    fetcher = make_fetcher(extra_routes={"https://shop.test/product/abc/": page})
    resp = fetcher.get("https://shop.test/product/abc/")
    assert resp.status_code == 200
    assert fetcher.stats.requests == 1
    assert fetcher.stats.bytes_downloaded == len(page.content)


def test_network_error_is_retried_then_gives_up():
    fetcher = make_fetcher()
    fetcher.max_retries = 2
    assert fetcher.get("https://shop.test/missing") is None
    assert fetcher.session.calls.count("https://shop.test/missing") == 2
    assert fetcher.stats.errors == 1


def test_rate_limiter_serialises_calls():
    import time
    limiter = RateLimiter(delay=0.05, jitter=0)
    start = time.monotonic()
    for _ in range(3):
        limiter.wait()
    assert time.monotonic() - start >= 0.1
