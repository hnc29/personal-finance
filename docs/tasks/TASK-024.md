# TASK-024 — Complete Vietnamese localization and merge default categories into existing DB

This repairs two acceptance gaps found after TASK-023:
1. Vietnamese mode still exposes English UI/menu/options/category labels.
2. Existing personal database did not receive the requested default categories.

Preserve all audited V1 financial correctness and the TASK-023 one-command
launcher. Do not upgrade Next.js/dependency majors. Never run
`npm audit fix --force`.

## A. Vietnamese must be complete

When language = `vi`, every application-owned visible string must be Vietnamese.

This includes, without limitation:
- application title/subtitle where localized
- all navigation/menu items
- tabs
- headings/subheadings
- buttons
- form labels
- placeholders
- helper text
- validation messages that the frontend owns
- loading states
- error states
- empty states
- dialogs/confirmations
- tooltips/aria-labels where user-facing
- filter/sort labels
- account type labels
- financial event/transaction type labels
- category type/section labels
- pricing/valuation state labels
- import/reconciliation status labels
- portfolio labels
- date/amount/account/category field labels
- all predefined/default category display names
- any menu/select/combobox option that currently renders a raw backend enum

Raw backend/API values may remain canonical English enum/code values internally.
They must never be shown raw in Vietnamese UI if an application label is
expected.

Examples:
- CASH -> Tiền mặt
- BANK -> Ngân hàng
- CREDIT_CARD -> Thẻ tín dụng
- EWALLET -> Ví điện tử
- EXPENSE -> Chi tiêu
- INCOME -> Thu nhập
- TRANSFER -> Chuyển tiền
- CREDIT_CARD_PAYMENT -> Thanh toán thẻ tín dụng
- INTEREST -> Tiền lãi
- SAVINGS_DEPOSIT -> Gửi tiết kiệm
- SAVINGS_WITHDRAWAL -> Rút tiết kiệm
- ASSET_PURCHASE -> Mua tài sản
- ASSET_SALE -> Bán tài sản
- ADJUSTMENT -> Điều chỉnh
- LIVE -> Trực tiếp
- STALE -> Cũ
- MANUAL -> Nhập thủ công
- UNAVAILABLE -> Không khả dụng

Use a typed centralized translation/display mapping layer. Do not scatter
`language === "vi" ? ... : ...` throughout JSX.

English mode must remain complete and natural.

User-entered data must remain exactly as entered. Only application-owned
predefined labels/default category names are translated for display.

## B. Every predefined default category must display in Vietnamese

The TASK-023 canonical category taxonomy must have a Vietnamese label for every
node, not only a subset.

Canonical names may remain stable in the DB/API; Vietnamese UI maps them to
Vietnamese display labels.

Required examples (complete the entire catalog):
Expenses = Chi tiêu
Income = Thu nhập
Food & Drinks = Ăn uống
Groceries = Đi chợ / Siêu thị
Eating Out = Ăn ngoài
Coffee & Drinks = Cà phê & Đồ uống
Bills & Utilities = Hóa đơn & Tiện ích
Electricity = Điện
Water = Nước
Internet = Internet
Mobile Phone = Điện thoại di động
Rent = Tiền thuê nhà
Gas = Gas / Khí đốt
Transportation = Di chuyển
Fuel = Nhiên liệu
Parking = Gửi xe
Taxi & Ride-hailing = Taxi & Xe công nghệ
Public Transport = Phương tiện công cộng
Vehicle Maintenance = Bảo dưỡng xe
Shopping = Mua sắm
Clothing = Quần áo
Electronics = Điện tử
Personal Items = Đồ dùng cá nhân
Household = Đồ gia dụng
Home & Family = Nhà cửa & Gia đình
Home Maintenance = Bảo trì nhà cửa
Family = Gia đình
Children = Con cái
Pets = Thú cưng
Health & Fitness = Sức khỏe
Medical = Khám chữa bệnh
Pharmacy = Thuốc
Fitness = Thể dục
Entertainment = Giải trí
Movies & Events = Phim & Sự kiện
Games = Trò chơi
Subscriptions = Dịch vụ đăng ký
Hobbies = Sở thích
Education = Giáo dục
Tuition = Học phí
Books = Sách
Courses = Khóa học
Travel = Du lịch
Flights = Vé máy bay
Accommodation = Lưu trú
Local Transport = Di chuyển tại điểm đến
Activities = Hoạt động
Gifts & Donations = Quà tặng & Từ thiện
Gifts = Quà tặng
Charity = Từ thiện
Insurance = Bảo hiểm
Taxes & Fees = Thuế & Phí
Other Expense = Chi tiêu khác
Salary = Lương
Bonus = Thưởng
Business Income = Thu nhập kinh doanh
Investment Income = Thu nhập đầu tư
Interest = Tiền lãi
Gifts Received = Quà tặng nhận được
Refunds = Hoàn tiền
Other Income = Thu nhập khác

