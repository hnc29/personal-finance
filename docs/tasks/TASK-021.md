# TASK-021 — PWA, backup, local AI and release hardening

Finish V1 hardening: LAN/PWA readiness, backup/restore workflow, API/client boundaries for future mobile app, and optional local Ollama integration for categorization/query/insights.
Cloud AI must not be a runtime dependency.
SQL/rules remain authoritative for financial calculations.
Add end-to-end smoke checks and operational documentation.

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
