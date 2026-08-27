"""Minimal stdlib HTTP client matching the injected ``HttpClient`` protocols.

Kept dependency-free (``urllib`` only) so wiring a live provider (e.g. the
CoinGecko coin catalog) never requires adding a runtime HTTP library --
CLAUDE.md forbids adding dependencies unless necessary, and tests already
inject ``unittest.mock.Mock`` clients instead of talking to the network.
"""

from __future__ import annotations

import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Mapping


class HttpRequestError(RuntimeError):
    """Raised for any transport-level failure (network, timeout, status)."""


class UrllibResponse:
    def __init__(self, text: str, status: int) -> None:
        self.text = text
        self.status = status

    def raise_for_status(self) -> None:
        if self.status >= 400:
            raise HttpRequestError(f"HTTP {self.status}")


class UrllibHttpClient:
    """Stdlib-only GET client; matches the ``get(url, params=, timeout=)`` shape.

    ``params`` defaults to ``None`` (treated the same as no query string) --
    the metal price adapters (``metal_price_adapters.py``) call
    ``client.get(url, timeout=...)`` without a ``params`` keyword at all
    (unlike ``crypto_coin_catalog.py``/``fx_rate.py``, which always pass
    ``params={}``), so a required keyword would raise ``TypeError`` the
    first time this client backs a real metal adapter (found 2026-08-27
    while wiring btmc.vn as a live source; both call styles work now).
    """

    def get(
        self, url: str, *, params: Mapping[str, str] | None = None, timeout: float
    ) -> UrllibResponse:
        query = urllib.parse.urlencode(dict(params)) if params else ""
        full_url = f"{url}?{query}" if query else url
        request = urllib.request.Request(full_url, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                body = response.read().decode("utf-8")
                status = getattr(response, "status", 200)
        except urllib.error.HTTPError as exc:
            return UrllibResponse(exc.read().decode("utf-8", errors="replace"), exc.code)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise HttpRequestError(str(exc)) from exc
        return UrllibResponse(body, status)