A test must prove that every canonical seeded category has an `en` and `vi`
display label. No canonical category may fall back to raw English while in
Vietnamese mode.

## C. Merge missing defaults into an EXISTING database

TASK-023 seeded only when the category table was empty. That is not enough.

Implement a safe, transactional, idempotent MERGE mode:
- can run against a non-empty category table
- inserts missing predefined default categories
- preserves every existing user category unchanged
- never renames/deletes/reparents user categories
- never creates duplicates on repeated runs
- creates missing parent/child relationships for the predefined tree
- depth remains <= 3
- handles existing matching canonical nodes conservatively
- if a conflict cannot be resolved without changing user data, keep user data
  unchanged, report the conflict, and continue/finish safely
- no schema migration
- no Base.metadata.create_all()

The default daily launcher MUST run this safe merge on startup, not only seed
when empty.

Provide a dedicated CLI/module command that supports at least:
- merge defaults
- check/report missing defaults

The merge must be one DB transaction: on unexpected failure, roll back rather
than leave a partial default tree.

Tests must prove:
1. empty DB -> full tree
2. second run -> zero additional rows
3. existing custom category remains unchanged
4. partially populated DB -> missing defaults inserted
5. repeated merge -> no duplicates
6. correct parent/depth relationships
7. conflict case does not overwrite/reparent/delete user data
8. check command can report zero missing defaults after merge

## D. Existing real DB application

The host runner will validate the implementation ONLY on disposable SQLite DBs.

After all code/tests/launcher validation pass and the code is committed, the
host runner will intentionally run ONLY the new safe default-category merge
command against the application's normal configured local database, because the
user explicitly requested the predefined categories to be inserted.

The code itself must print only aggregate seed results, for example:
- inserted count
- existing count
- conflict count
- missing-after count

Do not print user category names, transaction data, balances, paths from imported
statements, or other finance data.

## E. UI regression audit

Inspect every frontend source file that renders application UI. Replace raw
application-owned English strings with i18n keys/mappers.

Add tests for:
- dictionary key parity (`en` and `vi`)
- enum display mappers
- full default-category translation coverage
- language persistence/switching helper where practical

Do not translate:
- user-entered payee/note/category/account names
- external provider names where they are proper names
- currency codes/symbols
- technical identifiers that are intentionally diagnostic-only

## F. Validation

Must pass:
- backend pytest
- Ruff
- mypy
- compileall
- one Alembic head = `0013_portfolio_snapshots`
- frontend lint/typecheck/build
- TASK-023 launcher bash -n
- launcher disposable DB startup with:
  PF_DATABASE_PATH=/tmp/... PF_NO_BROWSER=1 PF_EXIT_AFTER_READY=1
- after disposable launcher run, default-category check = zero missing
- launcher leaves ports 8000/3000 clean
- existing smoke-v1 passes and leaves 18000/13000 clean
- no synthetic portfolio regression
- no migration
- no dependency/security-gate changes
- git diff --check

## G. Safety

Follow CLAUDE.md.

During implementation/audit/validation:
- never read or modify real `data/**`
- never inspect `.env`, credentials, API keys, backups, real imports/statements
- synthetic fixtures only
- no migration
- no Base.metadata.create_all()
- no float/silent rounding for money
- no network-dependent tests
- no dependency major upgrades
- never `npm audit fix --force`
- Codex must not commit

The host runner, only AFTER PASS and commit, may execute the tested
default-category merge command against the normal configured DB, as explicitly
requested by the user.
