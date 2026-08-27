"""Strict HTML price adapters for supported Vietnamese official metal dealers (Rule 1 & Rule 3)."""

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
        # User correction, 2026-08-27: none of the real dealer pages
        # (btmc.vn confirmed directly; baotinmanhhai.vn/banggia.doji.vn by
        # description) wrap their "last updated" timestamp in a <time>
        # element -- it's plain body text like "Cập nhật lúc 27/08/2026
        # 15:00". Keep the <time> tag as a first-try (harmless if a source
        # ever adds one) but also collect every text node on the page so
        # a regex can find the Vietnamese "Cập nhật lúc ..." phrasing as a
        # fallback -- see _parse_quoted_at below.
        self.full_text_parts: list[str] = []

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
        self.full_text_parts.append(data)
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
    "ten loai vang": "product_name",
    "gia mua": "buy",
    "gia mua vao": "buy",
    "mua vao": "buy",
    "mua": "buy",
    "gia ban": "sell",
    "gia ban ra": "sell",
    "ban ra": "sell",
    "ban": "sell",
    "khu vuc": "region",
    "dia diem": "region",
    "tinh thanh": "region",
}

# BTMC's real table header is "Loại vàng" for the product-name column --
# already covered above -- but also has "Hàm lượng" (purity/content) and
# "Thương phẩm" (brand/logo) columns with no matching alias. Unmapped
# headers are simply ignored by _find_exact_record (see below), which is
# correct: we match by product_name text, not by purity or brand column.

