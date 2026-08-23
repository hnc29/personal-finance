import datetime
from decimal import Decimal

import pytest

from app.models.portfolio import (
    PortfolioComponentType,
    PortfolioSnapshot,
)
from app.models.pricing import PriceQuote, PricingProvider, QuoteState
from app.services.portfolio import (
    PortfolioComponentValue,
    calculate_net_worth,
    persist_daily_snapshot,
)


class FakeSession:
    def __init__(self) -> None:
        self.added: list[PortfolioSnapshot] = []

    def scalar(self, _statement: object) -> None:
        return self.added[0].id if self.added else None

    def add(self, value: PortfolioSnapshot) -> None:
        value.id = 1
        self.added.append(value)

    def flush(self) -> None:
        pass


def test_daily_snapshot_persists_exact_total_and_quote_metadata() -> None:
    session = FakeSession()
    captured_at = datetime.datetime(2026, 8, 23, 12, tzinfo=datetime.UTC)
    quoted_at = captured_at - datetime.timedelta(minutes=3)
    quote = PriceQuote(
        provider=PricingProvider(code="SYNTHETIC", name="Synthetic"),
        state=QuoteState.STALE,
        quoted_at=quoted_at,
    )

    snapshot = persist_daily_snapshot(
        session,
        snapshot_date=captured_at.date(),
        captured_at=captured_at,
        components=[
            PortfolioComponentValue(
                PortfolioComponentType.BANK, "account:1", Decimal("1000.1234")
            ),
            PortfolioComponentValue(
                PortfolioComponentType.CREDIT_CARD,
                "account:2",
                Decimal("250.0000"),
            ),
            PortfolioComponentValue.from_quote(
                component_type=PortfolioComponentType.PRECIOUS_METAL,
                source_key="holding:1",
                value=Decimal("500.0000"),
                quote=quote,
            ),
        ],
    )
    stored = session.added[0]
    assert stored is snapshot
    assert stored.net_worth == Decimal("1250.1234")
    metal = next(
        item
        for item in stored.components
        if item.component_type is PortfolioComponentType.PRECIOUS_METAL
    )
    assert metal.value == Decimal("500.0000")
    assert metal.quote_state is QuoteState.STALE
    assert metal.quote_provider == "SYNTHETIC"
    assert metal.quoted_at == quoted_at


def test_net_worth_covers_all_components_and_subtracts_card_liabilities() -> None:
    components = [
        PortfolioComponentValue(PortfolioComponentType.CASH, "cash", Decimal("1.0001")),
        PortfolioComponentValue(PortfolioComponentType.BANK, "bank", Decimal("2.0002")),
        PortfolioComponentValue(PortfolioComponentType.EWALLET, "wallet", Decimal("3.0003")),
        PortfolioComponentValue(PortfolioComponentType.SAVINGS, "savings", Decimal("4.0004")),
        PortfolioComponentValue(PortfolioComponentType.PRECIOUS_METAL, "gold", Decimal("5.0005")),
        PortfolioComponentValue(PortfolioComponentType.CRYPTO, "btc", Decimal("6.0006")),
        PortfolioComponentValue(PortfolioComponentType.CREDIT_CARD, "card", Decimal("7.0007")),
    ]
    assert calculate_net_worth(components) == Decimal("14.0014")
    components[-1] = PortfolioComponentValue(
        PortfolioComponentType.CREDIT_CARD, "card", Decimal("-7.0007")
    )
    assert calculate_net_worth(components) == Decimal("14.0014")


@pytest.mark.parametrize("value", [1.25, Decimal("1.00001")])
def test_net_worth_rejects_invalid_money_values(value: object) -> None:
    with pytest.raises((TypeError, ValueError)):
        calculate_net_worth(
            [
                PortfolioComponentValue(
                    PortfolioComponentType.CASH,
                    "cash",
                    value,  # type: ignore[arg-type]
                )
            ]
        )


def test_daily_snapshot_rejects_duplicate_date_and_partial_quote_metadata() -> None:
    session = FakeSession()
    captured_at = datetime.datetime(2026, 8, 23, 12, tzinfo=datetime.UTC)
    persist_daily_snapshot(
        session,
        snapshot_date=captured_at.date(),
        captured_at=captured_at,
        components=[],
    )
    with pytest.raises(ValueError, match="already exists"):
        persist_daily_snapshot(
            session,
            snapshot_date=captured_at.date(),
            captured_at=captured_at,
            components=[],
        )
    session = FakeSession()
    with pytest.raises(ValueError, match="supplied together"):
        persist_daily_snapshot(
            session,
            snapshot_date=captured_at.date() + datetime.timedelta(days=1),
            captured_at=captured_at + datetime.timedelta(days=1),
            components=[
                PortfolioComponentValue(
                    PortfolioComponentType.CRYPTO,
                    "holding:1",
                    Decimal("1.0000"),
                    quote_state=QuoteState.LIVE,
                )
            ],
        )
