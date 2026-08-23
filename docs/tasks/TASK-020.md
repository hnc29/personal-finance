# TASK-020 — Frontend import, reconciliation and portfolio UI

Add UI flows for imports, review candidates/reconciliation, savings, credit cards, precious metals/crypto and net-worth dashboard.
Show quote provider/state/timestamp and stale/manual warnings.
Do not expose raw secrets or local filesystem paths.

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
