# TASK-031 — Đối chiếu thiết kế vs. triển khai thực tế

> Rà soát ngày 2026-08-24, dựa trên code hiện tại trên máy (`apps/web/app/page.tsx`,
> `apps/web/lib/category-tree.ts`, `apps/web/lib/i18n.ts`, `apps/api/app/api/assets.py`,
> `apps/api/app/api/categories.py`, `apps/api/app/services/category.py`,
> `apps/api/app/models/crypto.py`, `apps/api/app/models/precious_metal.py`) đối chiếu với
> `docs/tasks/TASK-031.md` (bản yêu cầu mới nhất, được ghi sau TASK-029/030).

Kết luận ngắn gọn: **TASK-031 chưa hoàn thành như tài liệu yêu cầu**, dù script tự kiểm
`apps/web/scripts/task031-ux-audit.mjs` báo "passed". Script đó chỉ kiểm tra sự tồn tại
của vài chuỗi ký tự trong file nguồn (ví dụ page.tsx có chứa từ `"CategoryPicker"` hay
không), không kiểm tra hành vi/kết cấu thật, nên nhiều tiêu chí FAIL rõ ràng trong mục 13
của TASK-031 vẫn đang tồn tại trong code mà audit không phát hiện ra. Không nên coi audit
này là bằng chứng đủ để chốt task.

## Mức nghiêm trọng cao (vi phạm trực tiếp các điều kiện FAIL của TASK-031 §13)

**1. Bộ chọn danh mục cha trong "Quản lý danh mục" vẫn là `<select>` gốc, và rò rỉ tên
tiếng Anh trong chế độ Việt.**
`page.tsx`, hàm `Categories()`, dòng field "Parent":
```
<select name="parent" defaultValue={editing?.parent_id ?? ""}>
  ...{getParentOptions(all, editing?.id || undefined).map(...)}
</select>
```
`getParentOptions` được gọi thiếu tham số `label` thứ 3 (mặc định là hàm identity), nên
breadcrumb luôn là tên canonical tiếng Anh (`"Expenses › Food & Drinks"`) bất kể ngôn ngữ
đang chọn. Đây chính xác là 2 vấn đề mà TASK-031 mở đầu bằng cách liệt kê là lý do UI hiện
tại "KHÔNG chấp nhận được", và là 2 điều kiện FAIL tường minh ở §13: "parent selector opens
a native English flat menu" và "canonical `Expenses` appears in VI mode". Mục §4.4 yêu cầu
thay hẳn bằng picker cây có tìm kiếm/thu gọn — chưa làm.

**2. Các loại giao dịch nâng cao không còn cách nào tạo được từ giao diện.**
`Transactions()` chỉ hiển thị `eventTypes.slice(0, 3)` (EXPENSE/INCOME/TRANSFER) trong
segmented control, và không có nút phụ `Khác` như §1.1 yêu cầu cho các loại còn lại
(CREDIT_CARD_PAYMENT, INTEREST, SAVINGS_DEPOSIT, SAVINGS_WITHDRAWAL, ASSET_PURCHASE,
ASSET_SALE, ADJUSTMENT). Trước đây các loại này có thể nhập qua select đầy đủ; giờ chúng
hoàn toàn không thể tạo qua UI — đây là một hồi quy chức năng, không chỉ là vấn đề thẩm mỹ.

**3. Crypto: backend luôn lưu tài sản là BTC bất kể người dùng nhập coin gì.**
`models/crypto.py`: `class CryptoAsset(str, enum.Enum): BTC = "BTC"` — vẫn chỉ có BTC.
`api/assets.py`, `create_crypto()`: `asset=CryptoAsset.BTC` bị hard-code, không đọc từ input.
Ô "coin" trên UI (`placeholder={tr("CoinGecko ID")}`) là text tự do, giá trị người dùng gõ
bị nhét vào `pricing_instrument` chứ không phải danh tính tài sản
(`pricing_instrument: v("coin").trim().toLowerCase()`), nghĩa là **mọi coin không phải BTC
mà người dùng thêm vào sẽ bị lưu sai thành một holding BTC**. Không có endpoint tìm coin
CoinGecko nào (`GET /api/v1/assets/crypto/coins?q=...` theo §11.1) tồn tại trong
`api/assets.py`. Toàn bộ mục §11 (chọn coin thật qua CoinGecko) coi như chưa triển khai,
kể cả phần backend lẫn frontend.

**4. Câu trợ giúp bị cấm rõ ràng vẫn còn nguyên trong luồng chính.**
`i18n.ts`, `entryAmountHelp` (vi): `"Số âm là tiền ra, số dương là tiền vào. Chuyển tiền
thường cần hai dòng giao dịch."` — vẫn được render trong fieldset chính của
`Transactions()` (`<p className="hint">{tr(transactionUiKeys.entryAmountHelp)}</p>`).
§1.3 yêu cầu xoá đúng câu này khỏi luồng đơn giản.

## Mức quan trọng