# Vietnamese "Cập nhật lúc DD/MM/YYYY HH:MM[:SS]" -- confirmed verbatim on
# btmc.vn ("Cập nhật lúc 27/08/2026 15:00 ĐVT 1 = 1.000 VNĐ"). Timestamps
# on these dealer pages are always Vietnam local time (UTC+7); there is no
# timezone marker in the text itself, so it's fixed here rather than
# parsed.
_ICT: Final = datetime.timezone(datetime.timedelta(hours=7))
_VN_UPDATED_AT_RE: Final = re.compile(
    r"[Cc][ậa]p nh[ậa]t l[úu]c\s+(\d{1,2})/(\d{1,2})/(\d{4})\s+"
    r"(\d{1,2}):(\d{2})(?::(\d{2}))?"
)


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
    """Parse an exact configured product from an injected official provider HTML response."""

    provider_code: str
    provider_name: str
    official_url: str

    def __init__(
        self,
        client: HttpClient,
        url: str,
        products: Mapping[str, str],
        *,
        timeout: float = 10.0,
        unit_scale: Decimal = Decimal(1),
    ) -> None:
        self._client = client
        self._url = url
        self._products = dict(products)
        self._timeout = timeout
        # User correction, 2026-08-27: btmc.vn (and, per the user, all
        # three dealer sites they checked) publish prices "cho 1 chỉ" but
        # display the raw table number already divided by 1,000 ("ĐVT 1 =
        # 1.000 VNĐ" on btmc.vn) -- e.g. a displayed "14800" means
        # 14,800,000 VNĐ. Without this multiplier every parsed price would
        # be 1,000x too low.
        self._unit_scale = unit_scale

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
        quoted_at = self._parse_quoted_at(
            parser.quoted_at, "".join(parser.full_text_parts), fallback=as_of
        )
        if quoted_at > as_of:
            raise PriceSourceError("source quote cannot be after as_of")

        buy_price = _money(record["buy"]) * self._unit_scale
        # User correction, 2026-08-27: some real rows (e.g. btmc.vn's "Vàng
        # nguyên liệu", "Vàng hệ thống") only publish a buy price and show
        # "Liên hệ" (contact us) for sell -- and the app only ever uses buy
        # price for valuation (BA-SPEC 5.1: "luôn dùng giá mua vào, không
        # bao giờ dùng giá bán ra"), so a missing/non-numeric sell price
        # must not block getting the buy price.
        try:
            sell_price: Decimal | None = _money(record["sell"]) * self._unit_scale
        except PriceSourceError:
            sell_price = None

        # Determine unit: if > 30,000,000 it is per lượng (37.5g), else per chỉ (3.75g)
        source_unit = "CHI"
        if buy_price > Decimal(30000000):
            source_unit = "LUONG"

        metadata = {
            "provider": self.provider_code,
            "instrument": instrument,
            "product_code": product_code,
            "product_name": record["product_name"],
            "source_url": self._url,
            "source_unit": source_unit,
            "currency": "VND",
            "buy_price": str(buy_price),
            "sell_price": str(sell_price) if sell_price is not None else None,
            "status": "LIVE",
        }
        if "region" in record:
            metadata["region"] = record["region"]

        quote = PriceQuote(
            provider=PricingProvider(code=self.provider_code, name=self.provider_name),
            product_code=product_code,
            match_level=QuoteMatchLevel.EXACT,
            state=QuoteState.LIVE,
            quoted_at=quoted_at,
            observed_at=as_of,
            source_metadata=json.dumps(metadata, ensure_ascii=False, sort_keys=True),
        )
        quote.buy_price = buy_price
        quote.sell_price = sell_price
        return quote

    @staticmethod
    def _find_exact_record(rows: list[list[str]], product_code: str) -> dict[str, str]:
        if not rows:
            raise PriceSourceError("price table is missing")
        headers = [_HEADER_ALIASES.get(_normalized(value)) for value in rows[0]]
        required = {"product_name", "buy", "sell"}
        has_required = required.issubset(item for item in headers if item is not None)
        has_code = "product_code" in (item for item in headers if item is not None)

        if not has_required and not has_code:
            raise PriceSourceError("price table has unsupported headers")

        norm_target = _normalized(product_code)
        for row in rows[1:]:
            record = {
                header: row[index]
                for index, header in enumerate(headers)
                if header is not None and index < len(row)
            }
            row_code = record.get("product_code")
            row_name = record.get("product_name")

            if row_code and (row_code == product_code or _normalized(row_code) == norm_target):
                return record
            if row_name and (_normalized(row_name) == norm_target or row_name == product_code):
                if "product_code" not in record:
                    record["product_code"] = product_code
                return record

        raise PriceSourceError(f"exact product {product_code!r} is unavailable")

    @staticmethod
    def _parse_quoted_at(
        time_tag_value: str | None,
        page_text: str,
        *,
        fallback: datetime.datetime | None = None,
    ) -> datetime.datetime:
        if time_tag_value is not None:
            try:
                result = datetime.datetime.fromisoformat(time_tag_value)
            except ValueError as exc:
                raise PriceSourceError("source quote timestamp is invalid") from exc
            if result.tzinfo is None or result.utcoffset() is None:
                raise PriceSourceError("source quote timestamp must include a timezone")
            return result

        match = _VN_UPDATED_AT_RE.search(page_text)
        if match is not None:
            day, month, year, hour, minute, second = match.groups()
            try:
                return datetime.datetime(
                    int(year),
                    int(month),
                    int(day),
                    int(hour),
                    int(minute),
                    int(second) if second else 0,
                    tzinfo=_ICT,
                )
            except ValueError as exc:
                raise PriceSourceError("source quote timestamp is invalid") from exc

        if fallback is not None:
            return fallback
        raise PriceSourceError("source quote timestamp is missing")


class SjcPriceAdapter(HtmlMetalPriceAdapter):
    provider_code = "SJC"
    provider_name = "Saigon Jewelry Company"
    official_url = "https://www.sjc.com.vn/"


class PnjPriceAdapter(HtmlMetalPriceAdapter):
    provider_code = "PNJ"
    provider_name = "Phu Nhuan Jewelry"
    official_url = "https://giavang.pnj.com.vn/"


class DojiPriceAdapter(HtmlMetalPriceAdapter):
    provider_code = "DOJI"
    provider_name = "DOJI"
    official_url = "https://banggia.doji.vn/"


class BtmcPriceAdapter(HtmlMetalPriceAdapter):
    provider_code = "BTMC"
    provider_name = "Bao Tin Minh Chau"
    official_url = "https://btmc.vn/"


class BtmhPriceAdapter(HtmlMetalPriceAdapter):
    provider_code = "BTMH"
    provider_name = "Bao Tin Manh Hai"
    official_url = "https://baotinmanhhai.vn/vi/bang-gia-vang"
