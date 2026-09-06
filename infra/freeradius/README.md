# FreeRADIUS 3.x skeleton

Đây là skeleton cấu hình cho FreeRADIUS-01 và FreeRADIUS-02. Chưa đánh dấu READY vì chưa có hostname/IP ZeroTier, certificate, per-NAS secret và phiên bản FreeRADIUS được chốt trên server thật.

## Mô hình

- FreeRADIUS-01 và FreeRADIUS-02 chạy độc lập trên hai VM/host.
- Hai node cùng đọc database AAA PostgreSQL; không đồng bộ `radacct` bằng cách merge hai database riêng.
- RouterOS cấu hình primary/secondary RADIUS qua ZeroTier.
- Shared secret là per-NAS/per-ship, tối thiểu 32 ký tự ngẫu nhiên, lưu trong secret manager.
- HotSpot dùng HTTPS và `http-pap` để password có thể so sánh với hash trong `radcheck`; không commit password plaintext.
- Accounting phải bật Start/Interim/Stop. `acctinputgigawords` và `acctoutputgigawords` phải được cộng vào byte 64-bit ở parser.

## Files cần triển khai trên server

```text
/etc/freeradius/3.0/
├── clients.conf                    # sinh từ inventory, secret ngoài git
├── mods-enabled/sql                # rlm_sql_postgresql
├── mods-config/sql/main/postgresql/queries.conf
├── sites-enabled/default           # auth + accounting
├── sites-enabled/inner-tunnel      # chỉ bật khi dùng EAP/802.1X
└── dictionary.mikrotik              # nếu dùng thuộc tính MikroTik bổ sung
```

`infra/postgres-aaa-schema.sql` là bootstrap local/staging. Production phải đối chiếu schema chính thức của đúng FreeRADIUS package version trước khi migrate.

## Quy trình triển khai

1. Tạo database AAA và role chỉ có quyền cần thiết.
2. Áp dụng schema và kiểm tra index `radacct`.
3. Cấu hình `mods-enabled/sql` trỏ tới service registry/secret manager; không ghi password vào git.
4. Khai báo từng MikroTik/NAS trong `nas` và `clients.conf` với secret riêng.
5. Chạy `freeradius -XC` trên cả hai node.
6. Dùng `radtest` kiểm tra Access-Accept/Reject.
7. Dùng một HotSpot test user kiểm tra Accounting-Start, Interim và Stop trong `radacct`.
8. Tắt RADIUS-01, xác nhận RouterOS chuyển sang RADIUS-02 và accounting không mất bản ghi.
9. Kiểm tra `/health/ha`, `/ships/{shipId}/crew/radius-health` và backup/restore.

## Không làm

- Không dùng một shared secret cho cả fleet.
- Không mở UDP 1812/1813 ra Internet.
- Không coi hai container cùng host là RADIUS HA.
- Không đánh dấu accounting healthy chỉ vì auth thành công.
- Không xóa `radacct` để xử lý lỗi đối soát; dùng raw event/reprocess.
