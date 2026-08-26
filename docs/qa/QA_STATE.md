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

## Batch #3 (đã xong, 2026-08-26) — yêu cầu tính năng mới từ người dùng
Yêu cầu (nguyên văn, xem tin nhắn người dùng 2026-08-26): Thêm tài khoản (số dư ban đầu, chọn ngân hàng theo list cho BANK/CREDIT_CARD, cập nhật danh sách ngân hàng VN, VND cố định); Vàng (độ tinh khiết không bắt buộc mặc định 99.99%, chọn Sản phẩm theo Nhẫn/Miếng/Trang sức, sửa bug "nhấn Thêm không phản hồi"); Crypto (chọn coin theo danh sách, chỉ dùng API định giá); Xuất dữ liệu (lọc theo tài khoản + khoảng ngày); kiểm tra lại toàn bộ webapp.

File đổi:
- `apps/web/lib/bank-catalog.ts` — viết lại: ~49 ngân hàng thật đang hoạt động tại VN 2026 (NHNN Nhà nước/chi phối 4, TMCP 26, 100% vốn nước ngoài 9, liên doanh 2, chính sách 2, hợp tác xã 1, TNHH MTV chuyển giao bắt buộc 4: GPBank/VCBNeo/Vikki Bank/MBV), có `category` + `bankCategoryOrder`/`bankCategoryLabel` để group `<optgroup>`. Nguồn: WebSearch (bankervn.com, cập nhật 2026). Bỏ field `icon` chết (trỏ `/public/banks/*.ico` chưa từng tồn tại, không component nào đọc).
- `apps/web/app/page.tsx`:
  1. `AccountFormDialog` viết lại: thêm "Số dư ban đầu" (tạo mới) → tạo account xong thì bắn 1 event ADJUSTMENT (tái dùng cơ chế `AccountAdjustForm` có sẵn) nếu số dư ≠ 0. BANK/CREDIT_CARD (chỉ khi TẠO MỚI, không áp dụng khi sửa để tránh đổi tên account cũ ngoài ý muốn) bắt buộc `<select>` ngân hàng theo `bankCatalog` (group theo category) + nickname tuỳ chọn, không còn ô tên tự do cho 2 loại này. Currency cố định "VND" (input disabled), không cho nhập ở cả tạo/sửa. `.form-actions` được set `style={{gridColumn:"1 / -1"}}` để tránh nút "Thêm tài khoản" bị bóp hẹp khi form có tới 5 field (grid `.form` chỉ có 4 cột, xem styles.css).
  2. Metals form: `product_type` free-text → `<select>` 3 lựa chọn Nhẫn/Miếng/Trang sức (value = nhãn đã dịch, KHÔNG phải code nội bộ "RING" — vì `AssetSection` hiển thị `row.name`=product_type trực tiếp không qua `label()`). `purity` bỏ `required`, nhập theo % (vd "99.99"), convert sang phân số (0,1] bằng `percentToFraction()` (dịch dấu thập phân bằng string, không dùng float). Purity/Quantity/Price/Total metals + Quantity/Price/Total crypto: thêm `pattern` (như mọi field decimal khác trong app đã có sẵn — chỉ 2 form asset này thiếu) + `normDecimal()` chuẩn hoá dấu phẩy thập phân kiểu Việt Nam ("," → ".") trước khi tính.
  3. **ROOT CAUSE bug "Vàng ... nhấn Thêm không phản hồi"**: gõ dấu phẩy thập phân (vd "1,5" hoặc "99,99" — đúng cách viết số tự nhiên tiếng Việt) vào Quantity/Purity làm `BigInt("1,5")` ném exception đồng bộ ngay trong submit handler, TRƯỚC khi `.mutate()` chạy — không có request, không có lỗi hiển thị (vì mutation chưa từng bắt đầu), nút chỉ "im lặng". Tái hiện bằng Playwright (`page.on("pageerror")` bắt được `Cannot convert 1,5 to a BigInt`). Sửa bằng `pattern` (chặn ký tự lạ ngay ở HTML5 native validation, đúng như các form khác đã làm) + `normDecimal()` (chấp nhận dấu phẩy thay vì chặn nó).
  4. `DataPage`: thêm bộ lọc xuất dữ liệu (chọn tài khoản + Từ ngày + Đến ngày), build query string cho link Xuất CSV/XLSX.
