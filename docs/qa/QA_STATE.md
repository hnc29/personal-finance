# QA_STATE — Personal Finance (nguồn sự thật, không phân tích lại repo)

Cập nhật lần cuối: Giai đoạn A hoàn tất. Môi trường: cloud workspace `/root/work/personal-finance` để chạy test/build (không giới hạn 45s); repo git thật + `data/finance.db` thật chỉ có trên máy người dùng (`~/Projects/personal-finance`, qua device_bash). Hai nơi được đồng bộ file thủ công qua SendUserFile + device_commit_files sau mỗi batch sửa.

## Stack
- Backend: FastAPI + SQLAlchemy 2 + SQLite + Alembic. Python 3.12, `uv`/`.venv` tại `apps/api/.venv`.
- Frontend: Next.js 15.5.23 (App Router, single route `/`), React 19, TS 5.7 strict, TanStack Query 5. Không Tailwind/shadcn/UI-lib/chart-lib. CSS thuần `apps/web/app/styles.css`.
- Không có root `package.json` (không phải monorepo workspace thật, 2 app độc lập).
- Không Budget router/model nào tồn tại trong backend — đúng như phạm vi loại trừ.
- Không có Debt (khoản nợ) là entity riêng — chỉ có category "Trả nợ/Cho vay". **Không có mã nguồn → mục 9.10 (E2E khoản nợ) đánh N/A, không viết test giả.**

## Lệnh dev/test/build
- Backend test: `cd apps/api && source .venv/bin/activate && PF_DATABASE_PATH=<path>/data/finance.test.db .venv/bin/pytest -q`
- Backend lint/type: `.venv/bin/ruff check .` / `.venv/bin/mypy app`
- Backend dev server: `PF_DATABASE_PATH=... PF_CORS_ORIGINS='["http://127.0.0.1:3010","http://localhost:3010"]' .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8010`
- Frontend: `cd apps/web && npm run lint / typecheck / build`; dev server `NEXT_PUBLIC_API_URL=http://127.0.0.1:8010 npm run dev -- -p 3010`
- **QUY TẮC BẮT BUỘC**: mọi lệnh backend PHẢI export `PF_DATABASE_PATH` trỏ tới `finance.test.db` trước — mặc định của `Settings.database_path` là `data/finance.db` (DB THẬT). Không có `.env` nào override sẵn.

## Database test
- `data/finance.test.db` (cloud workspace) — tạo bằng `alembic upgrade head` trên file rỗng (không copy từ DB thật) + seed 69 danh mục mặc định qua `python -m app.default_categories_cli`. Không chứa dữ liệu thật.
- DB thật: `~/Projects/personal-finance/data/finance.db`, sha256 `e5ddd2645798daafd672800e33937520a0a828797986ffc6048c38a823534f6c`, size 335872, mtime 1787669372.575054. **Checksum này phải khớp lại ở cuối nhiệm vụ.**
- Phần lớn test API dùng fake/in-memory store + `get_db` override (không chạm SQLite thật dù có set path sai). `test_database.py`/`test_migrations.py` dùng engine/script trực tiếp — đã chạy an toàn với `PF_DATABASE_PATH` trỏ test db.

## Route/API/Entity (backend, đã include trong app.main)
accounts, assets (savings/metals/crypto/credit-card qua sub-router), savings, categories, financial_events (giao dịch), read_models (portfolio overview, import batches, reconciliation), data (import Money Lover, export CSV/XLSX), ai (chưa audit sâu — ngoài phạm vi trọng tâm).

## Frontend: 6 tab (đã gộp Portfolio→Assets ở task trước)
Giao dịch(mặc định) / Tài khoản / Danh mục / Tài sản(+dashboard net worth) / Dữ liệu / Đối soát. Single-file `apps/web/app/page.tsx` (~1000 dòng, ~30 component).

## Test đã có trước khi task này bắt đầu
- Backend: **35 file pytest, 281 test, PASS 100%** (baseline, xem `pytest-baseline.log`). ruff + mypy sạch.
- Frontend: **KHÔNG có test tự động nào** (không Playwright/Vitest/Jest trong package.json, không config, không thư mục e2e/). Chỉ có 16 script "audit" thủ công (`scripts/task0XX-*.mjs`) chạy tay bằng `node`, dùng `playwright` cài global — không phải test suite CI.

