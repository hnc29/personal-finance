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
    """Stdlib-only GET client; matches the ``get(url, params=, timeout=)`` shape."""

    def get(
        self, url: str, *, params: Mapping[str, str], timeout: float
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
