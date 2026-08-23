"""ORM models package.

Imports every model so they register on ``Base.metadata`` when the package
is imported (used later as the Alembic target metadata).
"""

from app.models.account import Account, AccountType
from app.models.base import Base
from app.models.category import Category
from app.models.credit_card import (
    CreditCardProfile,
    CreditCardStatement,
    CreditCardStatementStatus,
)
from app.models.crypto import (
    CRYPTO_QUANTITY_SCALE,
    CryptoAsset,
    CryptoHolding,
    CryptoLot,
)
from app.models.import_batch import ImportBatch, RawImportRow
from app.models.ledger import AccountEntry, FinancialEvent, FinancialEventType
from app.models.misa_export import (
    MisaAccountMapping,
    MisaExportConfiguration,
    MisaExportedEvent,
    MisaExportFormat,
    MisaExportRun,
)
from app.models.precious_metal import (
    GRAMS_PER_UNIT,
    SUPPORTED_PRECIOUS_METAL_BRANDS,
    PreciousMetalBrand,
    PreciousMetalHolding,
    PreciousMetalLot,
    PreciousMetalQuantityUnit,
    PreciousMetalType,
    quantity_to_grams,
)
from app.models.reconciliation import (
    ReconciliationCandidate,
    ReconciliationCandidateState,
)
from app.models.savings import (
    DayCountConvention,
    InterestPaymentMethod,
    MaturityAction,
    SavingsAccount,
    SavingsAccountStatus,
    SavingsProduct,
    SavingsTerm,
)

__all__ = [
    "CRYPTO_QUANTITY_SCALE",
    "GRAMS_PER_UNIT",
    "SUPPORTED_PRECIOUS_METAL_BRANDS",
    "Account",
    "AccountEntry",
    "AccountType",
    "Base",
    "Category",
    "CreditCardProfile",
    "CreditCardStatement",
    "CreditCardStatementStatus",
    "CryptoAsset",
    "CryptoHolding",
    "CryptoLot",
    "DayCountConvention",
    "FinancialEvent",
    "FinancialEventType",
    "ImportBatch",
    "InterestPaymentMethod",
    "MaturityAction",
    "MisaAccountMapping",
    "MisaExportConfiguration",
    "MisaExportFormat",
    "MisaExportRun",
    "MisaExportedEvent",
    "PreciousMetalBrand",
    "PreciousMetalHolding",
    "PreciousMetalLot",
    "PreciousMetalQuantityUnit",
    "PreciousMetalType",
    "RawImportRow",
    "ReconciliationCandidate",
    "ReconciliationCandidateState",
    "SavingsAccount",
    "SavingsAccountStatus",
    "SavingsProduct",
    "SavingsTerm",
    "quantity_to_grams",
]
