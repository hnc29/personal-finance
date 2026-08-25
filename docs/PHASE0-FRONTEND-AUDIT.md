# Giai đoạn 0 — Kiểm kê hiện trạng frontend (Personal Finance Cockpit)

Tài liệu này là báo cáo bắt buộc theo §13 của `CLAUDE_FRONTEND_REDESIGN.md`, được viết trước khi có bất kỳ thay đổi mã nguồn nào. Toàn bộ số liệu dưới đây lấy trực tiếp từ mã nguồn, `package.json`, kết quả `lint`/`typecheck`/`build`, `git status` trên máy của bạn, và một vòng chụp ảnh baseline chạy trên bản sao dữ liệu scratch (không đụng `data/finance.db` thật). Không có phần nào là suy đoán.

Ngày kiểm kê: 2026-08-25. Commit hiện tại trên máy bạn: `571af81` (v2.00), nhánh `master`, đang **ahead of origin 1 commit** (bạn chưa `git push`), **working tree sạch** — không có thay đổi chưa commit nào có thể bị ghi đè.

---

## 1. Stack thực tế đã phát hiện

Xác nhận từ `apps/web/package.json`, `next.config.ts`, `tsconfig.json`:

| Thành phần | Giá trị thực tế |
|---|---|
| Framework | Next.js `^15.1.7` khai báo → **15.5.23** thực resolve (App Router, không dùng Pages Router) |
| React | `^19.0.0` |
| TypeScript | `^5.7.3`, `strict: true`, target ES2017 |
| Data fetching | TanStack Query `^5.66.8` |
| Lint | ESLint `^9.19.0` (`eslint . --max-warnings=0`) |
| UI component library | **Không có.** Không Tailwind, không shadcn/ui, không MUI/Chakra/AntD, không CSS-in-JS |
| Chart library | **Không có.** Chưa có Recharts/Chart.js/Visx/D3 nào được cài |
| Styling | 1 file CSS thuần tay viết: `apps/web/app/styles.css` (105 dòng, CSS custom properties, 2 breakpoint: 820px và 560px) |
| Routing | **Single-route.** `next build` chỉ sinh ra `/`, `/_not-found`, `/manifest.webmanifest` — toàn bộ 7 "màn hình" là tab trong một `useState<View>` ở client, không phải URL riêng |
| Ngôn ngữ mặc định | Tiếng Việt (`vi`), có toggle sang tiếng Anh (`lib/i18n.ts`) |
| Build output | `/` nặng 33.8 kB (142 kB First Load JS) — build hiện tại sạch, không cảnh báo |

Hệ quả quan trọng cho các giai đoạn sau: tài liệu định hướng có đề cập tham khảo các repo shadcn/Next.js — vì dự án **không dùng Tailwind/shadcn**, các repo đó chỉ dùng được để tham khảo bố cục/pattern, không thể copy component trực tiếp (đúng theo đúng tinh thần §9 của tài liệu chỉ thị: "chỉ lấy component hoặc pattern cần thiết", "điều chỉnh theo design token của personal-finance").

Backend (không thuộc phạm vi sửa nhưng ảnh hưởng đến việc test frontend): FastAPI + SQLAlchemy + SQLite (`data/finance.db`), CORS allow-list mặc định chỉ mở cho `localhost:3000`/`127.0.0.1:3000` (đã biết từ `app/core/config.py`).

**Đính chính (đã sửa sau khi kiểm tra lại theo yêu cầu của bạn):** báo cáo bản đầu ghi nhầm là CSDL thật lệch 1 migration so với head. Đó là do tôi kiểm tra một bản sao `data/finance.db` nằm trong sandbox cloud (245.760 byte, dữ liệu test rỗng, dùng để chạy dev server khi audit) thay vì database thật trên máy bạn. Đã kiểm tra lại trực tiếp trên máy bạn (chỉ đọc, không sửa): `~/Projects/personal-finance/data/finance.db` (335.872 byte) đang ở đúng migration mới nhất **`0018_transfer_pair_import` (head)** — **không có gì bị lệch**. Dữ liệu thật hiện có 122 Chi tiêu, 23 Thu nhập, 37 Chuyển tiền, 1 Điều chỉnh, 1 Thanh toán thẻ tín dụng, 1 Gửi tiết kiệm; 36/37 giao dịch Chuyển tiền đã có liên kết `raw_import_row_id_secondary` (cột do 0018 thêm), 1 giao dịch còn lại nhiều khả năng là chuyển tiền tạo thủ công (không qua import theo cặp) nên vốn dĩ không cần cột này — không phải lỗi dữ liệu.

