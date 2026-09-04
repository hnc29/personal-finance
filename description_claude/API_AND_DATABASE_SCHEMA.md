# API REST & Schema database

## REST API — theo router (`app/main.py` include đúng 9 router)

Base path chung `/api/v1`. Tất cả endpoint đồng bộ (FastAPI không-async).
Không có auth/login nào — app chạy local-first, chỉ một người dùng.

### `accounts` (`app/api/accounts.py`, prefix `/accounts`)
| Method & path | Việc làm |
|---|---|
| `POST ""` | Tạo tài khoản; nếu `CREDIT_CARD` kèm `credit_limit` thì tạo luôn `CreditCardProfile` mặc định (statement_day=1, due_day=15). |
| `GET ""` | Danh sách theo `sort_order`, `id` là tiebreaker. |
| `GET "/{id}"` | Chi tiết; 404 nếu không tồn tại. |
| `GET "/{id}/balance"` | Số dư tính động từ entries; 404 nếu tài khoản không tồn tại. |
| `PATCH "/{id}"` | Cập nhật một phần; deactivate qua `is_active=false` (không hard-delete). |

### `assets` (`app/api/assets.py`, prefix `/assets`) — vàng + crypto
| Method & path | Việc làm |
|---|---|
| `GET "/metal-brands"` | Danh sách brand hỗ trợ. |
| `GET "/metals"`, `POST "/metals"`, `PATCH "/metals/{id}"`, `DELETE "/metals/{id}"` | CRUD holding+lot đầu tiên trong 1 request. **Không** có endpoint bán, thêm lô thứ 2, sửa/xoá lô riêng lẻ. |
| `GET "/crypto/coins?q="` | Tìm kiếm coin qua CoinGecko `/coins/list` (cache 6h) — chỉ tra cứu danh tính, không phải giá. |
| `GET "/crypto"`, `POST "/crypto"`, `PATCH "/crypto/{id}"`, `DELETE "/crypto/{id}"` | CRUD holding+lot crypto. |
| `POST "/crypto/sync-prices"` | Gọi `sync_crypto_holdings_prices()` — fetch **CoinMarketCap** listing endpoint (không chính thức), ghi `PriceQuote` mới cho từng holding khớp được. |
| `POST "/metals/sync-prices"` | Refresh báo giá BTMC cho toàn bộ holding `is_net_worth=true` (gọi `get_or_refresh_metal_quote`, có cache 30 phút). |

### `savings` (`app/api/savings.py`, prefix `/savings`)
| Method & path | Việc làm |
|---|---|
| `GET ""`, `POST ""` | Danh sách / mở sổ mới (tuỳ chọn `funding_account_id` → `SAVINGS_DEPOSIT` event). |
| `GET "/{id}"`, `GET "/{id}/terms"` | Chi tiết sổ / lịch sử kỳ hạn. |
| `PATCH "/{id}"` | Sửa field cơ bản — chỉ cho phép nếu sổ mới có 1 kỳ ACTIVE, **trừ** `excluded_from_reports` luôn sửa được. |
| `POST "/{id}/close"` | Tất toán đúng hạn (`close_savings`). |
| `POST "/{id}/early-close"` | Tất toán trước hạn (`early_close_savings`, có phí tuỳ chọn). |
| `POST "/{id}/renew"` | Tái tục (`renew_savings`). |
| `DELETE "/{id}"` | Xoá sổ (hoàn tiền về tài khoản nguồn — xem UI "Delete savings account?"). |

### `categories` (`app/api/categories.py`, prefix `/categories`)
CRUD chuẩn (`POST`/`GET ""`/`GET "/{id}"`/`PATCH "/{id}"`), validate
`parent_id` tồn tại, chống tự làm cha của chính mình (`SelfParentError`
→ 400), chống vượt 3 cấp/tạo vòng lặp (`InvalidHierarchyError` → 400).
Không hard-delete.

### `financial-events` (`app/api/financial_events.py`, prefix `/financial-events`)
| Method & path | Việc làm |
|---|---|
| `GET ""` | Toàn bộ event kèm entries, theo `id`. |
| `GET "/{id}"` | Chi tiết; 404 nếu không tồn tại. |
| `POST ""` | Tạo mới; tài khoản không tồn tại → 404; vi phạm bất biến entries → 400. |
| `PATCH "/{id}"` | **Thay toàn bộ** (không patch từng field); loại bị bảo vệ → 409; account/entries lỗi → 400/404; event không tồn tại → 404. Check loại bị bảo vệ chạy **trước** validate entries. |
| `DELETE "/{id}?force="` | Loại bị bảo vệ → 409 (trừ `force=true`); không tồn tại → 404; thành công trả `{id, deleted:true}` (200, không 204). |

### `read-models` (`app/api/read_models.py`, prefix trống — path đầy đủ)
| Method & path | Việc làm |
|---|---|
| `GET "/portfolio/overview"` | Net Worth thời gian thực, xem `ARCHITECTURE.md`. |
| `GET "/import-batches"` | Danh sách batch đã nhập + `applied_row_count`. |
| `GET "/reconciliation-candidates"` | Danh sách ứng viên đối soát — chỉ đọc. |

