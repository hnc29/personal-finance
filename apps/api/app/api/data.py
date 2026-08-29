import csv
import datetime
import io
import re
import unicodedata
from urllib.parse import unquote

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.account import Account
from app.models.ledger import AccountEntry, FinancialEvent
from app.schemas.read_models import ImportApplyRead
from app.services.moneylover_apply import (
    ApplyResult,
    BatchNotFoundError,
    apply_import_batch,
)
from app.services.moneylover_import import import_moneylover

router = APIRouter(prefix="/api/v1", tags=["data"])


# BUGFIX (user report, 2026-08-26: "Chức năng xuất dữ liệu: Lựa chọn tài
# khoản, ngày bắt đầu, ngày kết thúc"): exports used to always dump every
# entry of every event with no way to scope them. Filters here are all
# optional and additive -- an unfiltered call behaves exactly as before, so
# nothing that already depended on the old export shape breaks.
def _export_rows(
    db: Session,
    account_id: int | None,
    start_date: datetime.date | None,
    end_date: datetime.date | None,
) -> list[tuple[AccountEntry, FinancialEvent]]:
    if start_date is not None and end_date is not None and start_date > end_date:
        raise HTTPException(400, "start_date must not be after end_date")
    stmt = (
        select(AccountEntry, FinancialEvent)
        .join(FinancialEvent, AccountEntry.financial_event_id == FinancialEvent.id)
        .order_by(FinancialEvent.id, AccountEntry.id)
    )
    if account_id is not None:
        stmt = stmt.where(AccountEntry.account_id == account_id)
    if start_date is not None:
        stmt = stmt.where(FinancialEvent.transaction_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(FinancialEvent.transaction_date <= end_date)
    return [(entry, event) for entry, event in db.execute(stmt).all()]


def _apply_result_dict(result: ApplyResult) -> dict:
    return {
        "batch_id": result.batch_id,
        "total_rows": result.total_rows,
        "already_applied_rows": result.already_applied_rows,
        "transfer_pairs_applied": result.transfer_pairs_applied,
        "expense_income_rows_applied": result.expense_income_rows_applied,
        "applied_rows": result.applied_rows,
        "categorized_rows": result.categorized_rows,
        "uncategorized_rows": result.uncategorized_rows,
        "invalid_rows": result.invalid_rows,
        "unmatched_wallets": result.unmatched_wallets,
        "unmatched_row_count": result.unmatched_row_count,
    }


def _format_export_filename(
    db: Session,
    account_id: int | None,
    start_date: datetime.date | None,
    end_date: datetime.date | None,
    ext: str,
) -> str:
    account_name = "Tat-ca-tai-khoan"
    if account_id is not None:
        acc = db.get(Account, account_id)
        if acc:
            normalized = unicodedata.normalize("NFKD", acc.name).encode("ascii", "ignore").decode("ascii")
            sanitized = re.sub(r"[^\w\-]+", "_", normalized.strip())
            account_name = sanitized or f"Tai-khoan-{account_id}"
    start_str = start_date.isoformat() if start_date else "tu-dau"
    end_str = end_date.isoformat() if end_date else "den-nay"
    return f"{account_name}_{start_str}_{end_str}.{ext}"


@router.get("/exports/events.csv")
def export_csv(
    db: Session = Depends(get_db),  # noqa: B008
    account_id: int | None = Query(None),
    start_date: datetime.date | None = Query(None),  # noqa: B008
    end_date: datetime.date | None = Query(None),  # noqa: B008
):
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["event_id", "date", "event_type", "account_id", "amount"])
    for entry, event in _export_rows(db, account_id, start_date, end_date):
        writer.writerow(
            [
                event.id,
                event.transaction_date.isoformat(),
                event.event_type.value,
                entry.account_id,
                entry.amount,
            ]
        )
    filename = _format_export_filename(db, account_id, start_date, end_date, "csv")
    return StreamingResponse(
        iter([out.getvalue().encode()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/exports/events.xlsx")
def export_xlsx(
    db: Session = Depends(get_db),  # noqa: B008
    account_id: int | None = Query(None),
    start_date: datetime.date | None = Query(None),  # noqa: B008
    end_date: datetime.date | None = Query(None),  # noqa: B008
):
    from openpyxl import Workbook  # type: ignore[import-untyped]

    wb = Workbook()
    ws = wb.active
    ws.append(["event_id", "date", "event_type", "account_id", "amount"])
    for entry, event in _export_rows(db, account_id, start_date, end_date):
        ws.append(
            [
                event.id,
                event.transaction_date.isoformat(),
                event.event_type.value,
                entry.account_id,
                str(entry.amount),
            ]
        )
    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    filename = _format_export_filename(db, account_id, start_date, end_date, "xlsx")
    return StreamingResponse(
        out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/exports/statement/data")
def export_statement_json(
    db: Session = Depends(get_db),  # noqa: B008
    account_id: int | None = Query(None),
    start_date: datetime.date | None = Query(None),  # noqa: B008
    end_date: datetime.date | None = Query(None),  # noqa: B008
):
    from app.services.statement_export import get_statement_data

    return get_statement_data(db, account_id, start_date, end_date)


@router.get("/exports/statement.xlsx")
def export_statement_xlsx(
    db: Session = Depends(get_db),  # noqa: B008
    account_id: int | None = Query(None),
    start_date: datetime.date | None = Query(None),  # noqa: B008
    end_date: datetime.date | None = Query(None),  # noqa: B008
):
    from app.services.statement_export import generate_statement_xlsx

    out = generate_statement_xlsx(db, account_id, start_date, end_date)
    filename = _format_export_filename(db, account_id, start_date, end_date, "xlsx")
    filename = f"sao_ke_{filename}"
    return StreamingResponse(
        out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/exports/statement.csv")
def export_statement_csv(
    db: Session = Depends(get_db),  # noqa: B008
    account_id: int | None = Query(None),
    start_date: datetime.date | None = Query(None),  # noqa: B008
    end_date: datetime.date | None = Query(None),  # noqa: B008
):
    from app.services.statement_export import generate_statement_csv

    out = generate_statement_csv(db, account_id, start_date, end_date)
    filename = _format_export_filename(db, account_id, start_date, end_date, "csv")
    filename = f"sao_ke_{filename}"
    # Prepend UTF-8 BOM for Excel compatibility
    csv_bytes = b"\xef\xbb\xbf" + out.getvalue().encode("utf-8")
    return StreamingResponse(
        iter([csv_bytes]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/imports/money-lover")
def import_money_lover(
    payload: bytes = Body(...),
    filename: str = Header("upload.xlsx", alias="X-Filename"),
    db: Session = Depends(get_db),  # noqa: B008
):
    # TASK-038: the frontend percent-encodes the filename before putting it
    # in this header (see DataPage's upload()) because raw HTTP header
    # values must be Latin-1/ByteString -- any non-ASCII character (e.g.
    # Vietnamese diacritics in a real Money Lover export filename like
    # "...Tổng cộng...xlsx") makes the browser's fetch() throw synchronously
    # when constructing the request, well before anything reaches this
    # endpoint. unquote() undoes that encoding so the stored/displayed
    # filename is the real one, not percent-escaped.
    filename = unquote(filename)
    name = filename.replace("/", "_").replace("\\", "_")
    if not name.lower().endswith((".csv", ".xlsx")):
        raise HTTPException(415, "Only .csv or .xlsx files are supported")
    if len(payload) > 10 * 1024 * 1024:
        raise HTTPException(413, "File too large")
    if name.lower().endswith(".csv"):
        from openpyxl import Workbook

        try:
            rows = list(csv.reader(io.StringIO(payload.decode("utf-8-sig"))))
            workbook = Workbook()
            sheet = workbook.active
            sheet.title = "Sổ giao dịch"
            for row in rows:
                sheet.append(row)
            converted = io.BytesIO()
            workbook.save(converted)
            payload = converted.getvalue()
        except (UnicodeDecodeError, csv.Error) as exc:
            raise HTTPException(400, "Invalid CSV file") from exc
    try:
        batch = import_moneylover(db, payload, name)
        # TASK-040: "dữ liệu tải lên nhưng không đưa vào data ... hãy đưa
        # thẳng các bản ghi vào tương ứng" -- an upload used to only ever
        # create raw rows that nothing ever consumed. Applying in the same
        # request/transaction as the import means a fresh upload shows up
        # in Transactions/net worth immediately, with no separate manual
        # step; unmatched wallets or invalid rows are reported back rather
        # than silently dropped or blocking the whole batch.
        apply_result = apply_import_batch(db, batch.id)
    except Exception as exc:
        raise HTTPException(400, str(exc)) from exc
    db.commit()
    return {
        "id": batch.id,
        "filename": batch.original_filename,
        "row_count": batch.row_count,
        "status": "review_required",
        "apply": _apply_result_dict(apply_result),
    }


@router.post("/imports/{batch_id}/apply", response_model=ImportApplyRead)
def apply_import(batch_id: int, db: Session = Depends(get_db)):  # noqa: B008
    """Apply (or re-apply) a batch's not-yet-applied rows to the ledger.

    Idempotent -- rows already applied (e.g. by the auto-apply above, or a
    previous call here) are skipped, so this is also how an existing batch
    (imported before TASK-040 shipped) or a batch with some previously
    unmatched wallets (fixed since) gets pushed into the ledger.
    """
    try:
        result = apply_import_batch(db, batch_id)
    except BatchNotFoundError as exc:
        raise HTTPException(404, "Import batch not found") from exc
    db.commit()
    return _apply_result_dict(result)
