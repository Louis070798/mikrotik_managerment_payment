# Triển khai dashboard ZeroTier bằng Docker

Dashboard dùng trang `VPN ZeroTier` của frontend hiện tại và gọi backend qua `/api/v1/zerotier/*`.
Backend tiếp tục giữ token controller ở phía server; token không được nhúng vào image hoặc trình duyệt.

## Yêu cầu

- Docker Engine có Compose v2.
- Backend của dự án đang lắng nghe trên cổng `3000` của host (hoặc đặt `API_UPSTREAM`).
- Backend đã đăng ký endpoint `zerotier.controller` và đã cấu hình `ZEROTIER_CONTROLLER_TOKEN`.

## Chạy

Từ thư mục gốc repository:

```powershell
docker compose -f infra/docker-compose.zerotier-dashboard.yml up -d --build
```

Mở `http://<server-ip>:4000/app/`, đăng nhập, rồi chọn **VPN ZeroTier**. URL trực tiếp sau khi đăng nhập là `http://<server-ip>:4000/app/vpn`.

Nếu backend ở máy/URL khác:

```powershell
$env:API_UPSTREAM='http://backend.internal:3000'
docker compose -f infra/docker-compose.zerotier-dashboard.yml up -d --build
```

## Kiểm tra

```powershell
docker compose -f infra/docker-compose.zerotier-dashboard.yml ps
curl.exe http://localhost:4000/healthz
curl.exe http://localhost:4000/app/
```

Dashboard hỗ trợ tạo/sửa/xóa network, cấu hình IPv4 pool/managed route/DNS, cấp hoặc thu hồi quyền member, đặt IP/nhãn và xóa member. Các thao tác xóa có bước xác nhận lần hai trong UI.

