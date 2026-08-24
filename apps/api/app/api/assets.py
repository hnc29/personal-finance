import datetime
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.money import money_to_scaled
from app.models.crypto import (
    CryptoAsset,
    CryptoHolding,
    CryptoLot,
    crypto_quantity_to_scaled,
)
from app.models.precious_metal import (
    PreciousMetalBrand,
    PreciousMetalHolding,
    PreciousMetalLot,
    PreciousMetalQuantityUnit,
    PreciousMetalType,
)
from app.models.savings import SavingsAccount, SavingsProduct
from app.services.savings import open_savings

router = APIRouter(prefix="/api/v1/assets", tags=["assets"])
DbSession = Annotated[Session, Depends(get_db)]


class SavingsCreate(BaseModel):
    name: str
    institution: str
    principal: Decimal
    opened_date: datetime.date

    @field_validator("principal")
    @classmethod
    def exact_money(cls, value: Decimal) -> Decimal:
        money_to_scaled(value)
        return value


class MetalCreate(BaseModel):
    metal_type: Literal["GOLD", "SILVER"]
    brand: PreciousMetalBrand = PreciousMetalBrand.RAW
    product_type: str
    purity: Decimal
    quantity_grams: Decimal
    purchase_date: datetime.date
    purchase_price: Decimal
    total_cost: Decimal
    pricing_instrument: str | None = None


class CryptoCreate(BaseModel):
    quantity: Decimal
    purchase_date: datetime.date
    purchase_price: Decimal
    total_cost: Decimal
    pricing_instrument: str | None = None


@router.get("/savings")
def list_savings(db: DbSession):
    return [
        {
            "id": row.id,
            "name": row.name,
            "principal": str(row.principal),
            "institution": row.product.institution,
        }
        for row in db.scalars(
            select(SavingsAccount)
            .options(selectinload(SavingsAccount.product))
            .order_by(SavingsAccount.id)
        )
    ]


@router.post("/savings", status_code=201)
def create_savings(data: SavingsCreate, db: DbSession):
    product = SavingsProduct(
        name=data.name, institution=data.institution, currency="VND"
    )
    db.add(product)
    db.flush()
    row = open_savings(
        db,
        product=product,
        name=data.name,
        principal=data.principal,
        opened_date=data.opened_date,
    )
    return {
        "id": row.id,
        "name": row.name,
        "principal": str(row.principal),
        "institution": product.institution,
    }


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
        "metal_type": holding.metal_type.value,
        "quantity_grams": str(lot.canonical_grams),
    }


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
            "asset": row.asset.value,
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
            asset=CryptoAsset.BTC,
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
        "asset": holding.asset.value,
        "quantity": str(lot.quantity),
    }