- `apps/web/lib/i18n.ts`: thêm key "Choose bank"/"Nickname (optional)"/"Initial balance"/"Leave blank to use 99.99%"/"Start date"/"End date"/"All accounts"/"Export filters" (en+vi) + RING/BAR/JEWELRY vào `display.vi` (display.en tự động hoá "RING"→"Ring" qua humanizer sẵn có, không cần thêm).
- `apps/web/app/styles.css`: `.asset-form .amount-row{min-height:auto;padding:0;border-bottom:0}` — bỏ style dành riêng cho composer khi tái dùng amount-row/currency-badge cho ô Purity (%) trong asset-form dạng cột đơn.
- `apps/api/app/api/assets.py`: `MetalCreate.purity` thêm default `Decimal("0.9999")` (server cũng chấp nhận thiếu field, không chỉ dựa vào frontend luôn gửi).
- `apps/api/app/api/data.py`: `/exports/events.csv` và `/exports/events.xlsx` thêm query param tuỳ chọn `account_id`/`start_date`/`end_date` (không truyền = hành vi cũ y hệt, không phá gì đang phụ thuộc export cũ). 400 nếu `start_date > end_date`.
- Test mới/sửa: `apps/api/tests/test_exports_api.py` (mới, 5 test — unfiltered/by-account/by-date/start>end→400/xlsx-by-account), `apps/api/tests/test_assets_api.py` (+1 test purity mặc định khi thiếu field), `apps/web/e2e/04-accounts-crud.spec.ts` (+1 describe: chọn ngân hàng + số dư ban đầu → balance đúng ngay), `apps/web/e2e/06-assets-crud.spec.ts` (product_type select thay vì free-text; +1 test dấu phẩy thập phân, có `await expect(...).toBeVisible()` trước khi đọc lại qua API để tránh race), `apps/web/e2e/10-export.spec.ts` (mới, 2 test — query string đúng + CSV lọc đúng).

**Không sửa** (đã đọc code, hành vi hiện tại đã đúng theo yêu cầu, không có gì để sửa): Crypto "tự điền tên coin, không lựa chọn... chỉ dùng API để đánh giá giá trị" — `CoinPicker` đã bắt buộc chọn từ kết quả search CoinGecko (`coingecko_id`/`symbol`/`display_name` lấy nguyên từ item được chọn, không có ô nhập tên tự do); giá trị hiện tại của tài sản đã luôn tính qua API định giá (`crypto_pricing.py`), form chỉ nhập `purchase_price`/`total_cost` (giá vốn lịch sử, bắt buộc phải nhập tay vì API không thể biết người dùng đã mua giá bao nhiêu). Xác nhận qua Playwright với route mock (CoinGecko thật không gọi được từ cloud sandbox — hạn chế môi trường, không phải bug app).

Verify: backend `pytest -q` 289 passed (283+6 mới), `ruff check .`/`mypy app` sạch. Frontend `tsc --noEmit`/`npm run lint`/`npm run build` sạch. E2E full suite (DB test reset sạch trước khi chạy) **37/37 PASS** (33 cũ + 4 mới: 1 accounts, 1 export×2, 1 assets comma). Checksum `data/finance.db` (DEVICE, không phải cloud workspace) xác nhận qua `device_bash` KHÔNG đổi: `e5ddd2645798daafd672800e33937520a0a828797986ffc6048c38a823534f6c` — khớp checksum cuối task trước, không có thao tác nào trong task này chạm tới file này (mọi lệnh backend đều trỏ `PF_DATABASE_PATH` vào `finance.test.db`).

## Sự cố "webapp không start được" (2026-08-26, báo cáo người dùng, đã điều tra — kết luận: không phải lỗi code)
Người dùng báo `npm run dev` không chạy được. Tái hiện lần đầu qua `device_bash` bị lỗi tải gói `@next/swc-linux-arm64-gnu` (không có mạng) — nhưng `device_bash` hoá ra chạy trong 1 VM Linux riêng (`uname -a` → `Linux ... aarch64`), không phải Terminal macOS thật của người dùng; máy Mac thật đã có sẵn đúng gói `@next/swc-darwin-arm64` (xác nhận qua `ls node_modules/@next/` trên device) nên lỗi này không đại diện cho môi trường thật. Tự chạy lại `next dev` trong cloud workspace (Node/Next.js tương đương, có mạng) → khởi động sạch, HTTP 200, render đúng giao diện — xác nhận code không có lỗi. Phát hiện phụ (không phải nguyên nhân, đã tự kiểm chứng bằng cách gỡ gói rồi chạy lại `next dev` vẫn OK): `node_modules` trên device cũ hơn lần cập nhật `package.json` gần nhất (thêm `@playwright/test` ở commit `6210ae6`) — thiếu gói này (`npm ls` báo `UNMET DEPENDENCY`). Đã báo người dùng chạy `npm install` trên Terminal thật của họ để đồng bộ lại.