**5. Icon danh mục là ký tự Unicode đơn lẻ, không phải hệ icon SVG như §3 yêu cầu, và có
fallback là dấu chấm — đúng điều kiện FAIL "category icon is a stray dot".**
`category-tree.ts`, `categoryIcon()` chỉ định nghĩa icon cho 8 tên: Expenses, Income,
"Food & Drinks", Groceries, Salary, Interest, Transportation, Shopping — bằng ký tự
`↘ ↗ ◉ ▦ ₫ % → □`. Mọi danh mục khác (Bills & Utilities, Home & Family, Health & Fitness,
Entertainment, Education, Travel, Bonus, Investment, Other Expense/Income, và mọi danh mục
người dùng tự tạo) rơi vào fallback `"•"`. §3 yêu cầu rõ một hệ icon SVG nội bộ (không thêm
dependency) bao phủ toàn bộ nhóm mặc định.

**6. Danh mục gốc trong "Quản lý danh mục" mặc định ĐÓNG, trái với §4.2.**
`Categories()`: `const [expanded, setExpanded] = useState<Set<number>>(new Set());` — rỗng
khi tải trang, nên `Chi tiêu`/`Thu nhập` bị thu gọn ngay từ đầu. §4.2 yêu cầu "root sections
start expanded". Đáng chú ý: `CategoryPicker` dùng trong form giao dịch lại làm đúng (khởi
tạo `expanded` bằng tập id của các root) — hai nơi không nhất quán với nhau.

**7. "Danh mục sản phẩm" vàng/bạc (§10) chưa được triển khai ở frontend.**
Form thêm kim loại chỉ có ô nhập tự do `product_type`, không có danh sách chọn
SJC/BTMC/BTMH/PNJ/DOJI/Nguyên liệu, không có màn "+ Thêm sản phẩm". Backend đã có enum
`PreciousMetalBrand` với đúng 6 giá trị phù hợp, nhưng `Assets()` không gửi field `brand`
khi submit — mọi lần lưu đều mặc định `RAW` bất kể sản phẩm thật là gì.

**8. Rò rỉ tiếng Việt ngược sang chế độ English.**
`languageUnit()` trong `page.tsx`: khi `value === "chỉ"` luôn trả về chuỗi tiếng Việt cứng
`"Số lượng (chỉ)"`, kể cả khi `language === "en"`. §5 yêu cầu "English mode must remain
complete" — hiện không đúng cho ô này.

## Điểm đã làm đúng (để ghi nhận công bằng)

- Chiều cao các control chính (ngày/danh mục/tài khoản/số tiền) đồng nhất 54px theo CSS —
  đáp ứng dải 52–56px của §1.2.
- `+ Thêm chi tiết` thực sự unmount các field khi đóng (không chỉ ẩn bằng CSS) — đúng §1.4.
- BigInt literal (`10000n`...) đã được thay bằng `BigInt("10000")` dạng string — đúng §6.
- `CategoryPicker` trong form giao dịch đã tách thành component riêng, có ô tìm kiếm, cây
  thu gọn/mở rộng, giữ tổ tiên khi lọc — đúng phần lớn cấu trúc §2.
- Logic backend cho category (cha/con, chống chu trình, giới hạn 3 cấp, `parent_id` trong
  response) đã đúng và đầy đủ, không phát hiện lỗi.
- Tab tài sản (Sổ tiết kiệm / Vàng & Bạc / Crypto) đã tách theo §7, không hiện cả 3 form
  cùng lúc.

## Về việc kiểm chứng tự động

`apps/web/scripts/task031-ux-audit.mjs` (1KB) chỉ `assert` rằng một vài chuỗi ký tự tồn tại
trong `page.tsx`/`i18n.ts` (ví dụ `"CategoryPicker"`, `"aria-expanded"`,
`"pricing_instrument: v(\"coin\")"`). Dòng kiểm tra crypto thực chất đang coi sự hiện diện
của chính đoạn code lỗi (gán chuỗi coin vào `pricing_instrument`) là điều kiện "pass". Audit
này không kiểm tra: có dùng `<select>` gốc hay không, icon có phải SVG hay ký tự, root có
mở sẵn hay không, backend có hard-code BTC hay không, catalog sản phẩm kim loại có tồn tại
hay không. Nên không thể dùng kết quả "passed" của script này làm căn cứ rằng TASK-031 đã
đạt yêu cầu — cần một audit chặt hơn hoặc rà soát thủ công như trên.

## Về việc chạy `pytest` / `ruff` / `mypy`

Phiên làm việc này chưa chạy được các lệnh trên từ `apps/api` — cầu nối tới máy Mac chạy
trong một sandbox Linux riêng, không dùng chung `.venv` cục bộ (macOS/arm64) của dự án, nên
lệnh `uv run ...` sẽ cố tải lại Python/venv mới. Lệnh đã tự dừng an toàn khi gặp lỗi quyền
(không có thay đổi nào tới `.venv` hiện tại — đã kiểm tra lại, `.venv` gốc vẫn nguyên vẹn).
Đề xuất bạn tự chạy trực tiếp trên máy:
```
cd apps/api
uv run pytest -v
uv run ruff check .
uv run mypy app
```
để có baseline chính xác trước khi sửa tiếp.

## Đề xuất bước tiếp theo

Nếu muốn, có thể mở một task mới (ví dụ TASK-032) chỉ tập trung khắc phục 4 mục nghiêm
trọng ở trên (parent picker native + rò rỉ tiếng Anh, giao dịch nâng cao biến mất khỏi UI,
crypto hard-code BTC, câu trợ giúp bị cấm), vì đây là những điểm ảnh hưởng trực tiếp đến
tính đúng đắn dữ liệu (crypto) và khả năng sử dụng (parent picker, giao dịch nâng cao) chứ
không chỉ là thẩm mỹ.
