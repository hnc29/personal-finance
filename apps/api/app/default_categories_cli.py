"""CLI entry point for safe default-category seeding."""

import argparse

from app.core.database import SessionLocal
from app.services.default_categories import (
    merge_default_categories,
    missing_default_categories,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed starter finance categories")
    parser.add_argument("command", nargs="?", choices=("merge", "check"), default="merge")
    args = parser.parse_args()
    with SessionLocal() as db:
        if args.command == "check":
            result = {"missing": missing_default_categories(db)}
        else:
            result = merge_default_categories(db)
    print("Default categories: " + ", ".join(f"{k}={v}" for k, v in result.items()))


if __name__ == "__main__":
    main()
