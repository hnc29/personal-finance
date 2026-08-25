# TASK-038 — Sửa lỗi "bấm tải lên không phản hồi" khi nhập file Money Lover

## Yêu cầu gốc

> debug tính năng tải lên, tôi đãn thử với file moneylover... trong
> donwloads nhưng nhấn tải lên không phản hồi

Người dùng thử tải lên file xuất từ Money Lover đang nằm sẵn trong
`Downloads`:
`MoneyLover_Tổng cộng(Wallet)_Tất cả(Category)_01_07_2026-31_07_2026.xlsx`
— bấm nút "Tải lên để xem xét" nhưng không có phản hồi gì (không lỗi,
không loading, không kết quả).

## Nguyên nhân — hai lỗi độc lập, cùng chặn một luồng

### Lỗi 1: tên file có dấu tiếng Việt làm `fetch()` crash ngay lập tức

`DataPage`'s `upload()` (trước khi sửa) gửi tên file gốc thẳng vào header
HTTP tuỳ biến `X-Filename`:

```js
fetch(url, { headers: { "X-Filename": file.name } })
```

Theo chuẩn WHATWG Fetch, giá trị của `Headers` bắt buộc phải là
ByteString (chỉ các ký tự Latin-1, mã 0–255). Tên file thật có dấu tiếng
Việt ("Tổng", "cộng", "Tất", "cả") nằm ngoài phạm vi đó, nên **ngay khi
tạo đối tượng `Headers`/`Request`**, trình duyệt ném ra `TypeError` đồng
bộ — trước khi bất kỳ request nào được gửi đi. Xác nhận trực tiếp bằng
Node.js:

```
$ node -e 'new Headers({"X-Filename": "...Tổng cộng...xlsx"})'
TypeError: Cannot convert argument to a ByteString because the character
at index 12 has a value of 7893 which is greater than 255.
```

`upload()` gốc **không có `try/catch`** quanh đoạn này — throw đồng bộ
trong một hàm `async` được gọi từ `onClick` mà không ai bắt, nên không có
bất kỳ dấu hiệu nào hiển thị lên giao diện: không lỗi, không trạng thái
loading, không gì cả. Đúng như mô tả "nhấn tải lên không phản hồi".

### Lỗi 2: CORS chặn header `X-Filename` (phát hiện khi kiểm thử thực tế)

Sau khi sửa lỗi 1 (mã hoá tên file trước khi đưa vào header), kiểm thử
đầu-cuối bằng Playwright với chính file thật của người dùng vẫn thất bại
— lần này với lỗi CORS:

```
Access to fetch at '.../api/v1/imports/money-lover' from origin
'http://127.0.0.1:3000' has been blocked by CORS policy: ... 'X-Filename'
is not allowed by Access-Control-Allow-Headers.
```

`app/main.py` cấu hình `CORSMiddleware` với
`allow_headers=["Content-Type", "Accept"]` — thiếu `X-Filename`. Đây là
lỗi **độc lập với ký tự có dấu**: nó chặn preflight của **mọi** lần tải
lên, kể cả file có tên thuần ASCII, vì trình duyệt luôn kiểm tra
preflight trước khi gửi request thật có header tuỳ biến. Nếu chỉ sửa lỗi
1 mà bỏ qua lỗi này, tính năng tải lên vẫn hỏng.

## Cách sửa

1. **Frontend (`apps/web/app/page.tsx`, `DataPage`)**:
   - Mã hoá tên file bằng `encodeURIComponent(file.name)` trước khi đưa
     vào header `X-Filename` — giữ giá trị header thuần ASCII.
   - Bọc toàn bộ luồng gọi API trong `try/catch`, luôn hiển thị trạng
     thái (`status`, `role="status"`) dù thành công hay thất bại — sửa
     tận gốc lớp lỗi "im lặng", không chỉ riêng nguyên nhân cụ thể này.
   - Thêm trạng thái `uploading`: vô hiệu hoá nút và đổi nhãn thành "Đang
     tải lên..." trong lúc chờ, để một request chậm cũng không trông như
     "không phản hồi".
   - Bọc `response.json()` bằng `.catch(() => null)` để một phản hồi lỗi
     không phải JSON hợp lệ cũng không tự nó ném lỗi chưa được bắt.
2. **Backend (`apps/api/app/api/data.py`)**: `unquote()` header
   `X-Filename` về lại tên Unicode thật trước khi lưu/trả về.
3. **Backend (`apps/api/app/main.py`)**: thêm `"X-Filename"` vào
   `allow_headers` của `CORSMiddleware`.
4. **i18n**: thêm `"Uploading..."` / "Đang tải lên..." vào từ điển. Nhân
   tiện phát hiện và sửa luôn một lỗ hổng i18n có sẵn từ trước (không
   liên quan tính năng tải lên): tiêu đề/mô tả của `Section` trong
   `DataPage` ("Data" / "Import and export personal finance records.")
   chưa từng được thêm vào từ điển nên luôn hiển thị tiếng Anh dù đang ở
   giao diện tiếng Việt — đã thêm bản dịch.

## Kiểm thử

- `npm run typecheck`, `npm run lint`: sạch. (Phát sinh và sửa một lỗi
  kiểu: file này định nghĩa component tên `Error`, làm che khuất lớp
  `Error` toàn cục trong phạm vi file — `error instanceof Error` trong
  `catch` phải đổi thành `error instanceof globalThis.Error` để trỏ đúng
  lớp `Error` thật.)
- `uv run pytest`: 242/242 pass, gồm 4 test mới trong
  `tests/test_moneylover_import_api.py` (test qua HTTP endpoint thật, có
  header `X-Filename` mã hoá — lớp trước đây `test_moneylover_import.py`
  hoàn toàn không kiểm tra vì chỉ gọi thẳng service function):
  - tải lên thành công với tên file tiếng Việt có dấu, mã hoá đúng chuẩn
    frontend gửi lên.
  - xác nhận: gửi thẳng header chưa mã hoá qua HTTP là **không thể** (bản
    thân httpx/trình duyệt từ chối) — chứng minh việc mã hoá không phải
    tùy chọn.
  - không có header `X-Filename` vẫn dùng tên mặc định `upload.xlsx`.
  - **preflight CORS thật sự cho phép header `X-Filename`** — test này
    cố tình revert lại `allow_headers` để xác nhận nó thất bại đúng cách
    (400 "Disallowed CORS headers") trước khi khôi phục lại bản sửa,
    chứng minh test có khả năng bắt được lỗi.
- `uv run ruff check`: sạch.
- 12/12 audit script trước đó (`task026`..`task037`) vẫn pass không đổi;
  audit mới `task038-upload-resilience-audit.mjs` khoá lại: header
  `X-Filename` được mã hoá, `try/catch` + trạng thái `uploading`, backend
  `unquote()`, CORS `allow_headers` có `X-Filename`, và i18n đầy đủ.
- **Kiểm thử đầu-cuối bằng Playwright với chính file thật của người
  dùng** (`~/Downloads/MoneyLover_Tổng cộng(Wallet)_Tất cả(Category)_01_
  07_2026-31_07_2026.xlsx`, lấy trực tiếp từ máy qua device bridge):
  chạy backend + frontend thật (cổng 8000/3000, DB nháp riêng biệt,
  migrate + seed 69 danh mục mặc định), mở giao diện, chọn đúng file đó,
  bấm "Tải lên để xem xét" — nhập thành công **212 dòng giao dịch thật**,
  hiển thị "Dòng đã nhập: 212", không có lỗi console nào. Xác nhận cả hai
  lỗi đã được sửa cùng lúc, đúng với kịch bản người dùng báo cáo.
