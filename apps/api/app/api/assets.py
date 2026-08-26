import datetime
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.money import money_to_scaled
from app.models.crypto import (
    CryptoHolding,
    CryptoLot,
    crypto_quantity_to_scaled,
)
from app.models.precious_metal import (
    SUPPORTED_PRECIOUS_METAL_BRANDS,
    PreciousMetalBrand,
    PreciousMetalHolding,
    PreciousMetalLot,
    PreciousMetalQuantityUnit,
    PreciousMetalType,
)
from app.services.crypto_coin_catalog import (
    CoinCatalogUnavailableError,
    CoinGeckoCoinListProvider,
)
from app.services.http_client import UrllibHttpClient

router = APIRouter(prefix="/api/v1/assets", tags=["assets"])
DbSession = Annotated[Session, Depends(get_db)]

_coin_catalog_provider = CoinGeckoCoinListProvider(
    UrllibHttpClient(),
    settings.coingecko_coins_url,
    timeout=settings.coingecko_timeout_seconds,
)


def get_coin_catalog() -> CoinGeckoCoinListProvider:
    """A single process-lifetime instance; overridable via dependency_overrides in tests."""
    return _coin_catalog_provider


class MetalCreate(BaseModel):
    metal_type: Literal["GOLD", "SILVER"]
    brand: PreciousMetalBrand = PreciousMetalBrand.RAW
    product_type: str
    # BUGFIX (user report, 2026-08-26: "Độ tinh khiết ko bắt buộc nhập, mặc
    # định giá trị 99,99"): purity used to be required with no default --
    # the frontend now always sends a value (defaulting the UI itself to
    # 99.99% when left blank), but the API is made tolerant of the same
    # omission from any other client, matching what "not required" means.
    purity: Decimal = Decimal("0.9999")
    quantity_grams: Decimal
    purchase_date: datetime.date
    purchase_price: Decimal
    total_cost: Decimal
    pricing_instrument: str | None = None

    # BUGFIX (found via E2E, see docs/qa/QA_STATE.md Batch #2): purity is
    # stored as a (0, 1] fraction (PreciousMetalHolding.purity setter ->
    # money_to_scaled, checked in the DB by ck_precious_holding_purity_range),
    # but nothing rejected an out-of-range value before it hit that CHECK
    # constraint -- e.g. a user typing the common Vietnamese "999" per-mille
    # gold-purity notation instead of "0.999" crashed the request with an
    # unhandled 500 IntegrityError instead of a clean validation error.
    @field_validator("purity")
    @classmethod
    def purity_in_unit_range(cls, value: Decimal) -> Decimal:
        if not (0 < value <= 1):
            raise ValueError("purity must be a fraction between 0 (exclusive) and 1 (inclusive), e.g. 0.999 for 999/1000 gold")
        return value


class CryptoCreate(BaseModel):
    coingecko_id: str
    symbol: str
    display_name: str | None = None
    quantity: Decimal
    purchase_date: datetime.date
    purchase_price: Decimal
    total_cost: Decimal
    pricing_instrument: str | None = None

    @field_validator("coingecko_id", "symbol")
    @classmethod
    def not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped


@router.get("/metal-brands")
def list_metal_brands() -> list[str]:
    """Managed gold/silver product catalog (TASK-031 §10): stable brand codes."""
    return [brand.value for brand in SUPPORTED_PRECIOUS_METAL_BRANDS]


@router.get("/metals")
def list_metals(db: DbSession):
    rows = db.scalars(
        select(PreciousMetalHolding)
        .options(selectinload(PreciousMetalHolding.lots))
        .order_by(PreciousMetalHolding.id)
    )
    return [
        {
            "id": row.id,
            "name": row.product_type,
            "brand": row.brand.value,
            "metal_type": row.metal_type.value,
            "quantity_grams": str(
                sum((lot.canonical_grams for lot in row.lots), Decimal(0))
            ),
        }
        for row in rows
    ]


@router.post("/metals", status_code=201)
def create_metal(data: MetalCreate, db: DbSession):
    try:
        holding = PreciousMetalHolding(
            metal_type=PreciousMetalType(data.metal_type),
            brand=data.brand,
            product_type=data.product_type,
            pricing_instrument=data.pricing_instrument,
        )
        holding.purity = data.purity
        lot = PreciousMetalLot(purchase_date=data.purchase_date)
        lot.set_quantity(data.quantity_grams, PreciousMetalQuantityUnit.GRAM)
        lot.purchase_price = data.purchase_price
        lot.total_cost = data.total_cost
        holding.lots = [lot]
        db.add(holding)
        db.commit()
        db.refresh(holding)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(400, str(exc)) from exc
    return {
        "id": holding.id,
        "name": holding.product_type,
        "brand": holding.brand.value,
        "metal_type": holding.metal_type.value,
        "quantity_grams": str(lot.canonical_grams),
    }


@router.get("/crypto/coins")
def search_coins(
    catalog: Annotated[CoinGeckoCoinListProvider, Depends(get_coin_catalog)],
    q: str = Query("", max_length=100),
):
    """TASK-031 §11.1: capped CoinGecko coin search, id/symbol/name, case-insensitive."""
    try:
        matches = catalog.search(q, limit=50)
    except CoinCatalogUnavailableError as exc:
        raise HTTPException(503, "Coin catalog is unavailable") from exc
    return [
        {"id": coin.id, "symbol": coin.symbol, "name": coin.name} for coin in matches
    ]


@router.get("/crypto")
def list_crypto(db: DbSession):
    rows = db.scalars(
        select(CryptoHolding)
        .options(selectinload(CryptoHolding.lots))
        .order_by(CryptoHolding.id)
    )
    return [
        {
            "id": row.id,
            "coingecko_id": row.coingecko_id,
            "symbol": row.symbol,
            "display_name": row.display_name,
            "quantity": str(sum((lot.quantity for lot in row.lots), Decimal(0))),
        }
        for row in rows
    ]


@router.post("/crypto", status_code=201)
def create_crypto(data: CryptoCreate, db: DbSession):
    try:
        lot = CryptoLot(
            quantity_scaled=crypto_quantity_to_scaled(data.quantity),
            purchase_date=data.purchase_date,
            purchase_price_scaled=money_to_scaled(data.purchase_price),
            total_cost_scaled=money_to_scaled(data.total_cost),
        )
        holding = CryptoHolding(
            coingecko_id=data.coingecko_id.lower(),
            symbol=data.symbol.lower(),
            display_name=data.display_name,
            pricing_instrument=data.pricing_instrument,
            lots=[lot],
        )
        db.add(holding)
        db.commit()
        db.refresh(holding)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(400, str(exc)) from exc
    return {
        "id": holding.id,
        "coingecko_id": holding.coingecko_id,
        "symbol": holding.symbol,
        "display_name": holding.display_name,
        "quantity": str(lot.quantity),
    }
