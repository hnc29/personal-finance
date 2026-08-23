# TASK-015 — Crypto domain

Implement crypto holdings/lots separately from precious metals, initially BTC.
Support quantity, purchase basis, funding account, pricing instrument, valuation inclusion and transaction linkage.
No live provider implementation yet; use provider interface/stub and synthetic tests.

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
