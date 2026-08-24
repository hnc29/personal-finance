import csv
import io

from fastapi import APIRouter, Body, Depends, Header, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.ledger import FinancialEvent
from app.services.moneylover_import import import_moneylover

router = APIRouter(prefix="/api/v1", tags=["data"])


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
    except Exception as exc:
        raise HTTPException(400, str(exc)) from exc
    db.commit()
    return {
        "id": batch.id,
        "filename": batch.original_filename,
        "row_count": batch.row_count,
        "status": "review_required",
    }
