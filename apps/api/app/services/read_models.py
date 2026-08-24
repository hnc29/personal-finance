import datetime
import re
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.money import InvalidMoneyValue, money_to_scaled, scaled_to_money
from app.models.account import Account, AccountType
from app.models.crypto import CryptoHolding
from app.models.import_batch import ImportBatch
from app.models.ledger import AccountEntry
from app.models.portfolio import PortfolioComponentType
from app.models.precious_metal import PreciousMetalHolding
from app.models.pricing import PriceQuote
from app.models.reconciliation import ReconciliationCandidate
from app.models.savings import SavingsAccount
from app.schemas.read_models import (
    PortfolioOverview,
    PortfolioRow,
    QuoteMeta,
    ReconciliationRead,
)
from app.services.portfolio import PortfolioComponentValue, calculate_net_worth
from app.services.pricing import current_quote


def money(value: Decimal) -> str:
    return format(scaled_to_money(money_to_scaled(value)), ".4f")

def quote_meta(quote: PriceQuote | None) -> QuoteMeta:
    return QuoteMeta(
        state=quote.state.value if quote else "UNAVAILABLE",
        provider=quote.provider.code if quote else None,
        quoted_at=quote.quoted_at if quote else None,
        observed_at=quote.observed_at if quote else None,
        valuation_price=money(quote.valuation_price) if quote and quote.valuation_price is not None else None,
    )

def portfolio_overview(db: Session) -> PortfolioOverview:
    as_of = datetime.datetime.now(datetime.UTC)
    accounts = list(db.scalars(select(Account).where(Account.is_active.is_(True)).order_by(Account.id)))
    components: list[PortfolioComponentValue] = []
    valuation_complete = True
    account_rows = []
    for account in accounts:
        balance = scaled_to_money(int(db.scalar(select(func.coalesce(func.sum(AccountEntry.amount_scaled), 0)).where(AccountEntry.account_id == account.id)) or 0))
        component_type = PortfolioComponentType(account.account_type.value)
        component_value = abs(balance) if account.account_type is AccountType.CREDIT_CARD else balance
        components.append(PortfolioComponentValue(component_type=component_type, source_key=f"account:{account.id}", value=component_value))
        account_rows.append(PortfolioRow(id=account.id, name=account.name, value=money(balance)))
    savings = list(db.scalars(select(SavingsAccount).where(SavingsAccount.status == "OPEN").order_by(SavingsAccount.id)))
    for item in savings:
        savings_value = item.principal
        components.append(PortfolioComponentValue(component_type=PortfolioComponentType.SAVINGS, source_key=f"savings:{item.id}", value=savings_value))
    savings_rows = [PortfolioRow(id=x.id, name=x.name, value=money(x.principal)) for x in savings]
    cards = [x for x in accounts if x.account_type is AccountType.CREDIT_CARD]
    card_rows = [PortfolioRow(id=x.id, name=x.name, value=account_rows[accounts.index(x)].value) for x in cards]
    metals = list(db.scalars(select(PreciousMetalHolding).where(PreciousMetalHolding.is_net_worth.is_(True)).options(selectinload(PreciousMetalHolding.lots)).order_by(PreciousMetalHolding.id)))
    metal_rows = []
    for metal_h in metals:
        quote = None
        metal_value: Decimal | None = None
        if metal_h.pricing_instrument:
            quote = current_quote(db, metal_h.pricing_instrument, as_of)
            if quote and quote.valuation_price is not None:
                metal_value = scaled_to_money(sum(l.grams_scaled for l in metal_h.lots)) * quote.valuation_price
                try:
                    money_to_scaled(metal_value)
                except InvalidMoneyValue:
                    metal_value = None
                    valuation_complete = False
                else:
                    components.append(PortfolioComponentValue(component_type=PortfolioComponentType.PRECIOUS_METAL, source_key=f"metal:{metal_h.id}", value=metal_value, quote_state=quote.state, quote_provider=quote.provider.code, quoted_at=quote.quoted_at))
            else:
                valuation_complete = False
        else:
            valuation_complete = False
        metal_rows.append(PortfolioRow(id=metal_h.id, name=metal_h.product_type, value=money(metal_value) if metal_value is not None else None, quote=quote_meta(quote)))
    cryptos = list(db.scalars(select(CryptoHolding).where(CryptoHolding.is_net_worth.is_(True)).options(selectinload(CryptoHolding.lots)).order_by(CryptoHolding.id)))
    crypto_rows: list[PortfolioRow] = []
    for crypto_h in cryptos:
        quote = current_quote(db, crypto_h.pricing_instrument, as_of) if crypto_h.pricing_instrument else None
        crypto_value: Decimal | None = sum((lot.quantity for lot in crypto_h.lots), Decimal(0)) * quote.valuation_price if quote and quote.valuation_price is not None else None
        if crypto_value is not None and quote is not None:
            try:
                money_to_scaled(crypto_value)
            except InvalidMoneyValue:
                crypto_value = None
                valuation_complete = False
            else:
                components.append(PortfolioComponentValue(component_type=PortfolioComponentType.CRYPTO, source_key=f"crypto:{crypto_h.id}", value=crypto_value, quote_state=quote.state, quote_provider=quote.provider.code, quoted_at=quote.quoted_at))
        else:
            valuation_complete = False
        crypto_rows.append(PortfolioRow(id=crypto_h.id, name=crypto_h.asset.value, value=money(crypto_value) if crypto_value is not None else None, quote=quote_meta(quote)))
    invested = sum((c.value for c in components if c.component_type in {PortfolioComponentType.SAVINGS, PortfolioComponentType.PRECIOUS_METAL, PortfolioComponentType.CRYPTO}), Decimal(0))
    return PortfolioOverview(as_of=as_of, valuation_complete=valuation_complete, net_worth=money(calculate_net_worth(components)) if valuation_complete else None, invested_assets=money(invested) if valuation_complete else None, account_count=len(accounts), accounts=account_rows, savings=savings_rows, credit_cards=card_rows, precious_metals=metal_rows, crypto=crypto_rows)

def list_import_batches(db: Session):
    rows = db.scalars(select(ImportBatch).order_by(ImportBatch.id))
    return [
        {
            "id": row.id,
            "source": row.source,
            "original_filename": re.split(r"[/\\]", row.original_filename)[-1],
            "imported_at": row.imported_at,
            "row_count": row.row_count,
        }
        for row in rows
    ]
def list_reconciliation(db: Session):
    rows = db.scalars(select(ReconciliationCandidate).options(selectinload(ReconciliationCandidate.raw_import_row), selectinload(ReconciliationCandidate.financial_event)).order_by(ReconciliationCandidate.id))
    return [ReconciliationRead(id=x.id, state=x.state.value, raw_row_id=x.raw_import_row_id, source_row_number=x.raw_import_row.source_row_number, source_row_id=x.raw_import_row.source_row_id, financial_event_id=x.financial_event_id, transaction_date=x.financial_event.transaction_date, event_type=x.financial_event.event_type.value) for x in rows]
