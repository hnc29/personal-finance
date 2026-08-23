# TASK-018 — Net worth and portfolio snapshots

Implement net-worth calculation and daily portfolio snapshots.
Net worth = cash + bank + ewallet + savings + precious metals + crypto - credit-card liabilities.
Use persisted BUY valuations and quote state metadata.
No real estate in this task.

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
