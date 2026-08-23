"""Operator CLI for online backup and offline restore preparation."""

import argparse
from pathlib import Path

from app.core.config import settings
from app.services.backup import create_backup, prepare_restore, validate_backup


def main() -> None:
    parser = argparse.ArgumentParser(description="Personal Finance SQLite backup workflow")
    commands = parser.add_subparsers(dest="command", required=True)
    backup = commands.add_parser("create")
    backup.add_argument("destination", type=Path)
    validate = commands.add_parser("validate")
    validate.add_argument("backup", type=Path)
    restore = commands.add_parser("prepare-restore")
    restore.add_argument("backup", type=Path)
    restore.add_argument("replacement", type=Path)
    args = parser.parse_args()

    if args.command == "create":
        create_backup(settings.database_path, args.destination)
    elif args.command == "validate":
        validate_backup(args.backup)
    else:
        prepare_restore(args.backup, args.replacement)


if __name__ == "__main__":
    main()
