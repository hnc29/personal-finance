import datetime
import json
from decimal import Decimal
from pathlib import Path
from unittest.mock import Mock

import pytest

from app.models.pricing import QuoteMatchLevel, QuoteState
from app.services.metal_price_adapters import (
    BtmcPriceAdapter,
    BtmhPriceAdapter,
    DojiPriceAdapter,
    HtmlMetalPriceAdapter,
    PnjPriceAdapter,
    PriceSourceError,
    SjcPriceAdapter,
)

FIXTURES = Path(__file__).parent / "fixtures" / "pricing"
AS_OF = datetime.datetime(2026, 8, 23, 4, tzinfo=datetime.UTC)


def _client_for(fixture: str) -> tuple[Mock, Mock]:
    response = Mock()
    response.text = (FIXTURES / fixture).read_text(encoding="utf-8")
    client = Mock()
    client.get.return_value = response
    return client, response


def test_btmc_parses_exact_product_from_mocked_html() -> None:
    client, response = _client_for("btmc_prices.html")
    adapter = BtmcPriceAdapter(
        client,
        "https://prices.example.invalid/btmc",
        {"GOLD/BTMC/VRTL-9999": "BTMC-VRTL-9999"},
    )

    quote = adapter.quote("GOLD/BTMC/VRTL-9999", AS_OF)

    client.get.assert_called_once_with(
        "https://prices.example.invalid/btmc", timeout=10.0
    )
    response.raise_for_status.assert_called_once_with()
    assert quote.provider.code == "BTMC"
    assert quote.product_code == "BTMC-VRTL-9999"
    assert quote.match_level is QuoteMatchLevel.EXACT
    assert quote.state is QuoteState.LIVE
    assert quote.buy_price == Decimal("12345678.9000")
    assert quote.sell_price == Decimal("12456789.0000")
    assert quote.quoted_at == datetime.datetime(
        2026, 8, 23, 10, 15, tzinfo=datetime.timezone(datetime.timedelta(hours=7))
    )
    assert json.loads(quote.source_metadata or "") == {
        "provider": "BTMC",
        "instrument": "GOLD/BTMC/VRTL-9999",
        "product_code": "BTMC-VRTL-9999",
        "product_name": "Vàng Rồng Thăng Long 999.9",
        "source_url": "https://prices.example.invalid/btmc",
        "source_unit": "CHI",
        "currency": "VND",
        "buy_price": "12345678.9000",
        "sell_price": "12456789.0000",
        "status": "LIVE",
    }


def test_btmh_supports_its_header_format_and_configured_timeout() -> None:
    client, _ = _client_for("btmh_prices.html")
    adapter = BtmhPriceAdapter(
        client,
        "https://prices.example.invalid/btmh",
        {"GOLD/BTMH/KGB-9999": "BTMH-NHAN-9999"},
        timeout=2.5,
    )

    quote = adapter.quote("GOLD/BTMH/KGB-9999", AS_OF)

    client.get.assert_called_once_with(
        "https://prices.example.invalid/btmh", timeout=2.5
    )
    assert quote.provider.code == "BTMH"
    assert quote.buy_price == Decimal(12_111_222)
    assert quote.sell_price == Decimal(12_222_333)


@pytest.mark.parametrize(
    ("adapter_type", "provider_code"),
    [(DojiPriceAdapter, "DOJI"), (SjcPriceAdapter, "SJC"), (PnjPriceAdapter, "PNJ")],
)
def test_additional_vn_adapters_are_strict_and_mockable(
    adapter_type: type[HtmlMetalPriceAdapter], provider_code: str
) -> None:
    html = (
        '<time datetime="2026-08-23T10:15:00+07:00"></time>'
        "<table><tr><th>Mã sản phẩm</th><th>Tên sản phẩm</th>"
        "<th>Giá mua vào</th><th>Giá bán</th></tr>"
        f"<tr><td>{provider_code}-EXACT</td><td>Exact synthetic product</td>"
        "<td>12.000.000</td><td>12.100.000</td></tr></table>"
    )
    response = Mock(text=html)
    client = Mock()
    client.get.return_value = response
    adapter = adapter_type(
        client,
        f"https://prices.example.invalid/{provider_code.lower()}",
        {f"GOLD/{provider_code}/EXACT": f"{provider_code}-EXACT"},
    )

    quote = adapter.quote(f"GOLD/{provider_code}/EXACT", AS_OF)

    assert quote.provider.code == provider_code
    assert quote.product_code == f"{provider_code}-EXACT"
    assert quote.buy_price == Decimal("12000000.0000")


