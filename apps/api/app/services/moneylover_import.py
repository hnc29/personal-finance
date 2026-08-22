"""Immutable raw ingestion for Money Lover files."""

from datetime import UTC, datetime
from typing import BinaryIO

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.importers.moneylover import (
    parse_moneylover_xlsx,
    raw_payload_text,
    semantic_fingerprint,
)
from app.models.import_batch import ImportBatch, RawImportRow


class DuplicateImportFile(ValueError):
    pass


def import_moneylover(
    session: Session, source: bytes | BinaryIO, original_filename: str = "moneylover.xlsx"
) -> ImportBatch:
    parsed = parse_moneylover_xlsx(source)
    if session.scalar(select(ImportBatch).where(ImportBatch.file_sha256 == parsed.file_sha256)) is not None:
        raise DuplicateImportFile(f"file already imported: {parsed.file_sha256}")
    batch = ImportBatch(source="money_lover", original_filename=original_filename, file_sha256=parsed.file_sha256, imported_at=datetime.now(UTC).replace(tzinfo=None), row_count=len(parsed.rows))
    batch.rows = [
        RawImportRow(
            source_row_number=row.source_row_number,
            source_row_id=row.source_row_id,
            raw_payload=raw_payload_text(row.raw_payload),
            semantic_fingerprint=semantic_fingerprint(row.raw_payload),
        )
        for row in parsed.rows
    ]
    session.add(batch)
    session.flush()
    return batch
