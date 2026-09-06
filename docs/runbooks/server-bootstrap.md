# Server bootstrap runbook

## 0. Điều kiện đầu vào

Trước khi triển khai production cần chốt và ghi trong inventory riêng:

- OS/version và hostname của từng VM;
- ZeroTier network ID, managed routes và node members;
- DNS/TLS domain cho API, RADIUS/RadSec và MinIO;
- hai failure domain cho database/RADIUS/backup;
- retention raw/aggregate và RPO/RTO;
- secret manager và người có quyền rotate secret;
- firewall rules giữa ship, collector, API, database và backup.

Không dùng địa chỉ ví dụ trong tài liệu này làm địa chỉ production.

## 1. Local/staging bằng Docker Compose

Từ repository root:

```powershell
Copy-Item infra/.env.core.example infra/.env.core
# chỉnh các giá trị DEV_ONLY trong infra/.env.core
docker compose --env-file infra/.env.core -f infra/docker-compose.core.yml config
docker compose --env-file infra/.env.core -f infra/docker-compose.core.yml up -d
docker compose --env-file infra/.env.core -f infra/docker-compose.core.yml ps
```

Không dùng `down -v` trong môi trường có dữ liệu. Volume PostgreSQL/ClickHouse/NATS/MinIO phải được backup trước mọi thao tác phá hủy.

## 2. Database migration

Control database:

```powershell
$env:DATABASE_CONTROL_URL = "postgres://fleet_app:<password>@127.0.0.1:54332/fleet_control"
Push-Location backend
npm run migrate
npm run seed:test
Pop-Location
```

AAA database:

- schema local/staging được init từ `infra/postgres-aaa-schema.sql` khi volume còn mới;
- production phải dùng migration có version, backup/PITR và approval;
- không chỉnh trực tiếp bảng `radacct` để sửa số liệu dashboard.

## 3. FreeRADIUS

- cài cùng major/minor version trên cả hai node;
- áp dụng `infra/freeradius/` template và thay mọi placeholder;
- dùng PostgreSQL AAA chung, credential từ secret manager;
- chạy `freeradius -XC`;
- test auth và accounting Start/Interim/Stop;
- kiểm tra failover bằng cách cô lập từng node.

## 4. Register service endpoints

Sau khi service sống, đăng ký endpoint qua service registry của backend:

- `radius.auth` và `radius.accounting` tối thiểu hai endpoint;
- `database.control`, `database.aaa`, `database.analytics`, `database.raw`;
- `collector.interface`, `collector.radius`, `collector.ipfix`;
- `storage.backup.a`, `storage.backup.b`;
- `zerotier.controller`.

Địa chỉ runtime không được ghi vào frontend hoặc source code. Mỗi endpoint phải có health check, priority, scope và secret reference.

## 5. ZeroTier và MikroTik

1. Cài ZeroTier trên server/collector và join network.
2. Authorize member theo inventory; không bật auto-authorize cho production.
3. Tạo route/ACL chỉ cho API, RADIUS, collector và quản trị cần thiết.
4. Trên MikroTik, cấu hình RADIUS primary/secondary qua overlay.
5. Bật HotSpot HTTPS + `http-pap`, accounting Start/Interim/Stop.
6. Gửi interface counters bằng IF-MIB HC counters hoặc RouterOS API adapter; không dùng counter 32-bit ở tốc độ cao.
7. Gửi IPFIX/flow về collector đã đăng ký; kiểm tra sampling rate và timestamp.

## 6. Health, backup và nghiệm thu

- `/health/summary`: service/endpoint health;
- `/health/ha`: min-2 RADIUS, min-2 database, collector, raw storage, backup A/B;
- `/telemetry/health`: event count và freshness theo source;
- backup database control/AAA/analytics, RouterOS `.backup`/`.rsc`, raw archive;
- restore test độc lập cho backup A và B;
- test mất RADIUS-01, database primary, collector và ZeroTier member;
- chỉ chuyển sang production khi có bằng chứng log/metric và biên bản nghiệm thu.
