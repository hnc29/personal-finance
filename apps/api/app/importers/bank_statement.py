"""Common normalized model and protocol for bank-statement adapters."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import BinaryIO, Protocol

StatementSource = bytes | BinaryIO


@dataclass(frozen=True, slots=True)
class NormalizedBankStatementRow:
    """A source statement row expressed in bank-independent fields."""

    source_row_number: int
    transaction_date: date
    effective_date: date | None
    reference: str | None
    description: str | None
    debit: Decimal | None
    credit: Decimal | None
    signed_amount: Decimal
    running_balance: Decimal | None


class BankStatementAdapter(Protocol):
    """Interface implemented by bank-specific XLSX statement adapters."""

    def parse(
        self, source: StatementSource
    ) -> tuple[NormalizedBankStatementRow, ...]: ...
