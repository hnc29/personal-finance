"""Synthetic persistence checks for the crypto domain."""

import datetime
import json
import os
import subprocess
from decimal import Decimal
from pathlib import Path
from unittest.mock import Mock

import pytest
from sqlalchemy import BigInteger, Float, Integer, Numeric, create_engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.money import InvalidMoneyValue
from app.models import Account, AccountType, FinancialEvent, FinancialEventType
from app.models.crypto import CryptoHolding, CryptoLot
from app.services.crypto_pricing import (
    CoinGeckoPriceAdapter,
    UnconfiguredCryptoPriceProvider,
)


@pytest.fixture
def session(tmp_path: Path) -> Session:
    database_path = tmp_path / "synthetic-crypto.db"
    env = os.environ.copy()
    env["PF_DATABASE_PATH"] = str(database_path)
    subprocess.run(
        ["alembic", "upgrade", "head"], check=True, env=env, capture_output=True
    )
    engine = create_engine(f"sqlite:///{database_path}")
    with Session(engine) as database_session:
        database_session.execute(text("PRAGMA foreign_keys=ON"))
        yield database_session
    engine.dispose()


def test_btc_holding_lot_tracks_basis_funding_instrument_and_event() -> None:
    holding = CryptoHolding(
        coingecko_id="bitcoin",
        symbol="btc",
        display_name="Bitcoin",
        pricing_instrument="BTC_USD",
        is_net_worth=True,
    )
    lot = CryptoLot(
        holding=holding,
        purchase_date=datetime.date(2026, 8, 1),
        funding_account_id=3,
        financial_event_id=9,
    )
    lot.set_quantity("0.12500001")
    lot.purchase_price = "65000.1234"
    lot.total_cost = "8125.0154"
    assert lot.quantity == Decimal("0.12500001")
    assert lot.purchase_price == Decimal("65000.1234")
    assert lot.total_cost == Decimal("8125.0154")
    assert holding.is_net_worth is True
    for name in ("quantity_scaled", "purchase_price_scaled", "total_cost_scaled"):
        column_type = CryptoLot.__table__.c[name].type
        assert isinstance(column_type, (Integer, BigInteger))
        assert not isinstance(column_type, (Float, Numeric))


def test_crypto_quantity_rejects_float_and_excess_precision() -> None:
    lot = CryptoLot()
    with pytest.raises(InvalidMoneyValue):
        lot.set_quantity(0.1)  # type: ignore[arg-type]
    with pytest.raises(InvalidMoneyValue):
        lot.set_quantity("0.000000001")


@pytest.mark.parametrize("quantity", ["0", "-0.1", "NaN", "Infinity", True, None])
def test_crypto_quantity_rejects_nonpositive_nonfinite_and_unsupported_values(
    quantity: object,
) -> None:
    lot = CryptoLot()
    with pytest.raises(InvalidMoneyValue):
        lot.set_quantity(quantity)  # type: ignore[arg-type]


def test_crypto_lot_persists_links_and_large_exact_basis(session: Session) -> None:
    account = Account(
        name="Synthetic crypto funding", account_type=AccountType.BANK, currency="USD"
    )
    event = FinancialEvent(
        event_type=FinancialEventType.ASSET_PURCHASE,
        transaction_date=datetime.date(2026, 8, 1),
    )
    holding = CryptoHolding(
        coingecko_id="bitcoin", symbol="btc", pricing_instrument="BTC_USD"
    )
    lot = CryptoLot(
        holding=holding,
        funding_account=account,
        financial_event=event,
        purchase_date=datetime.date(2026, 8, 1),
    )
    lot.set_quantity("21.00000000")
    lot.purchase_price = "650000.1234"
    lot.total_cost = "13650002.5914"
    session.add(lot)
    session.commit()
    session.expire_all()

    persisted = session.get(CryptoLot, lot.id)
    assert persisted is not None
    assert persisted.quantity == Decimal(21)
    assert persisted.purchase_price == Decimal("650000.1234")
    assert persisted.total_cost == Decimal("13650002.5914")
    assert persisted.funding_account_id == account.id
    assert persisted.financial_event_id == event.id


def test_arbitrary_coingecko_coin_can_be_held_not_only_btc(session: Session) -> None:
    """TASK-031 §11.2: identity is the CoinGecko id, so ETH etc. must persist."""
    holding = CryptoHolding(
        coingecko_id="ethereum", symbol="eth", display_name="Ethereum"
    )
    lot = CryptoLot(holding=holding, purchase_date=datetime.date(2026, 8, 1))
    lot.set_quantity("3.5")
    lot.purchase_price = "3500.00"
    lot.total_cost = "12250.00"
    session.add(lot)
    session.commit()
    session.expire_all()

    persisted = session.get(CryptoHolding, holding.id)
    assert persisted is not None
    assert persisted.coingecko_id == "ethereum"
    assert persisted.symbol == "eth"
    assert persisted.display_name == "Ethereum"


def test_crypto_database_constraints_reject_invalid_scaled_values(
    session: Session,
) -> None:
    holding = CryptoHolding(coingecko_id="bitcoin", symbol="btc")
    session.add(holding)
    session.flush()
    session.add(
        CryptoLot(
            holding_id=holding.id,
            quantity_scaled=0,
            purchase_date=datetime.date(2026, 8, 1),
            purchase_price_scaled=0,
            total_cost_scaled=0,
        )
    )
    with pytest.raises(IntegrityError):
        session.commit()


def test_live_pricing_is_an_explicit_unconfigured_boundary() -> None:
    provider = UnconfiguredCryptoPriceProvider()
    with pytest.raises(NotImplementedError, match="no live crypto price provider"):
        provider.get_price("bitcoin", "BTC_USD", datetime.date(2026, 8, 23))


def test_coingecko_adapter_uses_exact_mapping_and_decimal_json() -> None:
    response = Mock()
    response.text = json.dumps(
        {"bitcoin": {"usd": "65000.1234", "last_updated_at": 1787457600}}
    )
    client = Mock()
    client.get.return_value = response
    as_of = datetime.datetime(2026, 8, 23, 12, tzinfo=datetime.UTC)
    adapter = CoinGeckoPriceAdapter(
        client,
        "https://prices.example.invalid/simple/price",
        {"BTC/USD": ("bitcoin", "usd")},
    )

    quote = adapter.quote("BTC/USD", as_of)

    assert quote.provider.code == "COINGECKO"
    assert quote.product_code == "bitcoin/usd"
    assert quote.buy_price == Decimal("65000.1234")
    assert quote.sell_price == Decimal("65000.1234")
