# TASK-014 — Precious metals domain

Implement gold and silver holdings using one precious-metal model.
Support metal type, brand, product type, purity, quantity, canonical grams, purchase date/price/cost, funding account, pricing instrument, net-worth flag, note/image metadata.
Conversions: 1 chi = 3.75g, 1 luong = 37.5g, 1kg = 1000g.
Support SJC, BTMC, BTMH, DOJI, PNJ and RAW as data values/mappings, not hard-coded UI assumptions.

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