## Việc cần làm trong task này
1. Cài Playwright làm devDependency thật cho `apps/web` + config, viết 16 luồng E2E bắt buộc (trừ Ngân sách + trừ Khoản nợ vì N/A).
2. Đối soát dữ liệu thật (chỉ đọc) — CHƯA LÀM, xem Giai đoạn C bên dưới khi cập nhật.
3. CRUD test qua UI/API trên `finance.test.db` cho: Giao dịch, Tài khoản, Danh mục, Tài sản (savings/metals/crypto), Đối soát/Import.
4. Responsive 4 viewport cho Dashboard(=Tài sản)/Giao dịch/màn hình sửa.

## File dự kiến đổi
- `apps/web/package.json` (thêm playwright devDep + script `test:e2e`)
- `apps/web/playwright.config.ts` (mới)
- `apps/web/e2e/*.spec.ts` (mới, 1 file/luồng)
- Sửa lỗi phát hiện: chưa biết trước, sẽ liệt kê khi tìm thấy.

## Lỗi baseline
Chưa phát hiện lỗi nào tính đến hết Giai đoạn A/B-backend. Frontend lint/typecheck/build đã biết sạch từ task trước (commit `2a860eb`).

## Nhật ký Giai đoạn (cập nhật dần, KHÔNG viết lại từ đầu)
- [x] A: kiểm kê xong, checksum DB thật ghi nhận, finance.test.db tạo xong + seed category.
- [x] B-backend: 281 pytest PASS, ruff/mypy sạch.
- [x] B-frontend: lint/typecheck/build lại sạch (xác nhận, không đổi so với task trước).
- [x] C: đối soát dữ liệu thật (chỉ đọc, sqlite3 mode=ro) — xong. Kết quả bên dưới.
- [x] D/E2E: xong — 9 file, 33 test Playwright, PASS 33/33 trên DB test sạch (reset trước lần chạy cuối). Chi tiết bên dưới.
- [x] Responsive: xong — 390px (`08-mobile-nav.spec.ts`) + 768/1366/1440px (`09-responsive.spec.ts`).
- [x] Nghiệm thu cuối: xong — full regression backend (283 pytest PASS, ruff/mypy sạch) + frontend (lint/tsc/build sạch) + E2E (33/33) chạy lại lần cuối trên DB sạch. 3 báo cáo `FUNCTION_MATRIX.md`/`TEST_REPORT.md`/`BUG_FIX_REPORT.md` đã tạo. Checksum `finance.db` xác nhận lại lần cuối KHÔNG đổi.

## Giai đoạn C — Kết quả đối soát (DB thật, chỉ đọc)
Tất cả sạch trừ 1 lỗi:
- FK/orphan (account_entries→accounts/events, events.category_id, categories.parent_id, savings.funding_account_id, credit_card_profiles.account_id): 0 vi phạm.
- TRANSFER/CREDIT_CARD_PAYMENT/ADJUSTMENT/SAVINGS_DEPOSIT nets-to-zero: 0 vi phạm.
- Ngày sai định dạng: 0. Tên rỗng account/category: 0. raw_import_rows trùng: 0. Entry amount=0: 0.
- **LỖI PHÁT HIỆN**: 1 EXPENSE (event id=2, ngày 2026-08-25, danh mục "Coffee & Drinks", tài khoản "Zalopay") có `amount_scaled=+400000000` (đáng lẽ âm). Root cause: backend (`_build_and_validate_entries` trong `app/services/ledger.py`) không hề validate dấu tiền cho EXPENSE/INCOME — chỉ tin client. Frontend composer (`negateMoney` trong `page.tsx`) có vẻ đúng logic, không tìm được bug phía client qua đọc code; nghi ngờ bản ghi này đến từ 1 lần gọi API/thao tác cũ trước khi có ràng buộc, hoặc 1 con đường không qua composer chuẩn. **KHÔNG sửa bản ghi thật** — đã thêm validate phía server (`_validate_signed_amount`, raise `InvalidEventEntriesError` → HTTP 400) + regression test `test_expense_and_income_reject_wrong_sign_and_zero` (test_ledger_service.py) + sửa 1 fixture test cũ dùng amount dương cho EXPENSE (test_preserves_transaction_date_and_nullable_occurred_at). Full suite 282 passed, ruff/mypy sạch.
- Đối soát Database↔API (net worth): công thức trong `read_models.portfolio_overview`/`portfolio.calculate_net_worth` đã đọc source, tự tính lại bằng SQL độc lập (không copy DB thật ra ngoài, không chạy venv trên device vì venv trỏ path macOS không chạy được qua device_bash) — khớp công thức: 24 tài khoản active, tổng số dư non-card 46,031,779đ, nợ thẻ tín dụng (abs) 15,410,137đ, tiết kiệm đang mở 10,000,000đ → net worth (chưa tính metal/crypto cần giá thị trường, không gọi API ngoài) = 40,621,642đ. Không phát hiện sai lệch công thức.
- "Tổng theo danh mục" / "Tổng theo khoảng thời gian": **N/A** — không có màn hình/API nào trong app tính hoặc hiển thị tổng theo danh mục hay theo kỳ (đã xác nhận qua Phase 0 + route list), không có gì để đối soát.
- Checksum `finance.db` xác nhận lại KHÔNG đổi sau toàn bộ Giai đoạn C: `e5ddd2645798daafd672800e33937520a0a828797986ffc6048c38a823534f6c`.

