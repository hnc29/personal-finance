# TASK-011 — Bank reconciliation engine

Implement deterministic reconciliation between statement rows and canonical finance events.
Use scored/rule-based matching, candidate/review states, exact references where available, amount/date/text evidence.
No AI required. Do not auto-match ambiguous rows.

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
