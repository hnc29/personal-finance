# TASK-016 — Market price provider framework

Implement provider architecture and quote history for precious metals and crypto.
Canonical instruments, provider/product/match-level/timestamp metadata.
Current valuation always uses dealer BUY price.
States: LIVE, STALE, MANUAL, UNAVAILABLE.
Never overwrite historical quotes. Implement cache abstractions; network tests must be mocked.

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
