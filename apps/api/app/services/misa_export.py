"""MISA export configuration and export-history services."""

import datetime
import io
from collections.abc import Sequence
from dataclasses import dataclass

from openpyxl import Workbook  # type: ignore[import-untyped]
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.money import scaled_to_money
from app.models.account import Account
from app.models.ledger import AccountEntry, FinancialEvent
from app.models.misa_export import (
    MisaAccountMapping,
    MisaExportConfiguration,
    MisaExportedEvent,
    MisaExportRun,
)
from app.schemas.misa_export import MisaExportConfigurationCreate
from app.services.statement_export import _sanitize_statement_text


class InvalidMisaAccountMappingError(ValueError):
    """Raised when mappings are missing, duplicate, or reference unknown accounts."""


class MisaEventAlreadyExportedError(ValueError):
    """Raised when history shows an event was already exported for a configuration."""


MISA_BANK_STATEMENT_HEADERS = (
    "Ngày hạch toán",
    "Ngày chứng từ",
    "Số chứng từ",
    "Diễn giải",
    "Tài khoản ngân hàng",
    "Tên tài khoản ngân hàng",
    "Thu",
    "Chi",
    "Loại tiền",
    "Mã sự kiện nguồn",
)


@dataclass(frozen=True)
class MisaWorkbookExport:
    """Generated workbook bytes and the persisted history run."""

    content: bytes
    filename: str
    export_run: MisaExportRun


def create_configuration(
    session: Session, payload: MisaExportConfigurationCreate
) -> MisaExportConfiguration:
    """Persist a configuration after validating explicit source mappings."""
    name = payload.name.strip()
    currency = payload.currency.strip().upper()
    if not name:
        raise ValueError("configuration name must not be blank")
    if len(currency) != 3 or not currency.isalpha():
        raise ValueError("configuration currency must be a three-letter code")

    source_ids = [mapping.source_account_id for mapping in payload.mappings]
    if len(source_ids) != len(set(source_ids)):
        raise InvalidMisaAccountMappingError("each source account may be mapped only once")

    accounts = session.scalars(select(Account).where(Account.id.in_(source_ids))).all()
    existing_ids = {account.id for account in accounts}
    missing_ids = sorted(set(source_ids) - existing_ids)
    if missing_ids:
        raise InvalidMisaAccountMappingError(f"unknown source account ids: {missing_ids}")
    wrong_currency_ids = sorted(account.id for account in accounts if account.currency != currency)
    if wrong_currency_ids:
        raise InvalidMisaAccountMappingError(
            f"source accounts do not use configuration currency {currency}: {wrong_currency_ids}"
        )

    normalized_mappings: list[tuple[int, str, str]] = []
    target_names: dict[str, str] = {}
    for mapping in payload.mappings:
        target_code = mapping.target_account_code.strip()
        target_name = mapping.target_account_name.strip()
        if not target_code or not target_name:
            raise InvalidMisaAccountMappingError("target account code and name must not be blank")
        previous_name = target_names.setdefault(target_code, target_name)
        if previous_name != target_name:
            raise InvalidMisaAccountMappingError(
                f"target account code {target_code!r} has inconsistent names"
            )
        normalized_mappings.append((mapping.source_account_id, target_code, target_name))

    configuration = MisaExportConfiguration(
        name=name,
        export_format=payload.export_format,
        currency=currency,
        account_mappings=[
            MisaAccountMapping(
                source_account_id=source_account_id,
                target_account_code=target_code,
                target_account_name=target_name,
            )
            for source_account_id, target_code, target_name in normalized_mappings
        ],
    )
    session.add(configuration)
    try:
        session.commit()
    except Exception:
        session.rollback()
        raise
    session.refresh(configuration)
    return configuration


def list_exportable_events(session: Session, configuration_id: int) -> list[FinancialEvent]:
    """Return fully mapped events not previously exported by this configuration."""
    mapped_account_ids = select(MisaAccountMapping.source_account_id).where(
        MisaAccountMapping.configuration_id == configuration_id
    )
    exported_event_ids = select(MisaExportedEvent.financial_event_id).where(
        MisaExportedEvent.configuration_id == configuration_id
    )
    return list(
        session.scalars(
            select(FinancialEvent)
            .options(selectinload(FinancialEvent.entries))
            .where(~FinancialEvent.id.in_(exported_event_ids))
            .where(FinancialEvent.entries.any())
            .where(
                ~FinancialEvent.entries.any(
                    ~AccountEntry.account_id.in_(mapped_account_ids)
                )
            )
            .order_by(FinancialEvent.transaction_date, FinancialEvent.id)
        )
    )


