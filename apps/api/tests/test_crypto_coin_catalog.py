"""Unit tests for the injected-network CoinGecko coin-list provider."""

import datetime
import json
from unittest.mock import Mock

import pytest

from app.services.crypto_coin_catalog import (
    CoinCatalogUnavailableError,
    CoinGeckoCoinListProvider,
)

_SAMPLE = [
    {"id": "bitcoin", "symbol": "btc", "name": "Bitcoin"},
    {"id": "ethereum", "symbol": "eth", "name": "Ethereum"},
    {"id": "binancecoin", "symbol": "bnb", "name": "BNB"},
]


def _client(payload: list[dict[str, str]] | None = None, *, error: Exception | None = None) -> Mock:
    client = Mock()
    if error is not None:
        client.get.side_effect = error
        return client
    response = Mock()
    response.text = json.dumps(_SAMPLE if payload is None else payload)
    client.get.return_value = response
    return client


def test_search_matches_id_symbol_or_name_case_insensitively() -> None:
    provider = CoinGeckoCoinListProvider(_client(), "https://example.invalid/coins/list")

    by_name = provider.search("ether")
    by_symbol = provider.search("BTC")
    by_id = provider.search("binancecoin")

    assert [c.id for c in by_name] == ["ethereum"]
    assert [c.id for c in by_symbol] == ["bitcoin"]
    assert [c.id for c in by_id] == ["binancecoin"]


def test_empty_query_returns_capped_list() -> None:
    provider = CoinGeckoCoinListProvider(_client(), "https://example.invalid/coins/list")
    assert len(provider.search("", limit=2)) == 2


def test_result_is_capped_at_limit() -> None:
    many = [{"id": f"coin{i}", "symbol": f"c{i}", "name": f"Coin {i}"} for i in range(80)]
    provider = CoinGeckoCoinListProvider(_client(many), "https://example.invalid/coins/list")
    assert len(provider.search("coin", limit=50)) == 50


def test_cache_is_reused_within_ttl() -> None:
    client = _client()
    now = datetime.datetime(2026, 8, 24, tzinfo=datetime.UTC)
    provider = CoinGeckoCoinListProvider(
        client,
        "https://example.invalid/coins/list",
        ttl=datetime.timedelta(hours=1),
        clock=lambda: now,
    )
    provider.search("btc")
    provider.search("eth")
    assert client.get.call_count == 1


def test_refreshes_after_ttl_expires() -> None:
    client = _client()
    times = iter(
        [
            datetime.datetime(2026, 8, 24, 0, 0, tzinfo=datetime.UTC),
            datetime.datetime(2026, 8, 24, 7, 0, tzinfo=datetime.UTC),
        ]
    )
    provider = CoinGeckoCoinListProvider(
        client,
        "https://example.invalid/coins/list",
        ttl=datetime.timedelta(hours=6),
        clock=lambda: next(times),
    )
    provider.search("btc")
    provider.search("btc")
    assert client.get.call_count == 2


def test_offline_failure_falls_back_to_stale_cache() -> None:
    client = _client()
    provider = CoinGeckoCoinListProvider(client, "https://example.invalid/coins/list")
    provider.search("btc")  # populate cache
    client.get.side_effect = TimeoutError("offline")
    # cache is still within TTL by default (no clock advance), so this proves
    # the *code path* tolerates a transport error without raising as long as
    # a cached copy exists; force a refresh attempt by expiring the cache.
    provider._cached_at = datetime.datetime(2020, 1, 1, tzinfo=datetime.UTC)
    result = provider.search("btc")
    assert [c.id for c in result] == ["bitcoin"]


def test_offline_with_no_cache_raises_catalog_unavailable() -> None:
    provider = CoinGeckoCoinListProvider(
        _client(error=TimeoutError("offline")), "https://example.invalid/coins/list"
    )
    with pytest.raises(CoinCatalogUnavailableError):
        provider.search("btc")
