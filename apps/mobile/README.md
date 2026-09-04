# Ứng dụng Di động — Tài Chính Cá Nhân (Personal Finance Mobile)

Ứng dụng React Native (Expo) dành cho Android (và iOS) kết nối trực tiếp với backend `apps/api`.

---

## 🚀 Hướng dẫn khởi chạy

### 1. Chuẩn bị Backend
Trước khi mở Mobile App, hãy đảm bảo Backend FastAPI đang chạy trên máy tính:
```bash
cd apps/api
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```
*(Cờ `--host 0.0.0.0` cho phép các thiết bị trong mạng WiFi nội bộ kết nối vào API)*

---

### 2. Khởi chạy Ứng dụng Mobile

Từ thư mục gốc dự án:
```bash
cd apps/mobile
npm start
```

### 3. Xem và trải nghiệm trên điện thoại Android

1. **Cách 1: Điện thoại thật (Dễ nhất):**
   - Cài ứng dụng **Expo Go** từ Google Play Store trên điện thoại Android.
   - Kết nối điện thoại chung mạng WiFi với máy tính.
   - Quét mã QR hiện trên terminal để mở app.
   - Vào tab **Cài đặt** trên app -> Nhập IP máy tính (VD: `http://192.168.1.15:8000`) -> Bấm **Kiểm tra** & **Lưu**.

2. **Cách 2: Máy ảo Android Emulator:**
   - Chạy lệnh: `npm run android`
   - App mặc định cấu hình kết nối tới `http://10.0.2.2:8000` (địa chỉ máy tính từ góc nhìn máy ảo Android).

---

## 🛠️ Cấu trúc thư mục

```
apps/mobile/
├── src/
│   ├── api/             # Client API kết nối với FastAPI backend & quản lý IP server
│   ├── components/      # UI components (Header, Card, AccountCard, TransactionItem, QuickAddModal)
│   ├── navigation/      # Bottom Tabs (Tổng quan, Sổ cái, Tài sản, Cài đặt)
│   ├── screens/         # Dashboard, Ledger, Assets (Vàng/Tiết kiệm/Crypto), Settings
│   ├── theme/           # Bảng màu Dark Luxury (Emerald, Slate, Rose, Gold, Crypto)
│   ├── types/           # Type definitions TypeScript đồng bộ với Backend & Web
│   └── utils/           # Format tiền tệ VND, định dạng ngày tháng
├── App.tsx              # Root component với NavigationContainer & QueryClient
└── app.json             # Cấu hình Android package & Expo metadata
```
