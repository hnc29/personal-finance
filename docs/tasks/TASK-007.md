# TASK-007 — Normalize Money Lover imports

Normalize previously stored raw Money Lover rows into canonical finance events and account entries.
Implement deterministic parsing/mapping only; no AI.
Handle signed money using Decimal/fixed-point primitives.
Preserve raw rows. Add source linkage so normalized records trace to raw_import_rows.
Do not implement bank statements, MISA export or UI.

## Global rules
- Follow CLAUDE.md.
- Work only on this task.
- Preserve existing passing behavior.
- Alembic is the sole schema authority.
- Never use Python float for money.
- Use synthetic/anonymized fixtures only.
- Never access data/**, .env, credentials, backups, or real financial files.
- Do not commit.
- Before completion, all relevant tests/lint/type checks must pass.
