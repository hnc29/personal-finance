"""Persistence models for statement-to-ledger reconciliation candidates."""

from __future__ import annotations

import enum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Enum, ForeignKey, Index, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.import_batch import RawImportRow
    from app.models.ledger import FinancialEvent


class ReconciliationCandidateState(str, enum.Enum):
    """Lifecycle of a deterministic reconciliation candidate."""

    UNMATCHED = "UNMATCHED"
    PROPOSED = "PROPOSED"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    AUTO_MATCHED = "AUTO_MATCHED"
    CONFIRMED = "CONFIRMED"
    REJECTED = "REJECTED"


class ReconciliationCandidate(Base):
    """A scored link between one imported statement row and a ledger event."""

    __tablename__ = "reconciliation_candidates"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        default=1,
        server_default="1",
        index=True,
    )
    raw_import_row_id: Mapped[int] = mapped_column(
        ForeignKey("raw_import_rows.id"), nullable=False
    )
    financial_event_id: Mapped[int] = mapped_column(
        ForeignKey("financial_events.id"), nullable=False
    )
    state: Mapped[ReconciliationCandidateState] = mapped_column(
        Enum(ReconciliationCandidateState, native_enum=False), nullable=False
    )
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_matches: Mapped[bool] = mapped_column(Boolean, nullable=False)
    reference_matches: Mapped[bool] = mapped_column(Boolean, nullable=False)
    reference_conflicts: Mapped[bool] = mapped_column(Boolean, nullable=False)
    date_distance_days: Mapped[int] = mapped_column(Integer, nullable=False)
    text_similarity_basis_points: Mapped[int] = mapped_column(Integer, nullable=False)

    raw_import_row: Mapped[RawImportRow] = relationship("RawImportRow")
    financial_event: Mapped[FinancialEvent] = relationship("FinancialEvent")

    __table_args__ = (
        UniqueConstraint(
            "raw_import_row_id",
            "financial_event_id",
            name="uq_reconciliation_candidate_row_event",
        ),
        Index("ix_reconciliation_candidates_raw_import_row_id", "raw_import_row_id"),
        Index("ix_reconciliation_candidates_financial_event_id", "financial_event_id"),
        Index("ix_reconciliation_candidates_state", "state"),
    )

__all__ = ["ReconciliationCandidate", "ReconciliationCandidateState"]