def record_export(
    session: Session,
    configuration_id: int,
    event_ids: Sequence[int],
    output_filename: str,
    *,
    exported_at: datetime.datetime | None = None,
) -> MisaExportRun:
    """Atomically persist completed export history and reject accidental repeats."""
    unique_event_ids = list(dict.fromkeys(event_ids))
    if not unique_event_ids:
        raise ValueError("an export run requires at least one event")
    if not output_filename.strip():
        raise ValueError("output filename must not be blank")
    configuration = session.get(MisaExportConfiguration, configuration_id)
    if configuration is None:
        raise ValueError(f"unknown MISA export configuration: {configuration_id}")
    if not configuration.is_active:
        raise ValueError(f"inactive MISA export configuration: {configuration_id}")

    known_ids = set(
        session.scalars(select(FinancialEvent.id).where(FinancialEvent.id.in_(unique_event_ids))).all()
    )
    missing_ids = sorted(set(unique_event_ids) - known_ids)
    if missing_ids:
        raise ValueError(f"unknown financial event ids: {missing_ids}")

    exportable_ids = {
        event.id for event in list_exportable_events(session, configuration_id)
    }
    unavailable_ids = sorted(set(unique_event_ids) - exportable_ids)
    if unavailable_ids:
        already_exported = session.scalars(
            select(MisaExportedEvent.financial_event_id).where(
                MisaExportedEvent.configuration_id == configuration_id,
                MisaExportedEvent.financial_event_id.in_(unavailable_ids),
            )
        ).all()
        if already_exported:
            raise MisaEventAlreadyExportedError(
                f"events already exported for configuration {configuration_id}: "
                f"{sorted(already_exported)}"
            )
        raise InvalidMisaAccountMappingError(
            f"events are not fully mapped for configuration {configuration_id}: {unavailable_ids}"
        )

    run = MisaExportRun(
        configuration_id=configuration_id,
        exported_at=exported_at or datetime.datetime.now(datetime.UTC),
        output_filename=output_filename.strip(),
        exported_events=[
            MisaExportedEvent(configuration_id=configuration_id, financial_event_id=event_id)
            for event_id in unique_event_ids
        ],
    )
    session.add(run)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise MisaEventAlreadyExportedError("one or more events were already exported") from exc
    except Exception:
        session.rollback()
        raise
    session.refresh(run)
    return run


def export_misa_workbook(
    session: Session,
    configuration_id: int,
    output_filename: str,
    event_ids: Sequence[int] | None = None,
    *,
    exported_at: datetime.datetime | None = None,
) -> MisaWorkbookExport:
    """Build a structured bank-statement workbook and persist its export history.

    When ``event_ids`` is omitted, every currently exportable event is included.
    Explicit event selections must also be fully mapped and not previously
    exported, which prevents callers from bypassing the default safety check.
    """
    configuration = session.scalar(
        select(MisaExportConfiguration)
        .options(selectinload(MisaExportConfiguration.account_mappings))
        .where(MisaExportConfiguration.id == configuration_id)
    )
    if configuration is None:
        raise ValueError(f"unknown MISA export configuration: {configuration_id}")
    if not configuration.is_active:
        raise ValueError(f"inactive MISA export configuration: {configuration_id}")

    exportable_events = list_exportable_events(session, configuration_id)
    exportable_by_id = {event.id: event for event in exportable_events}
    if event_ids is None:
        selected_events = exportable_events
    else:
        selected_ids = list(dict.fromkeys(event_ids))
        unavailable_ids = sorted(set(selected_ids) - exportable_by_id.keys())
        if unavailable_ids:
            raise ValueError(
                "events are unmapped, unknown, or already exported for "
                f"configuration {configuration_id}: {unavailable_ids}"
            )
        selected_events = [exportable_by_id[event_id] for event_id in selected_ids]
    if not selected_events:
        raise ValueError("no exportable events selected")

    mappings = {
        mapping.source_account_id: mapping for mapping in configuration.account_mappings
    }
    workbook = Workbook(write_only=True)
    worksheet = workbook.create_sheet("Bank statement")
    worksheet.append(MISA_BANK_STATEMENT_HEADERS)
    for event in selected_events:
        description = event.note or event.payee_text or event.event_type.value
        for entry in sorted(event.entries, key=lambda item: item.id):
            mapping = mappings[entry.account_id]
            amount = scaled_to_money(abs(entry.amount_scaled))
            receipt = amount if entry.amount_scaled > 0 else None
            payment = amount if entry.amount_scaled < 0 else None
            row = (
                event.transaction_date,
                event.transaction_date,
                f"PF-{event.id}",
                description,
                mapping.target_account_code,
                mapping.target_account_name,
                receipt,
                payment,
                configuration.currency,
                event.id,
            )
            worksheet.append(
                tuple(
                    _sanitize_statement_text(value) if isinstance(value, str) else value
                    for value in row
                )
            )

    output = io.BytesIO()
    workbook.save(output)
    run = record_export(
        session,
        configuration_id,
        [event.id for event in selected_events],
        output_filename,
        exported_at=exported_at,
    )
    return MisaWorkbookExport(
        content=output.getvalue(), filename=output_filename, export_run=run
    )
