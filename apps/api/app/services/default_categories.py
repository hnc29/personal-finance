"""Deterministic starter category taxonomy for a new ledger."""

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.category import Category

CategoryNode = tuple[str, Sequence["CategoryNode"]]

DEFAULT_CATEGORIES: Sequence[CategoryNode] = (
    ("Expenses", (
        ("Ăn uống", (
            ("Ăn sáng", ()),
            ("Ăn trưa", ()),
            ("Ăn nhậu", ()),
            ("Cafe Trà", ()),
        )),
        ("Gia đình", (
            ("Ck vợ", ()),
            ("Ck mẹ", ()),
            ("Mua đồ dùng gđ", ()),
            ("Chợ Siêu thị", ()),
        )),
        ("Giáo dục", (
            ("TIT HP", ()),
            ("NHÍM HP", ()),
            ("BON HP", ()),
        )),
        ("CON CÁI", (
            ("Tiêu vặt Tít", ()),
            ("Đồng phục", ()),
            ("Tit ngoại khoá", ()),
            ("Sách vở", ()),
            ("Tiêu vặt Nhím", ()),
            ("Tiêu vặt Bon", ()),
        )),
        ("Di chuyển", (
            ("Xăng cr", ()),
            ("Bảo dưỡng xe", ()),
            ("Taxi Thuê xe", ()),
            ("Xăng lead", ()),
            ("Phí Cầu đường", ()),
            ("Xăng dr", ()),
            ("Gửi xe", ()),
            ("Rửa xe", ()),
            ("BUS", ()),
        )),
        ("Hoá đơn & Tiện ích", (
            ("Hoá đơn điện", ()),
            ("Hoá đơn nước", ()),
            ("Thuế đất", ()),
            ("Hoá đơn điện thoại", ()),
        )),
        ("Mua sắm", (
            ("Quần áo", ()),
            ("Mua đồ điện tử, đt", ()),
            ("Làm đẹp", ()),
            ("Đồ gia dụng", ()),
            ("Phần mềm, AI", ()),
            ("Đồ dùng cá nhân", ()),
        )),
        ("Sức khỏe", (
            ("Khám sức khoẻ", ()),
            ("Thuốc men", ()),
            ("Cắt tóc", ()),
        )),
        ("Đầu tư", (
            ("Ack", ()),
            ("NN", ()),
            ("Đầu tư coin", ()),
        )),
        ("Thăm hỏi", (
            ("Hiếu hỉ", ()),
        )),
        ("Chi hộ", (
            ("Chi hộ thẻ TD", ()),
        )),
        ("ĐIỀU CHỈNH SỐ DƯ", ()),
        ("Trả nợ", ()),
        ("Cho vay", ()),
        ("Cho tặng từ thiện", ()),
        ("Phí Ck", ()),
        ("Trả lãi", ()),
        ("Giải trí", (
            ("Vui - chơi", ()),
        )),
        ("RT", ()),
        ("Tilo Pp", ()),
        ("Các chi phí khác", ()),
        ("Chưa phân loại", ()),
    )),
    ("Income", (
        ("Lương", ()),
        ("Thu hộ", ()),
        ("Thu coin", ()),
        ("Thu nợ", ()),
        ("Cho tặng", ()),
        ("RT thẻ", ()),
        ("Thanh lý", ()),
        ("Tiền hoàn Bank", ()),
        ("Thu lãi", ()),
        ("Chưa phân loại", ()),
    )),
)


def merge_default_categories(db: Session) -> dict[str, int]:
    """Safely merge the canonical tree, preserving conflicting user rows."""
    created = existing = conflicts = 0

    def add(nodes: Sequence[CategoryNode], parent: Category | None = None) -> None:
        nonlocal created, existing, conflicts
        for name, children in nodes:
            parent_id = parent.id if parent else None
            category = db.scalar(select(Category).where(Category.name == name, Category.parent_id == parent_id))
            if category is None:
                conflict = db.scalar(select(Category).where(Category.name == name))
                if conflict is not None and name != "Chưa phân loại":
                    conflicts += 1
                    existing += 1
                    add(children, conflict)
                    continue
                category = Category(name=name, parent=parent)
                db.add(category)
                db.flush()
                created += 1
            else:
                existing += 1
            add(children, category)

    try:
        add(DEFAULT_CATEGORIES)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"inserted": created, "existing": existing, "conflicts": conflicts}


def seed_default_categories(db: Session, *, force: bool = False) -> int:
    """Backward-compatible wrapper for the safe merge."""
    if not force and db.scalar(select(Category.id)) is not None:
        return 0
    return merge_default_categories(db)["inserted"]


def missing_default_categories(db: Session) -> int:
    """Count canonical paths that are absent without changing the database."""
    missing = 0

    def check(nodes: Sequence[CategoryNode], parent: Category | None = None) -> None:
        nonlocal missing
        for name, children in nodes:
            parent_id = parent.id if parent else None
            category = db.scalar(select(Category).where(Category.name == name, Category.parent_id == parent_id))
            if category is None:
                category = db.scalar(select(Category).where(Category.name == name))
            if category is None:
                missing += 1
                check_missing(children)
            else:
                check(children, category)

    def check_missing(nodes: Sequence[CategoryNode]) -> None:
        nonlocal missing
        for _name, children in nodes:
            missing += 1
            check_missing(children)

    check(DEFAULT_CATEGORIES)
    return missing