---

## 2. Các màn hình và chức năng hiện có

Ứng dụng là 1 trang, điều hướng bằng 7 tab (nhãn tiếng Việt lấy từ `lib/i18n.ts`):

| Tab (view state) | Nhãn VN | Chức năng chính đã xác nhận qua source + screenshot |
|---|---|---|
| `transactions` (mặc định) | Giao dịch | Form nhập nhanh 4 loại sự kiện (Chi tiêu/Thu nhập/Chuyển tiền/Thanh toán thẻ tín dụng), chọn tài khoản, chọn danh mục qua cây phân cấp có tìm kiếm, ghi chú, chọn ngày, bảng liệt kê giao dịch có xem/sửa/xoá chi tiết (`TransactionDetailModal`) |
| `accounts` | Tài khoản | CRUD tài khoản dạng thẻ lưới, logo ngân hàng thật theo từng ngân hàng, sắp xếp thứ tự (mũi tên lên/xuống), điều chỉnh số dư, ngừng kích hoạt |
| `categories` | Danh mục | Cây danh mục phân cấp không giới hạn độ sâu, tìm kiếm, lọc theo Chi tiêu/Thu nhập, icon picker, thêm danh mục con, sửa, ngừng kích hoạt |
| `assets` | Tài sản | Quản lý tiết kiệm (vòng đời: mở/gia hạn/đóng/đóng sớm), kim loại quý, tiền mã hoá (chọn coin qua CoinGecko), thẻ tín dụng — mỗi loại có form và panel riêng (`SavingsPanel`, `CoinPicker`, v.v.) |
| `data` | Dữ liệu | Nhập file Money Lover (upload → xem trước → áp dụng), xuất CSV/XLSX |
| `review` | Đối soát | Xem lại các dòng import chưa khớp, sửa và áp lại |
| `portfolio` | Đầu tư | 3 thẻ KPI (Tài sản ròng, Tài khoản trong phạm vi, Tài sản đầu tư) + danh sách theo nhóm tài sản (Tiết kiệm, Thẻ tín dụng, Kim loại quý, Tiền mã hoá) — **đây là màn hình gần nhất với "dashboard" hiện có, nhưng không có biểu đồ, không có xu hướng theo thời gian, không có KPI thu/chi theo kỳ** |

Không có: trang tổng quan (Overview/Dashboard) riêng, ngân sách (Budget), quản lý nợ (Debt) như một khái niệm độc lập (có category "Trả nợ/Cho vay" nhưng không có màn hình theo dõi khoản nợ), mục tiêu tài chính (Goals), biểu đồ dạng nào (đường/cột/tròn), báo cáo/phân tích riêng biệt.

30 component/hàm được định nghĩa trong `apps/web/app/page.tsx` (999 dòng, file lớn nhất và duy nhất chứa toàn bộ UI ngoài `styles.css`), gồm cả các modal, form con và tiện ích định dạng tiền/ngày.

---

## 3. Năm vấn đề UI/UX quan trọng nhất

Xếp theo mức ảnh hưởng, dựa trên ảnh chụp thật ở 4 viewport (390/768/1366/1440) — toàn bộ ảnh đính kèm trong `phase0-baseline-screenshots.zip`:

1. **Không có màn hình Tổng quan/Dashboard.** Đây là khoảng trống lớn nhất so với mục tiêu "Cockpit" của tài liệu chỉ thị (§6). Người dùng hiện không thể "nhận biết tình hình tài chính trong vòng vài giây" — phải tự suy ra từ tab Đầu tư (chỉ có số dư tĩnh) hoặc tab Giao dịch (chỉ có danh sách). Không có KPI thu/chi theo kỳ, không so sánh kỳ trước, không biểu đồ dòng tiền.

2. **Mật độ thông tin quá cao và lặp lại ở danh sách dạng text-action.** Màn hình Danh mục: mỗi dòng lặp lại cụm chữ "Đang hoạt động · Sửa · + Thêm danh mục con · Ngừng kích hoạt" dưới dạng link text thuần, không phải icon-button hay menu — với ~30 danh mục gốc/con hiển thị cùng lúc, mắt phải quét qua rất nhiều chữ lặp để tìm 1 hành động. Tương tự ở Tài khoản (mỗi thẻ có 5 hành động text: ↑ ↓ Sửa · Điều chỉnh số dư · Ngừng kích hoạt).

