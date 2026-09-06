# Ghi chú dự án: FreeRADIUS + PostgreSQL cho MikroTik

Ngày cập nhật: 2026-08-31

## Mục tiêu

Xây dựng hệ thống xác thực tập trung cho nhiều user MikroTik bằng FreeRADIUS và PostgreSQL. User và chính sách truy cập được quản lý trong database thay vì viết thủ công trong file `authorize`.

## Kiến trúc dự kiến

```text
MikroTik/HotSpot/PPP
        |
        | UDP 1812: Authentication
        | UDP 1813: Accounting
        v
FreeRADIUS-01 / FreeRADIUS-02
        |
        v
PostgreSQL AAA database
```

- Hai node FreeRADIUS dùng chung database PostgreSQL AAA.
- RouterOS dùng RADIUS primary/secondary qua mạng riêng hoặc ZeroTier.
- Mỗi MikroTik/NAS phải có IP nhận diện và shared secret riêng.
- Không mở UDP 1812/1813 trực tiếp ra Internet.

## Trạng thái hiện tại

- Đã tạo database PostgreSQL tên `radius`.
- Đã tạo role PostgreSQL tên `radius`.
- Đã nạp schema FreeRADIUS thành công.
- Đã cấp quyền cho role `radius` trên schema, tables và sequences.
- Lần kiểm tra TCP bằng user `radius` bị lỗi `password authentication failed`; cần đặt lại mật khẩu role và dùng cùng mật khẩu trong cấu hình FreeRADIUS.
- Đã thêm khung khai báo cho MikroTik server đầu tiên (`site_01`) trong phần "Khai báo MikroTik"; còn thiếu IP thật, secret thật và chưa chạy lệnh tạo trên RouterOS.
- Không lưu mật khẩu thật trong file này.

## Thông tin PostgreSQL

```text
Database: radius
Role: radius
Host: 127.0.0.1 hoặc localhost
Port: 5432
Password: lưu trong secret manager, không commit vào Git
```

Đặt lại mật khẩu khi cần:

```bash
sudo -u postgres psql -c "ALTER ROLE radius WITH LOGIN PASSWORD 'MAT_KHAU_DB_MOI';"
```

Kiểm tra kết nối:

```bash
psql -h 127.0.0.1 -U radius -d radius -W -c '\dt'
```

Nếu cần nạp lại schema khi file bị giới hạn quyền đọc:

```bash
sudo cat /etc/freeradius/3.0/mods-config/sql/main/postgresql/schema.sql \
| sudo -u postgres psql -d radius
```

## Các bảng chính

- `radcheck`: mật khẩu và thuộc tính kiểm tra riêng của user.
- `radreply`: thuộc tính trả về riêng cho user.
- `radusergroup`: ánh xạ user vào group/gói dịch vụ.
- `radgroupcheck`: điều kiện áp dụng cho group.
- `radgroupreply`: tốc độ, thời gian, VLAN, giới hạn phiên của group.
- `radacct`: accounting Start/Interim/Stop.
- `radpostauth`: lịch sử xác thực.

## Mô hình quản lý nhiều user

Chính sách nên tạo một lần trong group, sau đó chỉ gán user vào group.

Ví dụ group gói 10 Mbps:

```sql
INSERT INTO radgroupreply (groupname, attribute, op, value)
VALUES
('goi_10m', 'Mikrotik-Rate-Limit', ':=', '10M/10M'),
('goi_10m', 'Session-Timeout', ':=', '86400');
```

Thêm user và gán group:

```sql
INSERT INTO radcheck (username, attribute, op, value)
VALUES ('user001', 'Cleartext-Password', ':=', 'MAT_KHAU_USER');

INSERT INTO radusergroup (username, groupname, priority)
VALUES ('user001', 'goi_10m', 1);
```

Trong production, không ghi mật khẩu thật vào tài liệu, source code hoặc Git. Cần chốt phương thức xác thực phù hợp với HotSpot/PPP và chính sách bảo mật của hệ thống.

