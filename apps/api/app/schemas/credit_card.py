"""Pydantic schemas for credit-card profiles."""

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.money import money_to_scaled


class CreditCardProfileBase(BaseModel):
    credit_limit: Decimal = Field(ge=0)
    statement_day: int = Field(ge=1, le=31)
    payment_due_day: int = Field(ge=1, le=31)
    payment_due_month_offset: int = Field(default=0, ge=0)

    @field_validator("credit_limit", mode="before")
    @classmethod
    def validate_credit_limit(cls, value: object) -> object:
        money_to_scaled(value)  # type: ignore[arg-type]
        return value


class CreditCardProfileCreate(CreditCardProfileBase):
    account_id: int = Field(gt=0)


class CreditCardProfileUpdate(BaseModel):
    credit_limit: Decimal | None = Field(default=None, ge=0)
    statement_day: int | None = Field(default=None, ge=1, le=31)
    payment_due_day: int | None = Field(default=None, ge=1, le=31)
    payment_due_month_offset: int | None = Field(default=None, ge=0)

    @field_validator("credit_limit", mode="before")
    @classmethod
    def validate_credit_limit(cls, value: object) -> object:
        if value is not None:
            money_to_scaled(value)  # type: ignore[arg-type]
        return value


class CreditCardProfileRead(CreditCardProfileBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    account_id: int
