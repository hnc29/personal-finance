"""Unit tests for the USD/VND rate provider (see app/services/fx_rate.py).

Mirrors test_crypto_coin_catalog-style tests: injected Mock HTTP client and
a fake clock, no real network call.
"""

import datetime
import json
from decimal import Decimal
from unittest.mock import Mock

import pytest

from app.services.fx_rate import FxRateUnavailableError, UsdVndRateProvider


def _response(payload: dict) -> Mock:
    response = Mock()
    response.text = json.dumps(payload)
    return response


def test_fetches_and_caches_the_usd_vnd_rate() -> None:
    response = _response({"result": "success", "rates": {"USD": 1, "VND": "26123.45"}})
    client = Mock()
    client.get.return_value = response
    now = datetime.datetime(2026, 8, 26, 10, tzinfo=datetime.UTC)
    provider = UsdVndRateProvider(client, "https://fx.example.invalid/latest/USD", clock=lambda: now)

    rate = provider.get_rate()

    assert rate.rate == Decimal("26123.45")
    assert rate.as_of == now
    assert rate.source == "open.er-api.com"
    client.get.assert_called_once_with(
        "https://fx.example.invalid/latest/USD", params={}, timeout=10.0
    )


def test_second_call_within_ttl_does_not_refetch() -> None:
    response = _response({"rates": {"VND": "26000"}})
    client = Mock()
    client.get.return_value = response
    clock_value = datetime.datetime(2026, 8, 26, 10, tzinfo=datetime.UTC)
    provider = UsdVndRateProvider(
        client, "https://fx.example.invalid/latest/USD", ttl=datetime.timedelta(hours=1), clock=lambda: clock_value
    )

    provider.get_rate()
    clock_value = clock_value + datetime.timedelta(minutes=30)
    provider.get_rate()

    assert client.get.call_count == 1


def test_refetches_once_ttl_has_elapsed() -> None:
    client = Mock()
    client.get.side_effect = [
        _response({"rates": {"VND": "26000"}}),
        _response({"rates": {"VND": "26500"}}),
    ]
    now = datetime.datetime(2026, 8, 26, 10, tzinfo=datetime.UTC)
    state = {"now": now}
    provider = UsdVndRateProvider(
        client,
        "https://fx.example.invalid/latest/USD",
        ttl=datetime.timedelta(hours=1),
        clock=lambda: state["now"],
    )

    first = provider.get_rate()
    state["now"] = now + datetime.timedelta(hours=2)
    second = provider.get_rate()

    assert first.rate == Decimal(26000)
    assert second.rate == Decimal(26500)
    assert client.get.call_count == 2


def test_stale_cache_is_served_when_a_refresh_transiently_fails() -> None:
    client = Mock()
    client.get.side_effect = [
        _response({"rates": {"VND": "26000"}}),
        RuntimeError("network down"),
    ]
    now = datetime.datetime(2026, 8, 26, 10, tzinfo=datetime.UTC)
    state = {"now": now}
    provider = UsdVndRateProvider(
        client,
        "https://fx.example.invalid/latest/USD",
        ttl=datetime.timedelta(hours=1),
        clock=lambda: state["now"],
    )

    provider.get_rate()
    state["now"] = now + datetime.timedelta(hours=2)
    rate = provider.get_rate()

    assert rate.rate == Decimal(26000)


def test_raises_when_unavailable_and_nothing_cached() -> None:
    client = Mock()
    client.get.side_effect = RuntimeError("network down")
    provider = UsdVndRateProvider(client, "https://fx.example.invalid/latest/USD")

    with pytest.raises(FxRateUnavailableError):
        provider.get_rate()


def test_raises_on_missing_vnd_key() -> None:
    client = Mock()
    client.get.return_value = _response({"rates": {"USD": 1}})
    provider = UsdVndRateProvider(client, "https://fx.example.invalid/latest/USD")

    with pytest.raises(FxRateUnavailableError):
        provider.get_rate()


def test_raises_on_nonpositive_rate() -> None:
    client = Mock()
    client.get.return_value = _response({"rates": {"VND": "0"}})
    provider = UsdVndRateProvider(client, "https://fx.example.invalid/latest/USD")

    with pytest.raises(FxRateUnavailableError):
        provider.get_rate()
