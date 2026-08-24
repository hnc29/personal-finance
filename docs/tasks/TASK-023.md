# TASK-023 — Bilingual UX, default categories, Money Lover-inspired UI, one-command launcher

Goal: make V1 pleasant for daily local use while preserving all audited
financial correctness. Do not upgrade Next.js or dependency majors and never run
`npm audit fix --force`.

## 1. English / Vietnamese i18n

Implement:
- languages: `vi` and `en`
- default: Vietnamese unless a saved preference exists
- visible accessible language selector
- persist preference locally (localStorage is fine)
- switching language must not require reload
- translate all core UI copy: nav, headings, buttons, form labels, loading,
  error/empty states, portfolio/review, account/category/transaction screens
- no external translation service
- small typed i18n layer; do not scatter language ternaries across JSX
- user-created category names remain exactly as entered

## 2. Money Lover-like default category tree

Do not claim this is Money Lover's exact proprietary dataset and do not copy
brand assets. Provide a practical default taxonomy inspired by common
Money-Lover-style organization.

Seed must:
- be deterministic and idempotent
- seed only when category table is empty unless explicitly invoked
- never overwrite/rename/delete/duplicate existing user categories
- require no schema migration
- stay within UI depth <= 3

Canonical seeded names:

Expenses
  Food & Drinks
    Groceries
    Eating Out
    Coffee & Drinks
  Bills & Utilities
    Electricity
    Water
    Internet
    Mobile Phone
    Rent
    Gas
  Transportation
    Fuel
    Parking
    Taxi & Ride-hailing
    Public Transport
    Vehicle Maintenance
  Shopping
    Clothing
    Electronics
    Personal Items
    Household
  Home & Family
    Home Maintenance
    Family
    Children
    Pets
  Health & Fitness
    Medical
    Pharmacy
    Fitness
  Entertainment
    Movies & Events
    Games
    Subscriptions
    Hobbies
  Education
    Tuition
    Books
    Courses
  Travel
    Flights
    Accommodation
    Local Transport
    Activities
  Gifts & Donations
    Gifts
    Charity
  Insurance
  Taxes & Fees
  Other Expense

Income
  Salary
  Bonus
  Business Income
  Investment Income
  Interest
  Gifts Received
  Refunds
  Other Income

Add natural Vietnamese display translations. Examples:
- Expenses = Chi tiêu
- Income = Thu nhập
- Food & Drinks = Ăn uống
- Groceries = Đi chợ / Siêu thị
- Eating Out = Ăn ngoài
- Coffee & Drinks = Cà phê & Đồ uống
- Bills & Utilities = Hóa đơn & Tiện ích
- Transportation = Di chuyển
- Shopping = Mua sắm
- Home & Family = Nhà cửa & Gia đình
- Health & Fitness = Sức khỏe
- Entertainment = Giải trí
- Education = Giáo dục
- Travel = Du lịch
- Gifts & Donations = Quà tặng & Từ thiện
- Salary = Lương
- Bonus = Thưởng
- Business Income = Thu nhập kinh doanh
- Investment Income = Thu nhập đầu tư
- Interest = Tiền lãi
- Refunds = Hoàn tiền
- Other Income = Thu nhập khác

Backend:
- small default-category catalog/service/CLI module
- idempotent seed command for launcher
- correct parent hierarchy
- no Base.metadata.create_all()
- no migration

Tests:
- empty DB creates expected hierarchy
- second seed creates no duplicates
- non-empty DB is not overwritten
- parent relationships/depth are correct

## 3. Money Lover-inspired UI, not a clone

Create an original consumer-finance UI inspired by Money Lover:
- mobile-first responsive
- white/soft-neutral surfaces
- green finance accent
- rounded cards
- prominent net-worth/summary card
- compact recent-transaction rows
- clear income/expense distinction
- category chips using CSS/simple Unicode/existing safe assets
- bottom navigation on mobile, appropriate desktop navigation
- strong spacing and typography hierarchy
- friendly empty states
- accessible keyboard use

Do not copy logo, proprietary icons/assets, screenshots pixel-for-pixel, or imply
official affiliation.

Preserve all real API/data behavior and exact-money semantics. No synthetic
portfolio data may return.

## 4. One-command daily launcher

Create:
`scripts/start-personal-finance.sh`

Daily use:

    cd ~/Projects/personal-finance
    ./scripts/start-personal-finance.sh

Launcher requirements:
1. Resolve repo root robustly.
2. Logs under `~/Library/Logs/personal-finance/`.
3. Check uv/node/npm/curl.
4. If Python env/deps missing, one safe `uv sync` using existing project config.
5. If node_modules missing, one safe lockfile install (`npm ci` when possible).
6. Run `uv run alembic upgrade head`.
7. Run idempotent default-category seed command only when appropriate.
8. Start FastAPI on 127.0.0.1:8000.
9. Readiness check with retries.
10. Ensure production frontend build exists; build if missing.
11. Start Next.js on 127.0.0.1:3000 with correct NEXT_PUBLIC_API_URL.
12. Web readiness check with retries.
13. On macOS open browser automatically unless `PF_NO_BROWSER=1`.
14. Print success and log paths.
15. Keep running until Ctrl+C and clean process trees.
16. Never kill unrelated processes.
17. If ports are occupied by this healthy app, say already running; otherwise
    report conflict and stop.
18. Self-repair common startup issues:
    - missing deps: safe sync/install once
    - stale/missing web build: rebuild once and retry
    - if still failing, print relevant log tail and concise debug information
19. Do not modify real finance data except Alembic upgrades and initial
    idempotent category seed when categories are empty.
20. Support validation env:
    - PF_DATABASE_PATH=/tmp/...
    - PF_NO_BROWSER=1
    - PF_EXIT_AFTER_READY=1
    so validation never touches the real DB.

No orphan uvicorn/node processes after exit.

## 5. Validation

Must pass:
- backend pytest, Ruff, mypy, compileall
- one Alembic head remains `0013_portfolio_snapshots`
- frontend lint/typecheck/build
- no synthetic portfolio fixture regression
- launcher `bash -n`
- launcher disposable-DB integration with PF_DATABASE_PATH + PF_NO_BROWSER +
  PF_EXIT_AFTER_READY
- seeded categories appear in disposable DB
- ports 8000/3000 clean after launcher validation
- existing smoke-v1 passes and ports 18000/13000 clean
- git diff --check

## 6. Safety / scope

Follow CLAUDE.md.

Never:
- read or modify real `data/**` during implementation/testing
- inspect .env/credentials/API keys/backups/real statements/imports/exports
- use real finance data in tests/prompts/logs
- add a migration
- use Base.metadata.create_all()
- silently round money
- use Python/JSON float for money
- add network-dependent application tests
- upgrade Next.js/dependency majors
- run `npm audit fix --force`
- commit/push/reset/clean/rebase from Codex

Codex must not commit. Host runner validates and commits only after all
requirements pass.
