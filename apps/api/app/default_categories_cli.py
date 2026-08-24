"""CLI entry point for safe default-category seeding."""

import argparse

from app.core.database import SessionLocal
from app.services.default_categories import seed_default_categories


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed starter finance categories")
    parser.add_argument("--force", action="store_true", help="add missing catalog paths to a non-empty table")
    args = parser.parse_args()
    with SessionLocal() as db:
        count = seed_default_categories(db, force=args.force)
    print(f"Default categories: {count} created")


if __name__ == "__main__":
    main()
