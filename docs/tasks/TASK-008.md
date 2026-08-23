# TASK-008 — Money Lover transfer pairing and duplicate control

Implement deterministic transfer pairing for Money Lover normalized rows.
Rules: exact same-date unique match auto-pairs; ±1 day unique auto-pairs; 2–7 days produces review candidates; >7 days never auto-pairs.
Use amount/account/date evidence. Never double-count paired transfer rows as income/expense.
Add semantic duplicate/candidate handling without assuming Money Lover Id is globally stable.

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