## Cấu hình FreeRADIUS cần kiểm tra

File SQL:

```text
/etc/freeradius/3.0/mods-available/sql
```

Các giá trị cần khớp PostgreSQL:

```conf
dialect = "postgresql"
server = "localhost"
port = 5432
login = "radius"
password = "MAT_KHAU_DB"
radius_db = "radius"
```

Bật module SQL:

```bash
sudo ln -s ../mods-available/sql /etc/freeradius/3.0/mods-enabled/sql
```

Trong file `/etc/freeradius/3.0/sites-enabled/default`, bật `sql` trong phần `authorize`. Nếu cần ghi accounting, bật `sql` trong phần `accounting`.

Kiểm tra và khởi động lại:

```bash
sudo freeradius -XC
sudo systemctl restart freeradius
```

## Khai báo MikroTik

Khai báo từng NAS trong:

```text
/etc/freeradius/3.0/clients.conf
```

### Server #1 (điền để tạo MikroTik đầu tiên)

| Trường | Giá trị |
|---|---|
| shortname | `site_01` |
| IP MikroTik (nội bộ/ZeroTier) | `ĐIỀN_IP_MIKROTIK_01` |
| Shared secret | `ĐIỀN_SECRET_RIENG_SITE_01` (lấy từ secret manager, tối thiểu 32 ký tự ngẫu nhiên) |
| nastype | `mikrotik` |
| Trạng thái | Chưa tạo — cần điền IP/secret rồi chạy lệnh bên dưới |

Thêm vào `clients.conf`:

```conf
client mikrotik_site_01 {
    ipaddr = ĐIỀN_IP_MIKROTIK_01
    secret = ĐIỀN_SECRET_RIENG_SITE_01
    shortname = site_01
    nastype = mikrotik
}
```

Chạy trên RouterOS của server này (thay `ĐIỀN_IP_FREERADIUS` và secret giống hệt secret ở trên):

```routeros
/radius add address=ĐIỀN_IP_FREERADIUS secret=ĐIỀN_SECRET_RIENG_SITE_01 service=ppp,hotspot,login
/ppp aaa set use-radius=yes accounting=yes interim-update=5m
```

Sau khi tạo xong `site_01`, copy khối trên để khai báo `site_02`, `site_03`... mỗi MikroTik một secret riêng, không dùng chung.

## Quy trình kiểm thử

1. Kiểm tra PostgreSQL bằng `psql` với role `radius`.
2. Chạy `sudo freeradius -XC` để kiểm tra cấu hình.
3. Dùng `radtest` kiểm tra `Access-Accept`/`Access-Reject`.
4. Kiểm tra user HotSpot/PPP thực tế trên MikroTik.
5. Kiểm tra bản ghi `radacct` cho Accounting-Start, Interim và Stop.
6. Kiểm tra chuyển đổi sang FreeRADIUS-02 khi FreeRADIUS-01 dừng.

## Việc cần làm tiếp theo

- [ ] Đặt và lưu mật khẩu PostgreSQL trong secret manager.
- [ ] Kiểm tra đăng nhập PostgreSQL bằng role `radius`.
- [ ] Hoàn thiện `mods-enabled/sql` và `sites-enabled/default`.
- [ ] Tạo group gói dịch vụ và user thử nghiệm.
- [ ] Điền IP và secret thật cho `mikrotik_site_01`, chạy `/radius add` trên RouterOS.
- [ ] Khai báo per-NAS client/secret từ inventory (site_02, site_03, ...).
- [ ] Cấu hình primary/secondary RADIUS trên RouterOS.
- [ ] Kiểm thử đầy đủ authentication và accounting.
- [ ] Thiết lập backup/restore PostgreSQL.

## Tài liệu liên quan trong repository

- `infra/freeradius/README.md`
- `infra/postgres-aaa-schema.sql`
- `docs/INFRASTRUCTURE_INVENTORY.md`
