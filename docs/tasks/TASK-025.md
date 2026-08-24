# TASK-025 — Fix Vietnamese completeness, default categories, and stale frontend API builds

The user reproduced these concrete defects after TASK-023/024:
- Vietnamese transaction UI still shows English strings including:
  `None`, `Account entries`, explanatory entry text, `Account 1`,
  `Select account`, `Add another entry`, `Load failed`,
  `DATE`, `TYPE`, `DETAILS`, `ENTRIES`.
- category select is empty / default categories are not visible.
- the screen shows `Load failed`, therefore diagnose the API/frontend runtime
  path rather than treating this as only a translation problem.

Preserve all V1 financial correctness.

## 1. Diagnose and fix the runtime/API loading failure

Important hypothesis to verify in the repository:

Next.js `NEXT_PUBLIC_API_URL` is a BUILD-TIME public environment variable.
`scripts/smoke-v1.sh` builds the web app for the smoke API port (historically
127.0.0.1:18000), while the daily launcher uses 127.0.0.1:8000. If smoke leaves
that `.next` build behind and the daily launcher merely checks whether `.next`
exists, it can serve a bundle permanently calling the dead smoke port, causing
`Load failed` and empty account/category selectors.

Inspect the actual current scripts and API client and verify whether this is the
root cause. If confirmed, fix it robustly.

Acceptance:
- daily launcher can NEVER reuse a production build compiled for a different
  API URL.
- smoke-v1 can NEVER poison the build used by the daily launcher.
- one-command launcher remains the only daily-use command.
- safe solutions include:
  - a build metadata/fingerprint stamp containing API URL + relevant source
    fingerprint and rebuilding on mismatch, AND smoke cleanup/isolated build;
  - or deterministic rebuild on every daily start plus smoke cleanup.
- prefer correctness and simple maintainability over clever caching.
- do not add a runtime proxy that weakens the current local-only security model
  unless clearly necessary.
- API base must resolve to http://127.0.0.1:8000 in normal daily production use.
- existing smoke still uses its own ports and cleans them.

Add a deterministic host-testable check that proves:
1. a web build produced for a non-daily API URL is not accepted as the daily
   launcher build;
2. after launcher readiness, frontend API requests target the daily API;
3. smoke leaves no reusable poisoned daily build.

## 2. Vietnamese UI must be complete

When language is `vi`, every application-owned visible string is Vietnamese.

The screenshot proves these exact leaks; they MUST be covered by tests:
- None -> Không có / Chưa chọn (context appropriate)
- Account entries -> Bút toán tài khoản (or natural equivalent)
- Use negative amounts for money leaving an account and positive amounts for
  money entering it. Transfers normally need two entries.
  -> a natural Vietnamese explanation
- Account 1 -> Tài khoản 1
- Select account -> Chọn tài khoản
- Add another entry -> Thêm bút toán
- Load failed -> Tải dữ liệu thất bại
- DATE -> NGÀY
- TYPE -> LOẠI
- DETAILS -> CHI TIẾT
- ENTRIES -> BÚT TOÁN

Also audit ALL other frontend-rendered application text, not only the screenshot.

Use a centralized typed i18n dictionary/display mapping layer:
- no scattered `language === "vi" ? ...`
- `en` and `vi` key parity
- account/event/status enum display mappings localized
- placeholders, table headers, option labels, empty/error/loading states localized
- user-entered account/category/payee/note names remain unchanged
- external provider proper names may remain proper names
- technical diagnostics not shown in normal UI need not be translated

Add an automated static i18n audit script/test that fails if known user-visible
English literals are reintroduced into rendering source outside the dictionary.
At minimum it must detect the screenshot leaks above.

## 3. Default categories must exist and be returned by API

Keep the complete TASK-023/024 default taxonomy and full vi/en display map.

The backend merge command must:
- work on empty and non-empty DBs
- insert missing predefined defaults
- be transactional/idempotent
- preserve user-created categories
- never rename/delete/reparent user categories
- keep depth <= 3
- report aggregate counts only
- after successful merge, `check` reports zero missing defaults unless there is
  a preserved conflict that cannot safely be resolved

The daily launcher MUST invoke safe merge before starting the API.

Validation must not stop at checking DB rows. Against a DISPOSABLE DB:
- migrate
- merge defaults
- start the actual FastAPI app
- GET `/api/v1/categories`
- assert HTTP 200
- assert the response contains the predefined canonical categories including
  Expenses, Income, Food & Drinks, Salary
- assert a meaningful default count (>= 20)
- then cleanly stop the API

Also test account/category/financial-event list endpoints needed by the
transaction page so a runtime regression causes validation failure rather than
a user-visible `Load failed`.

## 4. Real local DB after validation

During implementation/Codex work, NEVER read/modify `data/**` or real finance
data.

Only AFTER all synthetic/disposable tests pass and code is committed, the host
runner may execute the tested default-category MERGE + CHECK command against
the application's normal configured local DB, because the user explicitly
requested the default categories be inserted.

Output aggregate counts only. Do not print user category names or transaction
data.

## 5. Launcher behavior after repair

Daily command remains:

    cd ~/Projects/personal-finance
    ./scripts/start-personal-finance.sh

It must:
- migrate
- merge default categories
- ensure the web build matches the daily API URL/current source
- start API 127.0.0.1:8000
- readiness check
- start web 127.0.0.1:3000
- readiness check
- open browser unless PF_NO_BROWSER=1
- self-repair a stale/missing web build by rebuilding once
- show log tail only if self-repair fails
- clean child process trees on Ctrl+C
- never kill unrelated listeners

Keep:
- PF_DATABASE_PATH
- PF_NO_BROWSER=1
- PF_EXIT_AFTER_READY=1

Add a validation-friendly mode if needed to keep services alive long enough for
host curl checks, but do not complicate normal use.

## 6. Validation

Must pass:
- backend pytest
- Ruff
- mypy
- compileall
- Alembic one head = 0013_portfolio_snapshots
- frontend lint
- frontend typecheck
- frontend build
- new i18n static audit
- known screenshot English leak test
- full default-category translation coverage
- default-category merge tests
- disposable DB FastAPI categories endpoint integration
- daily launcher disposable DB integration
- smoke-v1
- no orphan ports 8000/3000/18000/13000
- no synthetic portfolio regression
- no migration
- no package/dependency changes
- git diff --check

## 7. Safety

Follow CLAUDE.md.

Never during Codex implementation/testing:
- read or modify real `data/**`
- inspect .env/credentials/API keys/backups/real statements/imports/exports
- use real finance data in tests/logs
- add a migration
- use Base.metadata.create_all()
- change exact-money semantics
- silently round money
- use float for money
- add network-dependent tests
- upgrade Next.js/dependency majors
- run npm audit fix --force
- commit/push/reset/clean/rebase from Codex

Codex must not commit. Host runner validates and commits only after PASS.
