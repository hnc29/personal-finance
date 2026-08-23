# TASK-009 — MISA export foundation

Implement export from canonical finance data into structured MISA-compatible bank-statement style files.
Support explicit account mapping, many-to-one mapping, export history and prevention of re-exporting the same event unintentionally.
Do not generate fake official bank PDFs/logos. Use synthetic fixtures/tests only.

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
