# KAIS STUDIO - MultiPost Studio Pro
Create. Connect. Publish. / Sáng tạo không giới hạn.

Soạn, lưu, lên lịch và quản lý nội dung cho nhiều mạng xã hội. Mở website là vào thẳng Dashboard: không có đăng ký, đăng nhập hay chuyển hướng nào.

## Chạy
Cần Node.js 22.5 trở lên (dùng SQLite tích hợp sẵn, không cần cài thư viện).

    cp .env.example .env     # điền khóa API nếu có
    npm start                # mở http://localhost:3000
    npm test                 # chạy bài kiểm thử API

## Cấu trúc
- `server.js`: HTTP server, API, hàng đợi lên lịch, giới hạn tần suất, kiểm tra đầu vào, upload.
- `adapters/index.js`: mỗi nền tảng một adapter (YouTube, TikTok, Facebook).
- `migrations/001_init.sql`: schema SQLite (posts, media, activity).
- `public/`: giao diện (index.html, style.css, app.js) và logo SVG, favicon.
- `brand.config.json`: tên, khẩu hiệu, màu, chân trang. Đổi một nơi, áp dụng toàn bộ.
- `test/api.test.js`: kiểm thử tự động.

## Đã làm
Dashboard với số liệu thật từ CSDL, biểu đồ theo ngày, soạn bài (tiêu đề, nội dung, mô tả, hashtag, liên kết, ghi chú, nền tảng, media, thời gian đăng), đếm ký tự theo nền tảng, xem trước mô phỏng, lưu nháp, sửa, nhân bản, xóa, lọc và tìm kiếm, lịch đăng dạng danh sách theo ngày, hàng đợi trạng thái (Draft, Scheduled, Processing, Published, Failed, Cancelled), thư viện media (tải lên, xem trước, tìm, lọc, xóa), nhật ký hoạt động, chế độ sáng và tối, xuất dữ liệu JSON, xóa dữ liệu có xác nhận.

## Chưa hỗ trợ (cần làm tiếp)
- **Chưa kiểm chứng với tài khoản thật.** Adapter Ayrshare đã có test với phản hồi giả lập, nhưng chưa gọi thử tới Ayrshare thật. Bài đăng chỉ chuyển Published khi Ayrshare trả success cho đúng nền tảng. Chưa lưu link bài đã đăng, và khi đăng nhiều nền tảng chưa có bảng theo dõi từng đích để thử lại an toàn.
- Lịch dạng lưới ngày, tuần, tháng (hiện là danh sách theo ngày), phiên bản nội dung riêng cho từng nền tảng, ảnh bìa riêng, thay thế tệp media, khôi phục dữ liệu, đa ngôn ngữ (chỉ tiếng Việt), chọn màu nhấn, trang lịch sử hoạt động đầy đủ (API `/api/activity` đã có), lịch sử thay đổi bài viết, icon PNG cho ứng dụng.

## Bảo mật khi không có đăng nhập
Không đăng nhập nghĩa là **bất kỳ ai truy cập được địa chỉ web đều xem và sửa được toàn bộ dữ liệu** (một không gian làm việc dùng chung). Chỉ nên chạy trong mạng nội bộ hoặc VPN, hoặc đặt sau lớp bảo vệ của hạ tầng (Cloudflare Access, danh sách IP cho phép, Basic Auth ở reverse proxy).
Ứng dụng đã có: giới hạn tần suất theo IP, kiểm tra và cắt độ dài đầu vào, giới hạn dung lượng upload (`MAX_UPLOAD_MB`), kiểm tra chữ ký tệp (không phải quét mã độc), yêu cầu tiêu đề `X-Requested-With` chống gọi chéo trang, CSP, không ghi secret vào log, khóa API chỉ nằm ở máy chủ.
Chưa có: giới hạn theo người dùng, quét mã độc tệp tải lên.

## Triển khai
Cần máy chủ Node chạy liên tục và ổ đĩa lưu lâu dài cho `DATA_DIR` (VPS, hoặc dịch vụ có persistent disk). Môi trường serverless không phù hợp vì cần tiến trình nền cho hàng đợi. Nên đặt sau HTTPS. Sao lưu bằng cách sao chép thư mục `DATA_DIR`.

## Đăng thật qua Ayrshare
1. Đăng ký Ayrshare, lấy API key (kiểm tra gói và giá trên trang của họ).
2. Trên dashboard Ayrshare, liên kết Facebook Page, YouTube, TikTok. App này không nhận mật khẩu hay token mạng xã hội.
3. Triển khai web ở tên miền HTTPS công khai, đặt `AYRSHARE_API_KEY` và `PUBLIC_BASE_URL` trong `.env`, khởi động lại.
4. Trang Nền tảng, bấm "Kiểm tra cấu hình" để xác minh liên kết.
5. Tạo bài, chọn nền tảng, lên lịch. TikTok và YouTube bắt buộc có video. Media phải tải được từ `PUBLIC_BASE_URL/media/...`.
Nếu bài báo Failed với lời nhắc "chưa được xác nhận", hãy kiểm tra lịch sử Ayrshare trước khi đăng lại để tránh trùng bài.