3. **Điều hướng tab bị cắt/tràn ngang trên mobile (390px) mà không có dấu hiệu cuộn rõ ràng.** Ảnh `mobile-390__transactions.png` cho thấy tab "Tài Sản" bị cắt chữ ở mép phải; CSS hiện tại chỉ có `nav { overflow:auto }` — có thể cuộn được nhưng không có gợi ý trực quan (không có gradient/fade/chevron báo còn nội dung), vi phạm tinh thần §8 "sidebar chuyển thành drawer hoặc bottom navigation phù hợp trên mobile". Ngoài ra tại viewport mobile này, một nút tròn nổi (avatar "N" — khả năng là widget của môi trường audit, không phải app) đè lên nút "‹" điều hướng ngày — cần xác minh lại khi kiểm tra trên trình duyệt thật của bạn, không loại trừ đây là artefact riêng của phiên audit, nhưng nếu là phần tử thật của app thì đây là lỗi chồng lấn cần sửa.

4. **Input file thô của trình duyệt, không theo design system.** Tab Dữ liệu dùng `<input type="file">` mặc định (nút "Choose File / No file chosen" kiểu Windows/Chrome gốc) — tương phản mạnh với phần còn lại của giao diện (font Georgia serif cho tiêu đề, nút bo góc, palette be-xanh). Đây là điểm không nhất quán rõ nhất trong toàn bộ audit.

5. **Không có biểu đồ và không có chỉ báo xu hướng nào**, dù dữ liệu hỗ trợ được (snapshot danh mục đầu tư đã có từ migration `0013_portfolio_snapshots`). §6–7 của tài liệu chỉ thị yêu cầu rõ biểu đồ dòng tiền theo thời gian và phân bổ chi tiêu theo nhóm — hiện chưa có nền tảng nào (không thư viện chart, không aggregation endpoint được gọi từ frontend cho mục đích biểu đồ).

**Điểm tích cực cần giữ lại (không phải "gap" cần sửa):** palette hiện tại (`--paper:#f6f4ed`, `--card:#fffdf7`, `--accent:#22614a`, `--ink:#17211b`) đã khá gần tinh thần "bình tĩnh, đáng tin cậy" mà tài liệu đề xuất, không cần đổi tông màu triệt để — chỉ cần tinh chỉnh cho khớp bảng màu đề xuất ở §4. Font Georgia serif cho tiêu đề + Inter cho nội dung đã hiển thị tiếng Việt có dấu chính xác trong mọi ảnh chụp. Cây danh mục, modal, và hệ thống responsive table→card ở 560px đã được xây khá kỹ, không phải viết lại từ đầu.

---

## 4. Danh sách file dự kiến thay đổi

Ước tính cho toàn bộ 5 giai đoạn (Giai đoạn 1–4), dựa trên cấu trúc thư mục thật:

| File/thư mục | Lý do dự kiến thay đổi |
|---|---|
| `apps/web/app/styles.css` | Chốt lại design token (màu, spacing, radius, shadow) theo `docs/DESIGN.md` sẽ tạo ở Giai đoạn 1 |
| `apps/web/app/page.tsx` (999 dòng) | Cần tách nhỏ trước khi sửa an toàn — hiện toàn bộ 30 component nằm chung 1 file. Dự kiến tách thành `apps/web/app/components/*.tsx` theo từng tab, giữ nguyên logic gọi API |
| `apps/web/app/page.tsx` → thêm mới | Component Dashboard/Tổng quan mới (Giai đoạn 2 bước 4) — file mới, ví dụ `apps/web/app/components/Overview.tsx` |
| `apps/web/lib/api.ts` (chưa đọc chi tiết ở Phase 0 này, sẽ đọc kỹ ở Giai đoạn 3) | Có thể cần thêm lời gọi tới các endpoint tổng hợp đã có sẵn ở backend (ví dụ portfolio snapshots) cho Dashboard — **không đổi contract**, chỉ gọi thêm |
| `apps/web/lib/i18n.ts` | Thêm nhãn mới cho Dashboard/biểu đồ nếu cần, giữ nguyên toàn bộ nhãn cũ |
| `apps/web/package.json` | Thêm 1 chart library duy nhất (ví dụ Recharts — nhẹ, không phụ thuộc thêm framework CSS) — **cần bạn duyệt trước khi thêm dependency mới** |
| `docs/DESIGN.md` (mới) | Nguồn sự thật cho design system — sản phẩm đầu ra bắt buộc của Giai đoạn 1 |
| Không đổi | `apps/api/**` (toàn bộ backend), `data/finance.db`, mọi migration, `apps/web/next.config.ts`, `apps/web/tsconfig.json` |