def test_adapter_never_fetches_without_an_exact_instrument_mapping() -> None:
    client, _ = _client_for("btmc_prices.html")
    adapter = BtmcPriceAdapter(
        client,
        "https://prices.example.invalid/btmc",
        {"GOLD/BTMC/VRTL-9999": "BTMC-VRTL-9999"},
    )

    with pytest.raises(PriceSourceError, match="no exact product mapping"):
        adapter.quote("GOLD/BTMC/OTHER", AS_OF)

    client.get.assert_not_called()


def test_adapter_does_not_substitute_a_similar_product() -> None:
    client, _ = _client_for("btmc_prices.html")
    adapter = BtmcPriceAdapter(
        client,
        "https://prices.example.invalid/btmc",
        {"GOLD/BTMC/MISSING": "BTMC-VRTL-999"},
    )

    with pytest.raises(PriceSourceError, match="exact product.*unavailable"):
        adapter.quote("GOLD/BTMC/MISSING", AS_OF)


@pytest.mark.parametrize(
    "html, message",
    [
        ("<table><tr><th>Unknown</th></tr></table>", "unsupported headers"),
        (
            (
                '<time datetime="2026-08-23T11:15:00+07:00"></time>'
                "<table><tr><th>Mã</th><th>Loại vàng</th><th>Mua vào</th>"
                "<th>Bán ra</th></tr><tr><td>P</td><td>Product</td>"
                "<td>1</td><td>2</td></tr></table>"
            ),
            "after as_of",
        ),
    ],
)
def test_adapter_rejects_malformed_or_future_source_data(
    html: str, message: str
) -> None:
    response = Mock(text=html)
    client = Mock()
    client.get.return_value = response
    adapter = BtmhPriceAdapter(client, "https://example.invalid", {"GOLD/X": "P"})

    with pytest.raises(PriceSourceError, match=message):
        adapter.quote("GOLD/X", AS_OF)


def test_btmc_parses_real_site_layout_with_text_timestamp_and_unit_scale() -> None:
    client, _ = _client_for("btmc_prices_real.html")
    adapter = BtmcPriceAdapter(
        client,
        "https://btmc.vn/",
        {"BTMC_PLAIN_RING_9999": "NHẪN TRÒN TRƠN BẢO TÍN MINH CHÂU"},
        unit_scale=Decimal(1000),
    )

    quote = adapter.quote(
        "BTMC_PLAIN_RING_9999",
        datetime.datetime(2026, 8, 27, 10, tzinfo=datetime.UTC),
    )

    assert quote.buy_price == Decimal("14800000.0000")
    assert quote.sell_price == Decimal("15200000.0000")
    assert quote.quoted_at == datetime.datetime(
        2026, 8, 27, 15, tzinfo=datetime.timezone(datetime.timedelta(hours=7))
    )


def test_btmc_tolerates_missing_sell_price_and_uses_sjc_and_raw_reference_rows() -> None:
    client, _ = _client_for("btmc_prices_real.html")
    adapter = BtmcPriceAdapter(
        client,
        "https://btmc.vn/",
        {
            "SJC_GOLD_BAR_9999": "VÀNG MIẾNG SJC",
            "RAW_GOLD_BAR_9999": "VÀNG NGUYÊN LIỆU",
        },
        unit_scale=Decimal(1000),
    )
    as_of = datetime.datetime(2026, 8, 27, 10, tzinfo=datetime.UTC)

    sjc = adapter.quote("SJC_GOLD_BAR_9999", as_of)
    assert sjc.buy_price == Decimal("14700000.0000")
    assert sjc.sell_price == Decimal("15000000.0000")

    raw = adapter.quote("RAW_GOLD_BAR_9999", as_of)
    assert raw.buy_price == Decimal("14150000.0000")
    assert raw.sell_price is None
