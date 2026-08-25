"""CoinGecko coin-list lookup, with the network boundary injected for tests.

TASK-031 §11.1: crypto identity is the CoinGecko coin id, not a hard-coded
symbol, so users need to search the full coin list rather than type an id
blind. This module fetches and caches ``/coins/list`` in memory (no
background loop -- refresh happens lazily on the next search past the TTL)
and exposes a simple case-insensitive search over id/symbol/name.
"""

from __future__ import annotations

import datetime
import json
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Protocol

DEFAULT_COINGECKO_COINS_URL = "https://api.coingecko.com/api/v3/coins/list"


@dataclass(frozen=True)
class CoinSummary:
    id: str
    symbol: str
    name: str


class CoinCatalogUnavailableError(RuntimeError):
    """Raised when no coin list -- fresh or cached -- can be served."""


class HttpResponse(Protocol):
    text: str

    def raise_for_status(self) -> None: ...


class HttpClient(Protocol):
    def get(
        self, url: str, *, params: Mapping[str, str], timeout: float
    ) -> HttpResponse: ...


def _default_clock() -> datetime.datetime:
    return datetime.datetime.now(datetime.UTC)


class CoinGeckoCoinListProvider:
    """In-memory cached coin list with an injected HTTP client and clock."""

    def __init__(
        self,
        client: HttpClient,
        url: str = DEFAULT_COINGECKO_COINS_URL,
        *,
        ttl: datetime.timedelta = datetime.timedelta(hours=6),
        timeout: float = 10.0,
        clock: Callable[[], datetime.datetime] | None = None,
    ) -> None:
        self._client = client
        self._url = url
        self._ttl = ttl
        self._timeout = timeout
        self._clock = clock or _default_clock
        self._coins: list[CoinSummary] = []
        self._cached_at: datetime.datetime | None = None

    def _is_fresh(self, now: datetime.datetime) -> bool:
        return self._cached_at is not None and (now - self._cached_at) <= self._ttl

    def _refresh(self, now: datetime.datetime) -> None:
        response = self._client.get(self._url, params={}, timeout=self._timeout)
        response.raise_for_status()
        payload = json.loads(response.text)
        coins = [
            CoinSummary(id=str(item["id"]), symbol=str(item["symbol"]), name=str(item["name"]))
            for item in payload
            if isinstance(item, dict) and "id" in item and "symbol" in item and "name" in item
        ]
        self._coins = coins
        self._cached_at = now

    def _ensure_loaded(self) -> None:
        now = self._clock()
        if self._is_fresh(now):
            return
        try:
            self._refresh(now)
        except Exception as exc:  # network/parse boundary; never leak transport details
            if self._coins:
                # Stale cache is still useful and offline failure must be graceful.
                return
            raise CoinCatalogUnavailableError(
                "coin catalog is unavailable and no cached copy exists"
            ) from exc

    def search(self, query: str, limit: int = 50) -> Sequence[CoinSummary]:
        self._ensure_loaded()
        needle = query.strip().lower()
        if not needle:
            return self._coins[:limit]
        matches = [
            coin
            for coin in self._coins
            if needle in coin.id.lower()
            or needle in coin.symbol.lower()
            or needle in coin.name.lower()
        ]
        return matches[:limit]
