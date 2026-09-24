# FreeRADIUS — dựng từ trạng thái "đã cài nhưng chưa cấu hình"

Ghi lại từ kết quả chẩn đoán thật trên server `aoas` (18/09/2026). Chạy theo đúng thứ tự,
**dừng lại ngay khi một bước không ra kết quả mong đợi** — mỗi bước sau đều dựa vào bước trước.

## Hiện trạng đã xác định

| Kiểm tra | Kết quả | Hệ quả |
|---|---|---|
| `mods-enabled/sql` | không tồn tại | `rlm_sql` chưa bật |
| `mods-available/sql` | `driver = "rlm_sql_null"`, `dialect = "sqlite"` | bản gốc chưa sửa; driver `null` nuốt hết, không ghi gì |
| `sites-enabled/default` | có `-sql` ở 4 chỗ | phần này **đã đúng**, không cần sửa |
| `clients.conf` | chỉ `localhost` + `localhost_ipv6` | mọi gói từ MikroTik bị **bỏ im lặng** |
| `radacct` / `radcheck` / `nas` | 0 / 0 / 0 dòng | chưa từng có phiên hay user nào |

Kết luận: FreeRADIUS lên service từ 11/09 nhưng chưa từng xử lý một yêu cầu thật nào.

---

## 1. Cài driver PostgreSQL

`rlm_sql_postgresql` nằm ở gói riêng, không có sẵn khi cài `freeradius`.

```bash
sudo apt update && sudo apt install -y freeradius-postgresql
ls /usr/lib/freeradius/rlm_sql_postgresql.so     # phải thấy file này
```

## 2. Đặt lại mật khẩu role `radius`

`RADIUS_POSTGRESQL_PROJECT_NOTE.md` ghi nhận lần thử trước lỗi `password authentication failed`.

```bash
sudo -u postgres psql -c "ALTER ROLE radius WITH PASSWORD 'MẬT_KHẨU_MỚI';"
PGPASSWORD='MẬT_KHẨU_MỚI' psql -h 127.0.0.1 -U radius -d radius -c "SELECT 1;"
```

Lệnh thứ hai **phải** trả về `1`. Không qua được thì sửa `pg_hba.conf` (dòng `host ... 127.0.0.1/32 md5`)
rồi `sudo systemctl reload postgresql`, chứ đừng đi tiếp.

## 3. Nạp schema CHÍNH THỨC của FreeRADIUS

> Quan trọng: **đừng** dùng `infra/postgres-aaa-schema.sql` trong repo này. Đó là bản bootstrap rút gọn
> cho local/staging. `queries.conf` của FreeRADIUS truy vấn nhiều cột mà bản rút gọn không có
> (`radpostauth`, các cột phụ của `radacct`...), thiếu là lỗi SQL lúc chạy. Chính README cũ trong thư
> mục này cũng đã cảnh báo phải đối chiếu schema chính thức theo đúng phiên bản gói.

> **Nếu database đã từng được nạp schema trước đây** (dấu hiệu: output có `NOTICE: relation ...
> already exists, skipping` kèm hàng loạt `ERROR: must be owner of table ...`), thì phải xoá sạch
> rồi làm lại. `CREATE TABLE IF NOT EXISTS` sẽ **bỏ qua** bảng cũ, nên bảng giữ nguyên định nghĩa
> cũ thiếu cột, trong khi các `ALTER`/`CREATE INDEX` phía sau lại fail vì sai chủ sở hữu — để lại
> một mớ lai chạy được vài câu rồi chết. Kiểm tra mọi bảng đều 0 dòng, rồi:
>
> ```bash
> sudo -u postgres psql -d radius -c "DROP SCHEMA public CASCADE;"
> sudo -u postgres psql -d radius -c "CREATE SCHEMA public AUTHORIZATION radius;"
> ```
>
> `AUTHORIZATION radius` đặt quyền sở hữu ngay lúc tạo schema, nên bỏ luôn được lệnh
> `GRANT CREATE ON SCHEMA public` ở dưới.

