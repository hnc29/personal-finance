# Personal Finance — Agent Rules

## Scope

Local-first personal finance application. Work only on explicitly assigned tasks.

## Architecture

**Backend:** Python 3.12, FastAPI, SQLAlchemy 2 sync ORM, SQLite WAL, Alembic, Pydantic 2, uv

**Frontend:** Next.js 15, TypeScript, React 19, @tanstack/react-query

**AI (application):** Ollama is the application's current optional AI integration; OptiQ/Qwen is only a development agent and must not be introduced into application code unless explicitly requested.

## Database

- Alembic is the sole schema authority
- Never call `Base.metadata.create_all()` or manually alter SQLite schema
- Never delete/reset production/local finance database
- SQLite: foreign_keys=ON, journal_mode=WAL, synchronous=NORMAL, busy_timeout=10000

## Money

Never use Python float for monetary values.
- Application/API: `Decimal`
- Persistent: `INTEGER` scaled by 10,000
- `MONEY_SCALE = 10_000`
- Never silently round; reject >4 decimal places

## Sensitive Financial Data

**DO NOT** inspect, read, summarize, copy, transmit or modify real user financial data unless explicitly authorized.

**Never read:** `data/**`, `.env*`, bank statements, Money Lover/MISA exports, backups, credentials/API keys.

Tests must use synthetic/anonymized fixtures.

## Requirements Sources

- `docs/BA-SPEC.md` is the main requirements specification
- `docs/tasks/TASK-*.md` files contain task-specific requirements
- Read only the task relevant to the current assignment

## Development

**Before editing:** Inspect relevant files, run tests, report if baseline is failing.

**During:** Smallest correct implementation; no unnecessary dependencies; preserve existing behavior; no unrelated refactoring or speculative abstractions.

## Validation

**Backend (apps/api):**
```bash
uv run pytest -v
uv run ruff check .
uv run mypy app
```

**Frontend (apps/web):**
```bash
npm run lint
npm run typecheck
```

All must pass.

## Git

Never commit/push/reset/clean/rebase/rewrite history unless instructed.

**Never stage/commit:** `data/**`, `.env*`, credentials/API keys, bank statements, imports/exports, backups.

**At task completion, report:** files changed, tests, Ruff, mypy, `git diff --stat`, assumptions/issues.

**Do not commit automatically.**