Không có route nào bị xoá vì hiện tại chỉ có 1 route (`/`) — rủi ro "mất route" gần như bằng 0, nhưng rủi ro "mất tab/hành vi tab" là có thật vì toàn bộ điều hướng là state nội bộ, cần audit kỹ khi tách file.

---

## 5. Rủi ro tương thích

- File `page.tsx` 999 dòng dùng chung state (`View`, các custom hook như `useAccountBalances`, `useI18n`) giữa nhiều component — tách file cần cẩn thận để không phá vỡ closure/props hiện có.
- `CategoryPicker` và cây danh mục có logic accessibility đã có sẵn (`role="tree"`, `aria-expanded`, đóng bằng phím Escape) — cần giữ nguyên hành vi này khi redesign, không chỉ giữ giao diện.
- Không có test tự động (không Jest/Vitest/Playwright test suite chính thức — chỉ có 16 script "audit" thủ công trong `scripts/task0XX-*.mjs`, mỗi script gắn với 1 task lịch sử, không phải regression suite chạy tự động trong CI). Nghĩa là **không có lưới an toàn tự động** để bắt regression — Giai đoạn 4 phải dựa hoàn toàn vào so sánh ảnh chụp desktop/mobile trước–sau và kiểm tra thủ công theo danh sách tiêu chí hoàn thành (§11).
- (Đã đính chính ở mục 1) CSDL thật trên máy bạn đã ở đúng migration head `0018_transfer_pair_import`, không có rủi ro migration nào cần xử lý trước khi bắt đầu Giai đoạn 1.

---

## 6. Kết quả chạy lint/typecheck/build (Giai đoạn 0 bước 5)

Tất cả chạy trên mã nguồn hiện tại, không sửa gì:

```
npm run lint        → PASS (0 lỗi, 0 cảnh báo, --max-warnings=0)
npm run typecheck    → PASS (tsc --noEmit, 0 lỗi)
npm run build        → PASS (next build, 5/5 trang tĩnh, First Load JS 142 kB)
```

**git status (trên máy bạn, `~/Projects/personal-finance`):** working tree sạch, branch `master` ahead of `origin/master` 1 commit (`571af81`, v2.00) — không có gì để mất, an toàn để bắt đầu Giai đoạn 1 khi bạn đồng ý.

**Baseline chụp ảnh (Giai đoạn 0 bước 3):** 28 ảnh (4 viewport × 7 tab) chạy trên bản sao scratch của CSDL (`/tmp/audit/audit.db`, đã nâng cấp lên schema mới nhất chỉ trên bản sao này để tránh lỗi 500, **không đụng CSDL thật**), cổng dev riêng (3010/8010) để không đụng tiến trình nào khác. 0 lỗi console thực sự — chỉ có 1 lỗi 404 chưa xác minh nguồn gốc (khả năng là icon/manifest, không phải lỗi nghiệp vụ). File `phase0-baseline-screenshots.zip` đính kèm là bằng chứng baseline để so sánh trước–sau ở Giai đoạn 4.

---

## 7. Quyết định cần bạn chọn (theo §13: tối đa 2 phương án + khuyến nghị)

**Vấn đề:** Kiến trúc thông tin mục tiêu ở §5 của tài liệu chỉ thị có 8 nhóm: Tổng quan, Giao dịch, Ngân sách, Tài sản, Khoản nợ, Mục tiêu tài chính, Báo cáo & phân tích, Danh mục/Cài đặt. Ứng dụng hiện tại **không có chức năng nghiệp vụ nào** cho 3 nhóm: Ngân sách, Khoản nợ (như một khái niệm riêng), Mục tiêu tài chính. Tài liệu chỉ thị cấm tạo "chức năng giả chỉ để giống bản mẫu" (§5).