```bash
# PostgreSQL 15+ mac dinh KHONG cho role thuong tao bang trong schema public.
sudo -u postgres psql -d radius -c "GRANT CREATE ON SCHEMA public TO radius;"

# root doc file, psql nap bang chinh role radius.
sudo cat /etc/freeradius/3.0/mods-config/sql/main/postgresql/schema.sql \
  | PGPASSWORD='<mat khau>' psql -h 127.0.0.1 -U radius -d radius

PGPASSWORD='<mat khau>' psql -h 127.0.0.1 -U radius -d radius -c "\dt"
```

Hai chi tiết ở đây đều là kết quả của lỗi thật gặp phải khi chạy:

- **Không dùng `sudo -u postgres psql -f <duong dan>`.** Lệnh đó đọc file với tư cách user
  `postgres`, mà `/etc/freeradius/3.0/` thuộc `freerad` và chặn user khác → `Permission denied`.
  `sudo cat` đọc bằng root rồi đẩy qua ống mới vượt được.
- **Nạp bằng role `radius`, không phải `postgres`.** Role nào tạo bảng thì sở hữu bảng, và chủ sở
  hữu tự động đủ quyền trên cả bảng lẫn sequence. Nạp bằng `postgres` rồi `GRANT` lại vừa thừa vừa
  dễ sót quyền sequence — mà thiếu nó thì `SELECT` chạy được còn `INSERT` vào `radacct` luôn fail.

Cột Owner trong `\dt` phải là `radius`.

## 4. Cấu hình module sql

Sửa `/etc/freeradius/3.0/mods-available/sql`, đổi đúng 6 dòng:

```
dialect = "postgresql"
driver = "rlm_sql_${dialect}"

server = "127.0.0.1"
port = 5432
login = "radius"
password = "MẬT_KHẨU_MỚI"
radius_db = "radius"
```

Bật module và siết quyền (file này giờ chứa mật khẩu DB):

```bash
sudo ln -s ../mods-available/sql /etc/freeradius/3.0/mods-enabled/sql
sudo chgrp freerad /etc/freeradius/3.0/mods-available/sql
sudo chmod 640 /etc/freeradius/3.0/mods-available/sql
```

## 5. Khai báo MikroTik — TRONG DATABASE, không phải file

Nguyên tắc của hệ thống: mọi thứ thuộc RADIUS nằm trong database. NAS và shared secret cũng vậy —
để trong `clients.conf` thì app không quản lý được, và khai hai nơi với hai secret khác nhau là lỗi
cực khó lần ra (biểu hiện "lúc được lúc không").

Bật đọc client từ SQL trong `/etc/freeradius/3.0/mods-available/sql`:

```
	read_clients = yes
	client_table = "nas"
```

Rồi thêm router vào bảng `nas` — sửa đúng dòng `ROUTER_IP`, phần còn lại dán nguyên:

```bash
ROUTER_IP="172.29.1.XX"

PGPASSWORD='<mat khau>' psql -h 127.0.0.1 -U radius -d radius -c \
"INSERT INTO nas (nasname, shortname, type, secret, description)
 VALUES ('$ROUTER_IP', 'hainam89', 'other', '<secret>', 'MikroTik Hai Nam 89');"
```

`nasname` phải bằng đúng `devices.ip_address` trong control DB, và `secret` phải bằng đúng secret của
thiết bị đó trong app cũng như trong `/radius` trên router. **Ba nơi, một giá trị.**

Trong `clients.conf` chỉ giữ `localhost` và `localhost_ipv6` (cần cho `radtest`), không khai thiết bị
thật ở đó.

> **Ràng buộc vận hành quan trọng.** Chú thích trong chính `mods-available/sql` ghi rõ:
> *"Clients will ONLY be read on server startup."* Mỗi lần đổi secret trong bảng `nas`, FreeRADIUS
> **phải restart** mới nhận — `reload` không đủ. Backend chạy trên máy khác nên không tự restart
> được; app phải hiện dòng nhắc "cần restart FreeRADIUS" sau khi lưu, thay vì im lặng để người dùng
> tưởng đã có hiệu lực.
>
> Khác với RADIUS nhúng trước đây, nơi `inventoryCache.invalidate()` làm secret mới dùng được ngay.
> Muốn bỏ ràng buộc này phải chuyển sang `dynamic_clients` — phức tạp hơn nhiều, để sau.