### `data` (`app/api/data.py`, prefix `/` — path đầy đủ dưới đây)
| Method & path | Việc làm |
|---|---|
| `GET "/exports/events.csv"`, `GET "/exports/events.xlsx"` | Xuất, mỗi dòng = 1 `AccountEntry` (không phải 1 event). Lọc tuỳ chọn `account_id`/`start_date`/`end_date`. |
| `POST "/imports/money-lover"` | Upload `.csv`/.xlsx` (header `X-Filename`, ≤10MB) → nhập thô + áp dụng ngay trong cùng transaction. |
| `POST "/imports/{batch_id}/apply"` | Áp dụng lại (idempotent) một batch đã nhập. |

### `ai` (`app/api/ai.py`, prefix `/ai`)
`GET "/status"` (bật/tắt Ollama), `POST "/suggest"` (gợi ý qua Ollama cục
bộ, 503 nếu tắt hoặc chưa cấu hình model).

### `fx` (`app/api/fx.py`, prefix `/fx`)
`GET "/usd-vnd"` — tỷ giá USD/VND cho form nhập crypto bằng USD
(`open.er-api.com`, cache 1h).

### `backup` (`app/api/backup.py`, prefix `/backup`)
`GET "/list"`, `POST "/create"` (mode `project`|`download`),
`GET "/download/{filename}"`, `DELETE "/{filename}"`,
`POST "/restore/project"`, `POST "/restore/upload"`. Dùng
`sqlite3.Connection.backup()` gốc (snapshot nhất quán ngay cả khi DB đang
WAL) — không dùng công cụ ngoài; sau backup luôn `PRAGMA integrity_check`,
xoá ngay file lỗi nếu không phải `("ok",)`.

### Không có router HTTP nào cho
Thẻ tín dụng (`CreditCardProfile`/`CreditCardStatement`), xuất MISA
(`misa_export.py` — có model/service/test đầy đủ nhưng không router), xác
nhận đối soát (chỉ đọc), sao kê ngân hàng SHB/VPBank (chỉ có parser). Xem
`BUSINESS_RULES.md` §10 cho danh sách đầy đủ.

---

## Schema database — theo bảng

Mọi cột tiền là `INTEGER` hậu tố `_scaled` (×10.000, trừ số lượng crypto
×100.000.000) — xem `ARCHITECTURE.md`. Enum lưu dạng `native_enum=False`
(TEXT có CHECK, không phải SQLite ENUM thật).

| Bảng | Cột chính | Quan hệ |
|---|---|---|
| `accounts` | `id, name, account_type, currency, is_active, sort_order` | 1–1 `credit_card_profiles`; nguồn của `account_entries` |
| `credit_card_profiles` | `account_id (FK unique), credit_limit_scaled, statement_day, payment_due_day, payment_due_month_offset` | 1–1 `accounts` |
| `credit_card_statements` | `profile_id (FK), statement_date, due_date, balance_due_scaled, paid_scaled, status` | N–1 `credit_card_profiles` |
| `categories` | `id, name, parent_id (self-FK), is_active, icon` | Adjacency-list tự tham chiếu, không giới hạn độ sâu ở DB |
| `financial_events` | `id, event_type, transaction_date, occurred_at, category_id (FK), payee_text, trip_event_text, note, raw_import_row_id (FK unique), raw_import_row_id_secondary (FK unique), excluded_from_reports` | 1–N `account_entries` (cascade delete-orphan) |
| `account_entries` | `id, financial_event_id (FK), account_id (FK), amount_scaled` | N–1 cả hai phía |
| `import_batches` | `id, source, original_filename, file_sha256 (indexed), imported_at, row_count` | 1–N `raw_import_rows` |
| `raw_import_rows` | `id, import_batch_id (FK), source_row_number, source_row_id, raw_payload (TEXT, bất biến), semantic_fingerprint` | unique `(import_batch_id, source_row_number)` |
| `reconciliation_candidates` | `id, raw_import_row_id (FK), financial_event_id (FK), state, score, amount_matches, reference_matches, reference_conflicts, date_distance_days, text_similarity_basis_points` | unique `(raw_import_row_id, financial_event_id)` |
| `savings_products` | `id, name, institution, currency` | 1–N `savings_accounts` |
| `savings_accounts` | `id, product_id (FK), name, principal_scaled, opened_date, closed_date, status, funding_account_id (FK), excluded_from_reports, notes` | 1–N `savings_terms` |
| `savings_terms` | `id, savings_account_id (FK), renewed_from_term_id (self-FK unique), sequence, principal_scaled, start_date, maturity_date, term_months, annual_rate_scaled, non_term_rate_scaled, day_count_convention, interest_payment_method, maturity_action, status, actual_interest_scaled, closed_at` | unique `(savings_account_id, sequence)`; chuỗi tái tục qua `renewed_from_term_id` |
| `precious_metal_holdings` | `id, metal_type, brand, product_type, purity_scaled, pricing_instrument, is_net_worth, excluded_from_reports, note, image_uri` | 1–N `precious_metal_lots` (cascade) |
| `precious_metal_lots` | `id, holding_id (FK), quantity_scaled, quantity_unit, grams_scaled, purchase_date, purchase_price_scaled, total_cost_scaled, funding_account_id (FK, không dùng thật), note, image_uri` | N–1 holding |
| `crypto_holdings` | `id, coingecko_id, symbol, display_name, pricing_instrument, is_net_worth, excluded_from_reports, note` | 1–N `crypto_lots` (cascade) |
| `crypto_lots` | `id, holding_id (FK), quantity_scaled (×1e8), purchase_date, purchase_price_scaled, total_cost_scaled, funding_account_id (FK, không dùng thật), financial_event_id (FK, không dùng thật), note` | N–1 holding |
| `pricing_instruments` | `id, canonical_code (unique), asset_type, display_name` | 1–N `price_quotes` |
| `pricing_providers` | `id, code (unique), name` | 1–N `price_quotes` |
| `price_quotes` | `id, instrument_id (FK), provider_id (FK), product_code, match_level, state, quoted_at, observed_at, buy_price_scaled, sell_price_scaled, source_metadata (JSON text)` | **Append-only** — `before_update`/`before_delete` bị chặn cứng; unique `(instrument_id, provider_id, product_code, quoted_at)` |
| `portfolio_snapshots` | `id, snapshot_date (unique), captured_at, net_worth_scaled` | 1–N `portfolio_snapshot_components` (cascade); **model tồn tại nhưng không có nơi nào gọi `persist_daily_snapshot()`** |
| `portfolio_snapshot_components` | `id, snapshot_id (FK), component_type, source_key, value_scaled, quote_state, quote_provider, quoted_at` | unique `(snapshot_id, component_type, source_key)` |
| `misa_export_configurations` | `id, name (unique), export_format, currency, is_active` | 1–N `misa_account_mappings`, `misa_export_runs`; **không có router HTTP** |
| `misa_account_mappings` | `id, configuration_id (FK), source_account_id (FK), target_account_code, target_account_name` | unique `(configuration_id, source_account_id)` |
| `misa_export_runs` | `id, configuration_id (FK), exported_at, output_filename` | 1–N `misa_exported_events`; unique composite `(id, configuration_id)` cho FK composite bên dưới |
| `misa_exported_events` | `id, export_run_id, configuration_id, financial_event_id (FK)` | FK composite `(export_run_id, configuration_id)` → `misa_export_runs`; unique `(configuration_id, financial_event_id)` chống xuất trùng |

## Migration Alembic — 19 file theo thứ tự (`apps/api/migrations/versions/`)

| Rev | Nội dung |
|---|---|
| `0001_core` | `accounts`, `categories` |
| `0002_ledger` | `financial_events` + `account_entries` — lõi sổ cái kép |
| `0003_import` | `import_batches`, `raw_import_rows` |
| `0004_normalized_import` | Thêm `financial_events.raw_import_row_id` |
| `0005_misa_export` | Hạ tầng export MISA (4 bảng) |
| `0006_reconciliation` | `reconciliation_candidates` |
| `0007_credit_card_profiles` | `credit_card_profiles` |
| `0008_credit_card_statements` | `credit_card_statements` |
| `0009_savings` | `savings_products`, `savings_accounts`, `savings_terms` |
| `0010_precious_metals` | `precious_metal_holdings` + `precious_metal_lots` |
| `0011_crypto_holdings` | `crypto_holdings` + `crypto_lots` (ban đầu enum đóng chỉ BTC) |
| `0012_pricing_quotes` | `pricing_instruments`, `pricing_providers`, `price_quotes` |
| `0013_portfolio_snapshots` | `portfolio_snapshots` + `portfolio_snapshot_components` (chưa có nơi gọi) |
| `0014_crypto_coin_identity` | Thay `crypto_holdings.asset` (enum đóng) bằng `coingecko_id`/`symbol`/`display_name` (danh tính mở) |
| `0015_savings_lifecycle` | Vòng đời riêng cho `savings_terms` (`status`, `actual_interest_scaled`, `closed_at`) + `savings_accounts.funding_account_id`/`.notes` |
| `0016_account_sort_order` | `accounts.sort_order` (backfill theo id hiện có) |
| `0017_category_icon` | `categories.icon` (cố tình không backfill, `NULL`=icon tự suy ra) |
| `0018_transfer_pair_import` | `financial_events.raw_import_row_id_secondary` — cần cho ghép cặp TRANSFER Money Lover nhận diện đã áp dụng đủ 2 vế |
| `0019_excluded_from_reports` | Cột `excluded_from_reports` (Boolean, `server_default="0"`) vào 4 bảng: `financial_events`, `precious_metal_holdings`, `crypto_holdings`, `savings_accounts` |

Ghi chú kỹ thuật: các migration muộn (đặc biệt 0018) tránh
`op.batch_alter_table` trên bảng đã có dữ liệu FK tham chiếu thật — xem
lý do ở `ARCHITECTURE.md`.