**Theo dõi tiếp (cùng ngày)**: sau khi `npm install` xong, người dùng báo "web start nhưng tải dữ liệu thất bại". Kiểm tra `data/finance.db` (device, chỉ đọc): `PRAGMA integrity_check` → `ok`, `alembic_version` khớp đúng migration mới nhất (`0018_transfer_pair_import`), 24 tài khoản — **database hoàn toàn bình thường, không phải nguyên nhân**. Người dùng chạy `lsof -i :8000 -i :3000` theo yêu cầu: cổng 3000 (frontend, lsof hiển thị tên dịch vụ "hbci") có 1 tiến trình `node` đang LISTEN, nhưng **không có dòng nào cho cổng 8000** — kết luận: backend (API) không hề chạy, chỉ có frontend chạy một mình (khả năng cao người dùng chỉ gọi `npm run dev` trong `apps/web` mà chưa từng chạy backend riêng). Đã hướng dẫn dùng `scripts/start-personal-finance.sh` (script có sẵn trong repo, tự chạy migration + khởi động cả backend `:8000` lẫn frontend `:3000` theo đúng thứ tự, có health-check từng bước) thay vì chạy tay từng phần.

## Batch #4 (đã xong, 2026-08-26) — cập nhật Next.js theo yêu cầu người dùng
Yêu cầu (nguyên văn): "tôi thấy đã có thông báo update js15.5, hãy kiểm tra và update đi" — cập nhật Next.js lên bản mới nhất trong nhánh 15.5.x (không nhảy sang Next 16 — bản `latest` hiện là 16.3.3, major version, có thể breaking, ngoài phạm vi yêu cầu "15.5").

File đổi: `apps/web/package.json` (`next` ^15.1.7→^15.5.24, `eslint-config-next` cùng bản), `apps/web/package-lock.json` (theo đó; `sharp` — dependency gián tiếp của Next dùng cho tối ưu ảnh, app không dùng `next/image` nên không có ảnh hưởng thực tế — cũng được `npm audit fix` (không `--force`) nâng lên 0.35.3 để vá 1 lỗ hổng bảo mật).

Đã đọc changelog 15.5.24 (so với 15.5.23 đang cài): vá lỗi path-traversal trong ISR file-system-cache + fix ISR cache-miss trên Windows khi path có backslash, và tắt tối ưu AVIF trong `next/image` (không ảnh hưởng app này vì không dùng `next/image` — đã `grep` xác nhận không có file nào import). Không có breaking API change.

**1 lỗ hổng bảo mật CÒN LẠI, KHÔNG sửa** (ngoài phạm vi yêu cầu "15.5"): `npm audit` báo `postcss` có lỗ hổng XSS/path-traversal qua `sourceMappingURL`, chỉ vá được bằng cách nhảy lên `next@16.3.3` (`npm audit fix --force` mới đụng tới, là breaking change theo cảnh báo của chính npm) — không tự ý làm vì đây là nâng cấp major, cần người dùng xác nhận trước do khả năng ảnh hưởng lớn hơn 1 bản vá thông thường.

Verify: `npm run typecheck`/`npm run lint`/`npm run build` sạch trên 15.5.24. Full E2E suite (DB test reset sạch, backend :8010 `NEXT_PUBLIC_API_URL` đúng port, frontend :3010) **37/37 PASS**. (Lưu ý riêng cho lần chạy sau: 2 lần chạy đầu bị fail hàng loạt do tự set nhầm — quên set `NEXT_PUBLIC_API_URL` khi khởi động lại `npm run dev`, cộng với tiến trình `next-server` cũ bị đổi tên process nên `pkill -f "next dev"` không match được, làm server cũ tiếp tục chạy song song trên cùng cổng dù tưởng đã kill — lỗi thao tác khi kiểm thử, không phải lỗi trong code/bản nâng cấp; đã dọn sạch toàn bộ tiến trình thừa sau khi xác định đúng nguyên nhân qua đối chiếu inode `/proc/net/tcp`.) Checksum `data/finance.db` không đổi (task này chỉ động vào `package.json`/`package-lock.json`, không chạm code hay dữ liệu).

## Batch #5 (đã xong, 2026-08-26) — nghiệp vụ mua tiền mã hoá bằng USD, tự quy đổi VND
Yêu cầu (nguyên văn): "Loại tiền mã hoá (chọn con): người dùng sẽ tự điền mã, số lượng, giá mua. với giá mua sẽ cho lựa chọn mua bằng USD hoặc VND. Tổng chi phí sẽ tính bằng giá mua nhân với số lượng, nếu mua bằng usd thì sẽ tự động nhân và chuyển sang vnd (tỷ giá sẽ tự động cập nhật)".

Thiết kế: không đổi schema DB (bảng `crypto_lots` không có cột tiền tệ, đúng quy ước "VND cố định" toàn app từ trước) — quy đổi USD→VND xảy ra hoàn toàn ở frontend trước khi gửi API, cả `purchase_price` lẫn `total_cost` gửi lên luôn là VND (số USD người dùng gõ không bao giờ được lưu ở đâu cả). Tỷ giá lấy từ nguồn ngoài, tự cập nhật (cache 1h phía server), không hard-code.

