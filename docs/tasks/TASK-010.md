# TASK-010 — Bank statement adapters

Implement VPBankStatementAdapter and SHBStatementAdapter interfaces/parsers using synthetic workbook fixtures.
Normalize transaction/effective dates, references, descriptions, debit/credit/signed amount and running balance.
Do not access real statements or data/**.

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