- **Phương án A — Khuyến nghị.** Redesign chỉ 7 tab đang có (đổi tên nhãn điều hướng cho gần với 8 nhóm mục tiêu nếu hợp lý, ví dụ đổi "Đầu tư" thành "Tổng quan & Đầu tư" tạm thời chứa dashboard mới), **không thêm mục Ngân sách/Nợ/Mục tiêu vào menu**. Tác động: bám sát đúng những gì đang chạy thật, không có UI rỗng gây hiểu nhầm, đúng tinh thần "không chức năng giả". Khi nào bạn có nhu cầu nghiệp vụ thật cho 3 nhóm này (cần backend riêng), sẽ làm ở một đợt task khác.
- **Phương án B.** Thêm 3 mục nav ở trạng thái "sắp có" (empty-state rõ ràng, không có form/dữ liệu giả, có ghi chú "Chức năng đang phát triển"). Tác động: giao diện gần khớp bản mẫu 8 nhóm hơn, nhưng tăng số màn hình phải thiết kế/bảo trì ngay từ Giai đoạn 2 dù chưa có nghiệp vụ đứng sau, và có rủi ro nhỏ là người dùng bấm vào rồi thất vọng vì trống.

Nếu bạn không phản hồi gì, tôi sẽ mặc định theo Phương án A khi bắt đầu Giai đoạn 1, vì đây là lựa chọn an toàn hơn và đúng ràng buộc "không tạo chức năng giả" đã ghi rõ trong chính tài liệu chỉ thị của bạn.

---

## 8. Kế hoạch triển khai theo từng nhóm nhỏ

Bám sát đúng thứ tự bắt buộc ở §10 của tài liệu chỉ thị. Mỗi nhóm là một đợt thay đổi nhỏ, có thể revert riêng, có build/lint/screenshot xác nhận trước khi sang nhóm kế:

**Giai đoạn 1 — Chốt design system** (chỉ tạo tài liệu, chưa sửa UI)
- Viết `docs/DESIGN.md`: token màu (map từ bảng đề xuất §4 sang biến CSS hiện có `--ink/--muted/--paper/--card/--accent/--line`), typography scale, spacing scale, radius/shadow, quy tắc biểu đồ, trạng thái component, Do/Don't.
- Không đụng file `.tsx`/`.css` nào ở giai đoạn này.

**Giai đoạn 2 — Xây nền tảng giao diện** (chia nhỏ theo đúng thứ tự §10-GĐ2)
1. Cập nhật token trong `styles.css` theo `DESIGN.md` (không đổi layout) → build + screenshot xác nhận không vỡ giao diện cũ.
2. Tách `page.tsx` thành các file component riêng theo tab, giữ nguyên hành vi 100% (refactor thuần, không đổi UI) → build + typecheck xác nhận.
3. Chuẩn hoá lại button/input/select/modal/card/table dùng chung (trạng thái loading/empty/error đã có ở `Loading`/`Empty`/`Error`, chỉ cần đồng bộ style).
4. Xây màn hình Tổng quan/Dashboard mới — theo Phương án A/B ở mục 7, dùng dữ liệu thật từ endpoint hiện có, thêm chart library (cần duyệt).
5. Áp bảng/form Giao dịch theo quy tắc §7 (tabular numerals, dấu +/-, filter rõ ràng).
6. Các màn hình còn lại (Tài khoản, Danh mục, Tài sản, Dữ liệu, Đối soát).

**Giai đoạn 3 — Kết nối nghiệp vụ**
- Rà lại từng màn hình đã redesign với dữ liệu thật (số âm, số lớn, tên danh mục dài, chuỗi tiếng Việt dài) trên CSDL thật (chỉ đọc, không sửa).
- Xác nhận API client/contract không đổi.

**Giai đoạn 4 — Kiểm thử và nghiệm thu**
- Sau mỗi nhóm ở trên: `npm run lint && npm run typecheck && npm run build`, chụp lại 4 viewport, so với `phase0-baseline-screenshots.zip`.
- 1 vòng sửa lỗi tổng hợp, 1 vòng xác nhận cuối — không lặp polish vô hạn (đúng §9 giới hạn 2 vòng).
- Bàn giao: danh sách file đã đổi, tóm tắt quyết định thiết kế, ảnh so sánh trước/sau.

---

**Tôi dừng ở đây, chưa sửa bất kỳ file mã nguồn nào**, đúng yêu cầu của bạn ("chưa sửa mã nguồn cho đến khi hoàn thành báo cáo hiện trạng"). Đang chờ bạn xem báo cáo này và cho ý kiến về mục 7 (Phương án A/B) trước khi tôi bắt đầu Giai đoạn 1.
