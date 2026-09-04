"""Import models: batches of imported source files and their raw rows."""

import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class ImportBatch(Base):
    """A single import of one source file.

    ``file_sha256`` is the digest of the exact file bytes and is indexed so an
    already-imported file can be detected by looking up its hash.
    """

    __tablename__ = "import_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        default=1,
        server_default="1",
        index=True,
    )
    source: Mapped[str] = mapped_column(String, nullable=False)
    original_filename: Mapped[str] = mapped_column(String, nullable=False)
    file_sha256: Mapped[str] = mapped_column(String, nullable=False)
    imported_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False)

    rows: Mapped[list["RawImportRow"]] = relationship(
        "RawImportRow",
        back_populates="import_batch",
    )

    __table_args__ = (Index("ix_import_batches_file_sha256", "file_sha256"),)


class RawImportRow(Base):
    """An immutable raw record from an imported source file.

    ``raw_payload`` holds the original source row verbatim; it is never
    normalized or overwritten. Each source row number is unique within its
    batch.
    """

    __tablename__ = "raw_import_rows"

    id: Mapped[int] = mapped_column(primary_key=True)
    import_batch_id: Mapped[int] = mapped_column(
        ForeignKey("import_batches.id"),
        nullable=False,
    )
    source_row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    source_row_id: Mapped[str | None] = mapped_column(String, nullable=True)
    raw_payload: Mapped[str] = mapped_column(Text, nullable=False)
    semantic_fingerprint: Mapped[str | None] = mapped_column(String, nullable=True)

    import_batch: Mapped["ImportBatch"] = relationship(
        "ImportBatch",
        back_populates="rows",
    )

    __table_args__ = (
        UniqueConstraint(
            "import_batch_id",
            "source_row_number",
            name="uq_raw_import_rows_batch_row_number",
        ),
    )