File đổi (backend, mới):
- `apps/api/app/services/fx_rate.py` — `UsdVndRateProvider`, sao chép đúng khuôn mẫu DI/cache của `crypto_coin_catalog.py` (HTTP client + đồng hồ được inject để test, cache trong bộ nhớ TTL=1h, khi refresh lỗi mà còn cache cũ thì vẫn phục vụ cache cũ thay vì lỗi cứng). Nguồn: `https://open.er-api.com/v6/latest/USD` (free, không cần API key; đổi được qua `PF_FX_RATE_URL` nếu cần, giống cách `coingecko_coins_url` đã làm).
- `apps/api/app/api/fx.py` — `GET /api/v1/fx/usd-vnd` → `{rate, as_of, source}`; 503 khi không lấy được tỷ giá (cache rỗng + nguồn lỗi).
- `apps/api/app/core/config.py` — thêm `fx_rate_url`, `fx_rate_timeout_seconds`.
- `apps/api/app/main.py` — đăng ký router mới.
- Test mới: `apps/api/tests/test_fx_rate.py` (7 test: fetch/cache/refetch-sau-TTL/stale-cache-khi-lỗi-tạm-thời/không-cache-khi-lỗi-hẳn/thiếu-key-VND/tỷ-giá-không-dương), `apps/api/tests/test_fx_api.py` (2 test: 200 + 503, override dependency).

File đổi (frontend):
- `apps/web/lib/api.ts` — thêm `FxRate` type + `api.fx.usdVnd()`.
- `apps/web/lib/i18n.ts` — thêm "Exchange rate"/"Tỷ giá", "Exchange rate unavailable"/"Không lấy được tỷ giá", "Loading exchange rate…"/"Đang tải tỷ giá…".
- `apps/web/app/page.tsx`:
  1. `mulDecimal()` — helper nhân 2 chuỗi thập phân chính xác bằng BigInt (dịch số theo đúng số chữ số thập phân của từng toán hạng, không giả định scale cố định như `sumMoney`), dùng cho giá × số lượng và giá × tỷ giá.
  2. `cryptoPurchaseTotals()` — hàm thuần tính `{unitPriceVnd, totalVnd}`: nếu VND thì trả nguyên; nếu USD thì nhân với tỷ giá trước rồi mới nhân số lượng; trả `null` nếu thiếu số liệu hoặc (khi mua bằng USD) tỷ giá chưa tải xong — dùng để khoá nút "+ Thêm" lại, tránh gửi số USD chưa quy đổi lên server.
  3. Form Crypto: `quantity`/`price` chuyển sang controlled (trước đây đọc qua FormData không kiểm soát) để hiện xem trước tổng chi phí trực tiếp; thêm `<select name="purchase_currency">` (VND/USD) cạnh ô giá; khi chọn USD thì gọi `GET /fx/usd-vnd` (react-query, `staleTime` 5 phút) và hiện dòng "Tỷ giá: 1 USD ≈ X VND"/"Đang tải tỷ giá…"/"Không lấy được tỷ giá". **Trường "Tổng chi phí" không còn là ô nhập tay** — luôn là `cryptoPurchaseTotals()` (đúng yêu cầu "tổng chi phí sẽ tính bằng giá mua nhân với số lượng" cho cả 2 loại tiền tệ, không chỉ riêng USD), hiển thị read-only.
- Test mới: `apps/web/e2e/06-assets-crud.spec.ts` (+3 test trong `describe.serial` mới — VND tự tính tổng đúng; USD hiện đúng tỷ giá + tổng quy đổi đúng rồi submit thành công; nút Thêm bị khoá cho tới khi tỷ giá tải xong. Coin search và tỷ giá đều mock qua `page.route` vì CoinGecko/open.er-api.com thật không gọi được từ sandbox này — đã tự xác nhận công thức bằng tay trước: 100 USD × 26000 × 1 = 2.600.000đ, khớp giá trị ô Tổng chi phí trên UI).

Verify: backend `pytest -q` 298 passed (289+9 mới), `ruff check .`/`mypy app` sạch. Frontend `tsc --noEmit`/`npm run lint`/`npm run build` sạch (đã tự tay kiểm tra công thức nhân bằng Node trước khi tin `mulDecimal`). E2E full suite (DB test reset sạch trước lần chạy cuối cùng dùng để nghiệm thu) **40/40 PASS** (37 cũ + 3 mới). Kiểm tra layout bằng screenshot Playwright (ô chọn tiền tệ cạnh ô giá, dòng tỷ giá, tổng chi phí — không bị vỡ layout, không tràn khung). Checksum `data/finance.db` không đổi (mọi lệnh backend trong task này đều trỏ `PF_DATABASE_PATH` vào `finance.test.db`).
