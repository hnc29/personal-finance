"""USD/VND exchange rate lookup, with the network boundary injected for tests.

User report, 2026-08-26: crypto purchases entered in USD must be "tự động
nhân và chuyển sang vnd" (automatically multiplied and converted to VND),
with "tỷ giá sẽ tự động cập nhật" (the rate auto-updates) -- i.e. the rate
must come from a live source, not be hard-coded. This mirrors
``crypto_coin_catalog.py``'s shape exactly (injected HTTP client + clock,
in-memory TTL cache, graceful stale-cache fallback on a transient network
failure) so it's tested and wired the same way.
"""

from __future__ import annotations

import datetime
import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Protocol

DEFAULT_FX_RATE_URL = "https://open.er-api.com/v6/latest/USD"


@dataclass(frozen=True)
class FxRate:
    rate: Decimal
    as_of: datetime.datetime
    source: str


class FxRateUnavailableError(RuntimeError):
    """Raised when no USD/VND rate -- fresh or cached -- can be served."""


class HttpResponse(Protocol):
    text: str

    def raise_for_status(self) -> None: ...


class HttpClient(Protocol):
    def get(
        self, url: str, *, params: Mapping[str, str], timeout: float
    ) -> HttpResponse: ...


def _default_clock() -> datetime.datetime:
    return datetime.datetime.now(datetime.UTC)


class UsdVndRateProvider:
    """In-memory cached USD->VND rate with an injected HTTP client and clock."""

    source_name = "open.er-api.com"

    def __init__(
        self,
        client: HttpClient,
        url: str = DEFAULT_FX_RATE_URL,
        *,
        ttl: datetime.timedelta = datetime.timedelta(hours=1),
        timeout: float = 10.0,
        clock: Callable[[], datetime.datetime] | None = None,
    ) -> None:
        self._client = client
        self._url = url
        self._ttl = ttl
        self._timeout = timeout
        self._clock = clock or _default_clock
        self._rate: FxRate | None = None

    def _is_fresh(self, now: datetime.datetime) -> bool:
        return self._rate is not None and (now - self._rate.as_of) <= self._ttl

    def _refresh(self, now: datetime.datetime) -> None:
        response = self._client.get(self._url, params={}, timeout=self._timeout)
        response.raise_for_status()
        try:
            payload = json.loads(response.text, parse_float=Decimal, parse_int=Decimal)
            raw_rate = payload["rates"]["VND"]
            rate = raw_rate if isinstance(raw_rate, Decimal) else Decimal(str(raw_rate))
        except (KeyError, TypeError, ValueError, InvalidOperation, json.JSONDecodeError) as exc:
            raise FxRateUnavailableError(
                "USD/VND rate is missing or malformed in the FX source response"
            ) from exc
        if not rate.is_finite() or rate <= 0:
            raise FxRateUnavailableError("USD/VND rate must be a finite, positive number")
        self._rate = FxRate(rate=rate, as_of=now, source=self.source_name)

    def get_rate(self) -> FxRate:
        now = self._clock()
        if self._is_fresh(now):
            assert self._rate is not None
            return self._rate
        try:
            self._refresh(now)
        except Exception as exc:  # network/parse boundary; never leak transport details
            if self._rate is not None:
                # Stale cache is still useful and a transient outage must be
                # graceful rather than breaking every crypto-in-USD entry.
                return self._rate
            raise FxRateUnavailableError(
                "USD/VND rate is unavailable and no cached rate exists"
            ) from exc
        assert self._rate is not None
        return self._rate
