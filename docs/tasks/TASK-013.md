# TASK-013 — Savings domain

Implement savings-like products and term deposits as separate domain from wallet accounts.
Support principal, dates, term, interest/non-term rates, day count, interest payment method, maturity action, rollover history.
Actions: open, add, partial withdraw, close, interest, renew.
Transfers into savings are asset transfers, not expenses.

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
