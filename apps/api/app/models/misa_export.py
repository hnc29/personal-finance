"""Persistence models for MISA export configuration and history."""

import datetime
import enum
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.account import Account
    from app.models.ledger import FinancialEvent


class MisaExportFormat(str, enum.Enum):
    """Structured MISA-compatible formats supported by a configuration."""

    BANK_STATEMENT_XLSX = "BANK_STATEMENT_XLSX"


class MisaExportConfiguration(Base):
    """Named export destination and its explicit account mappings."""

    __tablename__ = "misa_export_configurations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    export_format: Mapped[MisaExportFormat] = mapped_column(
        Enum(MisaExportFormat, native_enum=False), nullable=False
    )
    currency: Mapped[str] = mapped_column(String, nullable=False, default="VND", server_default="VND")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("1"))

    account_mappings: Mapped[list["MisaAccountMapping"]] = relationship(
        back_populates="configuration", cascade="all, delete-orphan"
    )
    export_runs: Mapped[list["MisaExportRun"]] = relationship(back_populates="configuration")


class MisaAccountMapping(Base):
    """Map one canonical account to a MISA account identity.

    The target fields deliberately have no uniqueness constraint: multiple
    canonical accounts may map to the same MISA account.
    """

    __tablename__ = "misa_account_mappings"

    id: Mapped[int] = mapped_column(primary_key=True)
    configuration_id: Mapped[int] = mapped_column(
        ForeignKey("misa_export_configurations.id"), nullable=False
    )
    source_account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), nullable=False)
    target_account_code: Mapped[str] = mapped_column(String, nullable=False)
    target_account_name: Mapped[str] = mapped_column(String, nullable=False)

    configuration: Mapped["MisaExportConfiguration"] = relationship(back_populates="account_mappings")
    source_account: Mapped["Account"] = relationship()

    __table_args__ = (
        UniqueConstraint(
            "configuration_id", "source_account_id", name="uq_misa_mapping_configuration_source"
        ),
        Index("ix_misa_account_mappings_source_account_id", "source_account_id"),
    )


class MisaExportRun(Base):
    """One successfully persisted MISA export operation."""

    __tablename__ = "misa_export_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    configuration_id: Mapped[int] = mapped_column(
        ForeignKey("misa_export_configurations.id"), nullable=False
    )
    exported_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    output_filename: Mapped[str] = mapped_column(String, nullable=False)

    configuration: Mapped["MisaExportConfiguration"] = relationship(back_populates="export_runs")
    exported_events: Mapped[list["MisaExportedEvent"]] = relationship(
        back_populates="export_run", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("id", "configuration_id", name="uq_misa_export_run_configuration"),
        Index("ix_misa_export_runs_configuration_id", "configuration_id"),
    )


class MisaExportedEvent(Base):
    """History link preventing an event from being exported twice by default."""

    __tablename__ = "misa_exported_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    export_run_id: Mapped[int] = mapped_column(nullable=False)
    configuration_id: Mapped[int] = mapped_column(nullable=False)
    financial_event_id: Mapped[int] = mapped_column(ForeignKey("financial_events.id"), nullable=False)

    export_run: Mapped["MisaExportRun"] = relationship(back_populates="exported_events")
    financial_event: Mapped["FinancialEvent"] = relationship()

    __table_args__ = (
        ForeignKeyConstraint(
            ["export_run_id", "configuration_id"],
            ["misa_export_runs.id", "misa_export_runs.configuration_id"],
            name="fk_misa_exported_event_run_configuration",
        ),
        UniqueConstraint(
            "configuration_id", "financial_event_id", name="uq_misa_exported_configuration_event"
        ),
        Index("ix_misa_exported_events_export_run_id", "export_run_id"),
        Index("ix_misa_exported_events_financial_event_id", "financial_event_id"),
    )