## Batch sửa lỗi #1 (đã xong)
File đổi: `apps/api/app/services/ledger.py`, `apps/api/tests/test_ledger_service.py`. Không đụng phân hệ Ngân sách.

## Giai đoạn D/E2E — Playwright
Bộ 27 test trong `apps/web/e2e/*.spec.ts` (9 file), chạy trên `finance.test.db` (backend :8010, frontend :3010, khởi động thủ công qua `nohup` trong cloud workspace). DB test được **reset sạch** (xoá + `alembic upgrade head` + reseed category + tạo lại 2 account `E2E Cash`/`E2E Bank`) trước mỗi lần chạy full suite — dữ liệu E2E tự tạo (account/category/giao dịch/tài sản) không idempotent giữa các lần chạy nên bắt buộc phải reset để tránh trùng lặp gây flaky.

Luồng: 1-dashboard(#1), 2-validation(#12,#13), 3-transactions-crud(#2,#3,#4,#5,#15), 4-accounts-crud(#8), 5-categories-crud(#8+search/filter), 6-assets-crud(#9), 7-api-error(#14), 8-mobile-nav(#16, 390px). **N/A đã xác nhận** (không có mã nguồn tương ứng): #6 tìm kiếm/lọc giao dịch (Transactions không có UI này), #7 đổi kỳ báo cáo (không tồn tại), #10 khoản nợ (xem mục "Stack" ở trên).

## Batch sửa lỗi #2 (đã xong) — phát hiện qua viết/chạy E2E
File đổi: `apps/web/app/page.tsx`, `apps/api/app/api/assets.py`, `apps/api/tests/test_assets_api.py`. Không đụng phân hệ Ngân sách.
1. **CategoryPicker (composer giao dịch) & ParentPicker (form danh mục)**: state `expanded` (danh mục đang mở) chỉ tính 1 lần lúc mount, không cập nhật khi đổi Type composer (Chi tiêu↔Thu nhập) hay khi gõ tìm kiếm — kết quả: danh mục con khớp tìm kiếm/đổi loại vẫn bị ẩn dù đã lọc đúng, người dùng phải tự bấm nút "▸ Mở rộng" thủ công mới thấy. Sửa: `key={type}` remount CategoryPicker khi đổi Type; bỏ điều kiện `expanded.has(...)` khi có query tìm kiếm ở cả 2 component (giữ nguyên hành vi khi không tìm kiếm).
2. **Metals/crypto asset forms** (`Assets()` trong page.tsx): không hiển thị lỗi mutation nào (`<Error error={metal.error}/>` bị thiếu hoàn toàn) — submit bị từ chối thì nút bấm "im lặng" không phản hồi gì. Đã thêm `<Error>` cho cả 2 form.
3. **Backend `POST /api/v1/assets/metals`**: trường `purity` không có validate phạm vi trước khi ghi DB — nhập giá trị tự nhiên kiểu Việt Nam "999" (thay vì đúng định dạng phân số 0-1 mà DB kỳ vọng, "0.999") làm crash 500 (IntegrityError `ck_precious_holding_purity_range` không được bắt) thay vì trả lỗi 4xx rõ ràng. Đã thêm `field_validator` bắt buộc `0 < purity <= 1`, trả 422 kèm thông báo. Regression test `test_create_metal_rejects_purity_outside_unit_range`. Đồng thời sửa placeholder trường Purity trên UI thành ví dụ "0.999" thay vì chỉ nhãn trống.

Đã chạy targeted: `ruff check app/api/assets.py` sạch, `mypy app/api/assets.py` sạch, `pytest tests/test_assets_api.py tests/test_precious_metals.py` (6+15 passed), `tsc --noEmit` frontend sạch. Full-suite backend/frontend regression sẽ chạy lại ở Giai đoạn nghiệm thu cuối.
