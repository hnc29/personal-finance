# Cẩm Nang Dành Cho AI Agent (Agent Playbook)

Tài liệu này quy định các nguyên tắc tối cao mà mọi **AI Agent** tiếp nhận dự án **BẮT BUỘC PHẢI TUÂN THỦ**.

---

## 1. Các Nguyên Tắc Bắt Buộc (Golden Rules)

### 1.1. Nguyên Tắc Sao Lưu Trước Khi Thay Đổi (Mandatory Backup Rule)
> [!IMPORTANT]
> **Yêu cầu từ người dùng (Verbatim):**
> *"- hãy giữ nguyên tắc backup toàn bộ vào 1 file zip lưu trong 1 thư mục backup, đặt tên theo ngày, giờ, version trước khi thay đổi nội dung của project, bất kì thao tác xoá nào trong backup cũng phải hỏi ý kiến lại"*

Mỗi khi chuẩn bị thực hiện một chuỗi thay đổi trên project:
1. Tạo 1 file zip toàn bộ project trong thư mục `backup/` đặt tên theo định dạng:
   `backup/backup_YYYY-MM-DD_HH-MM_v{N}.zip`
   *(Loại trừ `node_modules`, `.venv`, `.next`, `data`, `backup`, `.git`).*
2. Tuyệt đối không tự ý xoá bất kỳ file backup nào nếu chưa hỏi ý kiến người dùng.

### 1.2. Bảo Vệ Dữ Liệu Tài Chính Thật (Sensitive Financial Data)
- **TUYỆT ĐỐI KHÔNG** đọc, hiển thị, sao chép hoặc sửa đổi dữ liệu tài chính thật trong thư mục `data/` hoặc file `.env*`.
- Mọi bài kiểm thử (unit tests/integration tests) phải sử dụng dữ liệu giả lập (synthetic fixtures).

### 1.3. Nguyên Tắc Tiền Tệ & Làm Tròn (Money Rules)
- Không bao giờ dùng kiểu `float` cho tiền tệ trong Python. Luôn dùng `Decimal` và lưu `INTEGER` scaled by 10,000.
- Không tự ý làm tròn số tiền; từ chối số có quá 4 chữ số thập phân.

---

## 2. Quy Trình Phát Triển & Kiểm Tra (Development Workflow)

### Bước 1: Trước khi chỉnh sửa
- Đọc kỹ các file liên quan.
- Chạy toàn bộ test để kiểm tra trạng thái ban đầu:
  ```bash
  cd apps/api && uv run pytest -v
  ```

### Bước 2: Trong khi chỉnh sửa
- Thực hiện thay đổi nhỏ nhất, chính xác nhất theo yêu cầu.
- Giữ nguyên vẹn các tính năng hiện có, không tái cấu trúc mã nguồn lan man nếu không được yêu cầu.

### Bước 3: Kiểm tra & Xác thực bắt buộc trước khi hoàn thành
1. **Backend (`apps/api`)**:
   ```bash
   uv run pytest -v
   uv run ruff check .
   uv run mypy app
   ```
2. **Frontend (`apps/web`)**:
   ```bash
   npm run lint
   npm run typecheck
   ```
*Tất cả lệnh trên đều phải đạt 100% không có lỗi hoặc cảnh báo.*

---

## 3. Git & Cam Kết Mã Nguồn
- Không tự ý `git commit` hoặc `git push` tự động trừ khi người dùng yêu cầu rõ ràng.
- Khi hoàn thành tác vụ, báo cáo rõ ràng:
  - Danh sách các file đã sửa.
  - Kết quả chạy kiểm thử, ruff, mypy, lint, typecheck.
  - Trạng thái `git diff --stat`.
