# TASK-012 — Credit card domain

Implement credit-card profiles and statement lifecycle.
Fields include credit limit, statement day, payment due day/month offset.
Statuses: OPEN, ISSUED, PARTIALLY_PAID, PAID, OVERDUE.
Credit-card balances are negative when owed; available credit = limit + current balance.
Card payment is a transfer, never a new expense. Add reusable due reminder hooks.

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
