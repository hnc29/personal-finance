"""Strict HTML price adapters for supported Vietnamese metal dealers."""

from __future__ import annotations

import datetime
import json
import re
import unicodedata
from collections.abc import Mapping
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser
from typing import Final, Protocol

from app.models.pricing import (
    PriceQuote,
    PricingProvider,
    QuoteMatchLevel,
    QuoteState,
)


class HttpResponse(Protocol):
    text: str

    def raise_for_status(self) -> None: ...


class HttpClient(Protocol):
    def get(self, url: str, *, timeout: float) -> HttpResponse: ...


class PriceSourceError(ValueError):
    """Raised when a source response cannot provide the requested exact product."""


class _PriceTableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self.quoted_at: str | None = None
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        attributes = dict(attrs)
        if tag == "time" and self.quoted_at is None:
            self.quoted_at = attributes.get("datetime")
        elif tag == "tr":
            self._row = []
        elif tag in {"td", "th"} and self._row is not None:
            self._cell = []

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"td", "th"} and self._cell is not None and self._row is not None:
            self._row.append(" ".join("".join(self._cell).split()))
            self._cell = None
        elif tag == "tr" and self._row is not None:
            if self._row:
                self.rows.append(self._row)
            self._row = None


_HEADER_ALIASES: Final[Mapping[str, str]] = {
    "ma san pham": "product_code",
    "ma": "product_code",
    "san pham": "product_name",
    "ten san pham": "product_name",
    "thuong hieu": "product_name",
    "loai vang": "product_name",
    "gia mua": "buy",
    "gia mua vao": "buy",
    "mua vao": "buy",
    "gia ban": "sell",
    "ban ra": "sell",
}


def _normalized(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    unaccented = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", unaccented.lower()).split())


def _money(value: str) -> Decimal:
    normalized = re.sub(r"[.\s]", "", value).replace(",", ".")
    if not normalized or not re.fullmatch(r"\d+(?:\.\d{1,4})?", normalized):
        raise PriceSourceError(f"invalid monetary value: {value!r}")
    try:
        result = Decimal(normalized)
    except InvalidOperation as exc:
        raise PriceSourceError(f"invalid monetary value: {value!r}") from exc
    if not result.is_finite():
        raise PriceSourceError(f"invalid monetary value: {value!r}")
    return result


class HtmlMetalPriceAdapter:
    """Parse an exact configured product from an injected provider HTML response."""

    provider_code: str
    provider_name: str

    def __init__(
        self,
        client: HttpClient,
        url: str,
        products: Mapping[str, str],
        *,
        timeout: float = 10.0,
    ) -> None:
        self._client = client
        self._url = url
        self._products = dict(products)
        self._timeout = timeout

    def quote(self, instrument: str, as_of: datetime.datetime) -> PriceQuote:
        product_code = self._products.get(instrument)
        if product_code is None:
            raise PriceSourceError(
                f"{self.provider_code} has no exact product mapping for {instrument}"
            )
        response = self._client.get(self._url, timeout=self._timeout)
        response.raise_for_status()
        parser = _PriceTableParser()
        parser.feed(response.text)
        record = self._find_exact_record(parser.rows, product_code)
        quoted_at = self._parse_quoted_at(parser.quoted_at)
        if quoted_at > as_of:
            raise PriceSourceError("source quote cannot be after as_of")

        quote = PriceQuote(
            provider=PricingProvider(code=self.provider_code, name=self.provider_name),
            product_code=product_code,
            match_level=QuoteMatchLevel.EXACT,
            state=QuoteState.LIVE,
            quoted_at=quoted_at,
            observed_at=as_of,
            source_metadata=json.dumps(
                {"source_url": self._url, "product_name": record["product_name"]},
                ensure_ascii=True,
                sort_keys=True,
            ),
        )
        quote.buy_price = _money(record["buy"])
        quote.sell_price = _money(record["sell"])
        return quote

    @staticmethod
    def _find_exact_record(rows: list[list[str]], product_code: str) -> dict[str, str]:
        if not rows:
            raise PriceSourceError("price table is missing")
        headers = [_HEADER_ALIASES.get(_normalized(value)) for value in rows[0]]
        required = {"product_code", "product_name", "buy", "sell"}
        if not required.issubset(item for item in headers if item is not None):
            raise PriceSourceError("price table has unsupported headers")
        for row in rows[1:]:
            record = {
                header: row[index]
                for index, header in enumerate(headers)
                if header is not None and index < len(row)
            }
            if record.get("product_code") == product_code:
                return record
        raise PriceSourceError(f"exact product {product_code!r} is unavailable")

    @staticmethod
    def _parse_quoted_at(value: str | None) -> datetime.datetime:
        if value is None:
            raise PriceSourceError("source quote timestamp is missing")
        try:
            result = datetime.datetime.fromisoformat(value)
        except ValueError as exc:
            raise PriceSourceError("source quote timestamp is invalid") from exc
        if result.tzinfo is None or result.utcoffset() is None:
            raise PriceSourceError("source quote timestamp must include a timezone")
        return result


class BtmcPriceAdapter(HtmlMetalPriceAdapter):
    provider_code = "BTMC"
    provider_name = "Bao Tin Minh Chau"


class BtmhPriceAdapter(HtmlMetalPriceAdapter):
    provider_code = "BTMH"
    provider_name = "Bao Tin Manh Hai"


class DojiPriceAdapter(HtmlMetalPriceAdapter):
    provider_code = "DOJI"
    provider_name = "DOJI"


class SjcPriceAdapter(HtmlMetalPriceAdapter):
    provider_code = "SJC"
    provider_name = "Saigon Jewelry Company"


class PnjPriceAdapter(HtmlMetalPriceAdapter):
    provider_code = "PNJ"
    provider_name = "Phu Nhuan Jewelry"
