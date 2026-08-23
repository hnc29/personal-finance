# TASK-017 — Price source adapters and fallback

Implement source adapters/configuration for BTMC, BTMH, DOJI, SJC, PNJ and CoinGecko with mocked tests.
Exact same product/brand preferred.
Fallback priority for unmatched VN metals: BTMC -> BTMH -> DOJI -> SJC, while own-brand provider is tried first.
If all live providers fail, use most recent successful BUY quote for same instrument; then manual quote if available.
Never silently substitute a different product.

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