Restart (không phải reload) rồi kiểm tra client đã đọc được từ DB:

```bash
sudo freeradius -XC 2>&1 | tail -3
sudo systemctl restart freeradius
sudo freeradius -XC 2>&1 | grep -i hainam89
```

## 6. Tạo một user thử

```bash
sudo -u postgres psql -d radius -c \
  "INSERT INTO radcheck (username, attribute, op, value) VALUES ('test01', 'Cleartext-Password', ':=', 'test123');"
```

## 7. Kiểm chứng

```bash
sudo freeradius -XC                       # phải kết thúc bằng "Configuration appears to be OK"
sudo systemctl restart freeradius
sudo journalctl -u freeradius -n 30 --no-pager | grep -i sql   # phải thấy rlm_sql kết nối được

radtest test01 test123 127.0.0.1 0 testing123
# -> phải ra "Received Access-Accept"

sudo -u postgres psql -d radius -c "SELECT count(*) FROM radpostauth;"
# -> phải >= 1, chứng tỏ FreeRADIUS ĐANG GHI vào PostgreSQL
```

`testing123` là secret mặc định của client `localhost` trong `clients.conf`.

Sau đó thử đăng nhập hotspot thật từ router, rồi:

```bash
sudo -u postgres psql -d radius -c \
  "SELECT username, nasipaddress, acctstarttime, acctinputoctets, acctoutputoctets FROM radacct ORDER BY radacctid DESC LIMIT 5;"
```

**Có một dòng ở đây là mốc xong việc phía server.**

---

## 8. Bật tích hợp phía backend

Chỉ làm sau khi bước 7 ra dòng thật trong `radacct`. Thêm vào `backend/.env`:

```
RADIUS_MODE=freeradius
DATABASE_AAA_URL=postgres://radius:MAT_KHAU_DA_MA_HOA@10.149.79.186:5432/radius
```

> **Mật khẩu phải được mã hoá URL.** Các ký tự `@ : / ? # [ ] %` là ký tự phân tách trong URL —
> viết thẳng vào là chuỗi kết nối hỏng theo kiểu rất khó đoán. Ví dụ `aoas@2025` phải viết thành
> `aoas%402025`. Riêng biến `PGPASSWORD` ở các bước trên thì giữ nguyên, không mã hoá.

Khởi động lại backend, log phải có:

```
[RadiusServerService] RADIUS_MODE=freeradius — bỏ qua RADIUS server nội bộ...
[FreeradiusSyncService] Đồng bộ radacct → radius_sessions mỗi 15s.
```

Job đồng bộ (`libs/freeradius-sync/`) đọc `radacct` rồi upsert vào `radius_sessions`, nên mọi trang
hiện có (CREW, phiên, quota, biểu đồ) hoạt động nguyên như cũ mà không phải sửa giao diện.

Dòng `radacct` nào có `nasipaddress` không khớp `devices.ip_address` nào sẽ bị bỏ qua kèm cảnh báo
trong log — đó là cách kiểm tra nhanh xem bước 5 khai đúng IP chưa.

---

## Lưu ý về mật khẩu user

MikroTik hotspot mặc định đăng nhập bằng **CHAP**, mà CHAP buộc server phải giữ mật khẩu dạng
**cleartext** (`Cleartext-Password` trong `radcheck`). Muốn lưu dạng băm thì phải ép hotspot dùng
`login-by=http-pap` trong `/ip hotspot profile`.

`subscribers.password_hash` hiện là scrypt — **một chiều, không chuyển sang `radcheck` được**.
Mọi user hiện có sẽ phải được cấp lại mật khẩu khi chuyển sang FreeRADIUS.
