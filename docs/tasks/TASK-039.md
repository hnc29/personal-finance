# TASK-039 — Sửa lỗi ký hiệu dấu khi ghi Chi tiêu & bỏ ".0000" khi hiển thị tiền

## Yêu cầu gốc

> Tôi vừa thử nhập chi tiêu từ ví zalopay thì số tiền không bị trừ đi mà
> cộng thêm, hãy điều chỉnh.
> tiền việt nam không có phần lẻ, hãy bỏ phần .0000 đi

Hai lỗi độc lập, cùng phát hiện trong một lần thử ghi giao dịch.

## Lỗi 1: ghi "Chi tiêu" lại cộng thêm vào số dư thay vì trừ đi

### Nguyên nhân

`app/services/ledger.py` phía backend **tin tưởng hoàn toàn dấu (+/-) của
số tiền mà client gửi lên** — không tự suy luận hay đảo dấu theo loại sự
kiện. Đây là thiết kế có chủ đích: `TRANSFER` và `CREDIT_CARD_PAYMENT` đã
tự đảo dấu một bên ở phía frontend trước khi gửi (`amount: \`-${...}\``),
và `moneylover_normalize.py` (luồng nhập Money Lover) cũng tự đảo dấu
đúng theo loại sự kiện trước khi lưu.

Nhưng khối lệnh xử lý **Chi tiêu/Thu nhập nhập tay** (composer một dòng
trong `Transactions`) lại bỏ sót bước này — gửi thẳng số tiền người dùng
gõ, không dấu, không đảo:

```js
// trước khi sửa
: entries.map(entry => ({ account_id: Number(entry.accountId), amount: entry.amount }));
```

Người dùng chọn tab "Chi tiêu", gõ một số dương như bình thường (không có
gợi ý nào trong giao diện yêu cầu gõ dấu trừ) — số đó được gửi nguyên
dương lên server, cộng thẳng vào số dư thay vì trừ đi.

### Cách sửa

`Transactions`'s `submit()`: nút chọn loại (Chi tiêu/Thu nhập) giờ là
**nguồn duy nhất quyết định dấu** — bỏ qua bất kỳ dấu "-" nào người dùng
có thể đã gõ (tránh đảo dấu hai lần), rồi ép dấu theo loại:

```js
: entries.map(entry => {
    const magnitude = entry.amount.trim().replace(/^-/, "");
    return { account_id: Number(entry.accountId), amount: type === "EXPENSE" ? negateMoney(magnitude) : magnitude };
  });
```

Đồng thời bỏ `-?` khỏi `moneyPattern` của ô nhập số tiền một-dòng (trước
đây cho phép gõ dấu trừ dù không có gợi ý gì) — khớp với ô nhập
Chuyển tiền/Thanh toán thẻ vốn đã không cho gõ dấu.

## Lỗi 2: tiền VND hiển thị kèm ".0000" thừa

### Nguyên nhân

Toàn bộ số tiền lưu ở backend là số thập phân cố định **luôn đúng 4 chữ
số sau dấu phẩy** (`apps/api/app/core/money.py`, `MONEY_DECIMAL_PLACES =
4`) — một số nguyên VND như 50000 luôn được serialize thành chuỗi
`"50000.0000"`. Phía frontend trước đây hiển thị thẳng chuỗi đó ở mọi nơi
(số dư tài khoản, dòng giao dịch, tiền gốc sổ tiết kiệm, tài sản ròng...)
mà không cắt bớt số 0 thừa.

### Cách sửa

Thêm hàm dùng chung `fmtMoney()`, tận dụng lại chính hàm `sumMoney()` đã
có sẵn trong file (cộng tiền bằng số nguyên BigInt tỉ lệ, không dùng số
thực) — gọi `sumMoney([value])` để cắt số 0 thừa ở cuối một cách **chính
xác tuyệt đối, không làm tròn, không mất thông tin**: một số tiền có phần
lẻ thật (ví dụ lãi tiết kiệm tính theo ngày) vẫn hiển thị đủ, chỉ số 0
thừa mới bị cắt. Áp dụng `fmtMoney()` ở toàn bộ 11 vị trí hiển thị tiền
trực tiếp từ API: số dư tài khoản, dòng giao dịch, tiền gốc/lãi dự kiến/
lãi thực nhận sổ tiết kiệm, tài sản ròng, giá trị tài sản đầu tư trong
Portfolio.

## Kiểm thử

- `npm run typecheck`, `npm run lint`: sạch.
- 12/12 audit script trước đó (`task026`..`task038`) vẫn pass không đổi.
- Audit mới `task039-expense-sign-and-money-format-audit.mjs`: khoá lại
  (a) `submit()` ép dấu Chi tiêu âm/Thu nhập dương qua `negateMoney()`,
  (b) ô nhập số tiền không còn cho gõ dấu trừ, (c) `fmtMoney()` được áp
  dụng ở đủ 11 vị trí hiển thị tiền đã biết, (d) `fmtMoney()` không bao
  giờ dùng `Number()`/`parseFloat()` mà luôn qua `sumMoney()` chính xác.
  Đã tự kiểm chứng audit thật sự bắt được lỗi bằng cách revert tạm bản sửa
  lỗi 1 và xác nhận audit fail đúng cách trước khi khôi phục.
- **Kiểm thử đầu-cuối bằng Playwright, đúng kịch bản người dùng báo cáo**:
  chạy backend + frontend thật (DB nháp riêng), tạo tài khoản ví ZaloPay,
  nạp số dư ban đầu 500.000 (qua API, xác nhận backend trả về
  `"500000.0000"` — đúng lỗi 2 mô tả), sau đó mở giao diện thật, chọn
  "Chi tiêu" → ví ZaloPay → nhập 150.000 → Ghi giao dịch:
  - Số dư hiển thị **trước** khi ghi: `500000` (không có `.0000`).
  - Dòng giao dịch mới hiển thị: `-150000` (đúng dấu âm, đúng không có
    `.0000`).
  - Số dư **sau** khi ghi: `350000` = 500.000 − 150.000 (bị **trừ đi**
    đúng như kỳ vọng, không phải 650.000 như lỗi cũ).
  - Không có lỗi console nào.
  - Kiểm tra thêm chiều "Thu nhập" (không nằm trong báo cáo gốc nhưng cần
    xác nhận không hồi quy): ghi thêm 80.000 Thu nhập → số dư
    350.000 → 430.000 (cộng đúng), dòng giao dịch hiển thị `80000`.
  - Ảnh chụp bảng giao dịch xác nhận trực quan: `500000 · ZaloPay`,
    `-150000 · ZaloPay`, `80000 · ZaloPay` — không dòng nào còn `.0000`.
