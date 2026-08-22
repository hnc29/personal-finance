# Personal Finance — Claude Code Rules

## Scope

This is a local-first personal finance application.

Work only on the explicitly assigned TASK.
Do not broaden the scope or implement future features without instruction.

## Architecture

Backend:
- Python 3.12
- FastAPI
- SQLAlchemy 2 synchronous ORM
- SQLite WAL
- Alembic
- Pydantic 2
- uv

Frontend later:
- Next.js
- TypeScript

AI later:
- Ollama is the default local runtime.
- Cloud AI must remain optional.

## Database

Alembic is the sole schema authority.

Never:
- call Base.metadata.create_all()
- manually alter the SQLite schema
- delete or reset the production/local finance database

SQLite must retain:
- foreign_keys=ON
- journal_mode=WAL
- synchronous=NORMAL
- busy_timeout=10000

## Money

Never use Python float for monetary values.

Rules:
- Application/API representation: Decimal
- Persistent representation: INTEGER scaled by 10,000
- MONEY_SCALE = 10_000
- Never silently round money
- Reject values with more than 4 decimal places

## Sensitive financial data

Do NOT inspect, read, summarize, copy, transmit or modify real user
financial data unless explicitly authorized for the current task.

Do not read:
- data/**
- .env
- bank statements
- Money Lover exports
- MISA exports
- backups
- credentials
- API keys

Tests must use synthetic or explicitly anonymized fixtures.

Never include real financial data in prompts, logs, test snapshots,
commit messages or generated documentation.

## Development

Before editing:
1. Inspect only files relevant to the current task.
2. Run existing tests.
3. Stop and report if the baseline is already failing.

During implementation:
- Prefer the smallest correct implementation.
- Do not add dependencies unless necessary.
- Preserve all existing passing behavior.
- Do not refactor unrelated code.
- Do not implement speculative abstractions.

## Validation

Before declaring a backend task complete, run from apps/api:

uv run pytest -v
uv run ruff check .
uv run mypy app

All must pass.

## Git

Never commit, push, reset, clean, rebase or rewrite history unless
explicitly instructed.

Never stage or commit:
- data/**
- .env
- credentials
- API keys
- bank statements
- imports
- exports
- backups

At task completion report:
- files changed
- tests
- Ruff result
- mypy result
- git diff --stat
- assumptions/issues

Do not commit automatically.
