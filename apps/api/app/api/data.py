import csv
import io
from urllib.parse import unquote

from fastapi import APIRouter, Body, Depends, Header, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.ledger import FinancialEvent
from app.schemas.read_models import ImportApplyRead
from app.services.moneylover_apply import (
    ApplyResult,
    BatchNotFoundError,
    apply_import_batch,
)
from app.services.moneylover_import import import_moneylover

router = APIRouter(prefix="/api/v1", tags=["data"])


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


@router.get("/exports/events.csv")
def export_csv(db: Session = Depends(get_db)):  # noqa: B008
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["event_id", "date", "event_type", "account_id", "amount"])
    for event in db.scalars(select(FinancialEvent).order_by(FinancialEvent.id)):
        for entry in event.entries:
            writer.writerow(
                [
                    event.id,
                    event.transaction_date.isoformat(),
                    event.event_type.value,
                    entry.account_id,
                    entry.amount,
                ]
            )
    return StreamingResponse(
        iter([out.getvalue().encode()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=financial-events.csv"},
    )


@router.get("/exports/events.xlsx")
def export_xlsx(db: Session = Depends(get_db)):  # noqa: B008
    from openpyxl import Workbook  # type: ignore[import-untyped]

    wb = Workbook()
    ws = wb.active
    ws.append(["event_id", "date", "event_type", "account_id", "amount"])
    for event in db.scalars(select(FinancialEvent).order_by(FinancialEvent.id)):
        for entry in event.entries:
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
    return StreamingResponse(
        out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=financial-events.xlsx"},
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
