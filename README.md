# Studocu Download

Tiện ích mở rộng (Chrome Extension Manifest V3) hỗ trợ đọc tài liệu, gỡ mờ (unblur) và xuất tài liệu Studocu sang định dạng PDF A4 chất lượng cao.

---

## Tính năng chính

- **Quét & Xuất PDF A4:** Tự động cuộn nạp toàn bộ trang và render công thức toán học/hình ảnh chuẩn khổ dọc A4.
- **Gỡ Mờ & Khóa:** Tự động bypass các lớp phủ mờ (blur filter), watermark và banner che tài liệu.
- **Làm Mới Phiên:** Xóa cookie và làm mới trang để khôi phục phiên đọc khi bị giới hạn.
- **Watermark ngầm:** Tự động chèn watermark `@vny` tinh gọn ở góc trái cuối mỗi trang tài liệu PDF xuất ra.

---

## Cài đặt

1. Tải về file nén `.zip` ở mục **[Releases](../../releases)** mới nhất và giải nén.
2. Mở trình duyệt và truy cập trang quản lý tiện ích tương ứng:

   | Trình duyệt | Đường dẫn trang tiện ích |
   |---|---|
   | **Google Chrome** | `chrome://extensions` |
   | **Microsoft Edge** | `edge://extensions` |
   | **Brave** | `brave://extensions` |
   | **Opera** | `opera://extensions` |
   | **Cốc Cốc** | `coccoc://extensions` |
3. Bật công tắc **Chế độ dành cho nhà phát triển (Developer mode)** ở góc trên bên phải.
4. Nhấn nút **Tải tiện ích đã giải nén (Load unpacked)** ở góc trên bên trái.
5. Chọn thư mục tiện ích vừa giải nén.

---

## Hướng dẫn sử dụng

1. Truy cập vào trang tài liệu bất kỳ trên `studocu.com` hoặc `studocu.vn`.
2. Nhấn vào biểu tượng tiện ích **Studocu Download** trên thanh công cụ trình duyệt.
3. Chọn các chức năng tùy theo nhu cầu:
   - **Quét & Xuất PDF:** Tiện ích sẽ tự động cuộn nạp tài liệu và tải file PDF về máy.
   - **Gỡ Mờ:** Xóa lớp mờ trên trang hiện tại.
   - **Làm Mới:** Dọn dẹp cookie và F5 lại trang.

---

## Cấu trúc thư mục

```text
├── background.js
├── content.css
├── content.js
├── manifest.json
├── popup.css
├── popup.html
├── popup.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── libs/
    ├── html2canvas.min.js
    └── jspdf.umd.min.js
```

---

## ⚠️ Lưu ý (Disclaimer)

Công cụ này được tạo ra với mục đích hỗ trợ học tập và nghiên cứu cá nhân. Vui lòng sử dụng có trách nhiệm và tôn trọng bản quyền của tài liệu gốc.
