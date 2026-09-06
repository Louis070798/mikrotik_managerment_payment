# Infrastructure inventory — MikroTik Fleet Management

Tài liệu này là inventory triển khai cho hệ thống quản lý tập trung MikroTik. Có hai mức:

- **Local/staging:** chạy được trên một host bằng Docker Compose để kiểm tra wiring và migration.
- **Production:** phải tách node theo failure domain; không coi hai container trên cùng một host là HA.

## 1. Các lớp hệ thống

| Role | Trách nhiệm | Dữ liệu chính | Production tối thiểu | Health/backup |
|---|---|---|---|---|
| API/control plane | REST API, RBAC, inventory, service registry, dashboard query | PostgreSQL control | API-01 + API-02 | `/health/summary`, log, image rollback |
| Worker/scheduler | normalize, rollup, health sweep, backup/restore jobs | Redis/NATS + SQL | worker-01 + worker-02, leader election | queue depth, job heartbeat |
| PostgreSQL control | area/ship/device/interface, registry, audit, alert, config metadata | relational control data | primary + standby/managed HA | WAL/archive, PITR, restore drill |
| PostgreSQL AAA | FreeRADIUS `radcheck`, `radreply`, `radacct`, `radpostauth`, `nas` | auth/accounting | primary + standby/managed HA | replication lag, RPO/RTO, restore drill |
| TimescaleDB analytics | normalized counters, sessions, rollups, reconciliation | aggregate/time-series | primary + standby/read replica | continuous aggregate freshness |
| ClickHouse raw | raw IPFIX/DNS/DHCP/syslog/RADIUS events and drill-down | immutable high-cardinality raw data | replicated storage, separate failure domain | insert lag, disk, part health |
| FreeRADIUS-01/02 | HotSpot auth and accounting | shared AAA database | two independent VMs/hosts | accept/reject/timeout/RTT, failover |
| Collectors | RouterOS counters, RADIUS accounting, IPFIX, DNS/syslog | raw event stream | at least two collector instances | queue, WAL, drop count, last event |
| NATS JetStream | durable telemetry buffer | event subjects | 3 nodes for quorum | stream lag, consumer lag |
| Redis | cache, lock, BullMQ and SSE fan-out | ephemeral/operational state | managed HA or sentinel/cluster | memory, evictions, replication |
| MinIO backup A/B | DB dump, RouterOS export/backup, ClickHouse archive | backup objects | two separate hosts/sites | object count, age, restore test |
| ZeroTier overlay | private control path giữa tàu, collectors, API, RADIUS | network identity only | controller/relay with documented recovery | member online, latency, route health |
| Monitoring/logging | metrics, logs, alert routing | operational telemetry | monitoring node + external alert channel | scrape health, disk, alert delivery |

## 2. Production failure-domain layout

Đề xuất tối thiểu:

| Failure domain A | Failure domain B | Ghi chú |
|---|---|---|
| API-01, worker-01 | API-02, worker-02 | Load balancer hoặc DNS health failover |
| PostgreSQL control primary | PostgreSQL control standby | Không đặt hai node trên cùng hypervisor nếu muốn chống mất host |
| PostgreSQL AAA primary | PostgreSQL AAA standby | FreeRADIUS-01/02 cùng đọc database AAA |
| FreeRADIUS-01 | FreeRADIUS-02 | RouterOS cấu hình primary/secondary qua ZeroTier |
| collector-01 | collector-02 | Collector không được làm mất raw khi backend tạm unavailable |
| MinIO backup A | MinIO backup B | Hai credential/bucket/failure domain độc lập |
| ClickHouse replica A | ClickHouse replica B | Raw source of truth, không thay bằng aggregate |

NATS JetStream cần quorum lẻ, nên production nên dùng 3 node (A, B và một node witness/third site) thay vì chỉ 2 node.

## 3. Network/port matrix

Các port dưới đây là port logic; địa chỉ thật phải đi qua service registry hoặc ZeroTier DNS/IP, không hard-code vào frontend/backend.

| Luồng | Port/protocol | Chỉ mở cho |
|---|---|---|
| Frontend → API | TCP 443 | user/admin network |
| API/worker → PostgreSQL | TCP 5432 | API/worker/backup runner |
| API/worker → Redis | TCP 6379 | internal overlay |
| API/worker/collector → NATS | TCP 4222 | internal overlay |
| API/worker → ClickHouse | TCP 8123/9000 | internal overlay |
| API/worker → MinIO | TCP 9000/9001 | backup/restore jobs |
| MikroTik → RADIUS auth/accounting | UDP 1812/1813 | ZeroTier ship members |
| MikroTik → RADIUS RadSec (tùy chọn) | TCP 2083 | ZeroTier + certificate policy |
| MikroTik → RouterOS REST | TCP 443/8729 tùy cấu hình | controller qua ZeroTier |
| MikroTik → SNMPv3 collector | UDP 161/162 | collector qua ZeroTier |
| MikroTik → IPFIX collector | UDP 4739 hoặc port đã đăng ký | collector qua ZeroTier |

Firewall mặc định deny; chỉ allow theo source service, không mở database/RADIUS management ra Internet.

## 4. Local/staging profile

`infra/docker-compose.core.yml` cung cấp PostgreSQL control, PostgreSQL AAA, TimescaleDB, ClickHouse, Redis, NATS và hai MinIO target trên một host. Profile này dùng để kiểm tra migration và wiring, **không đạt HA** vì mọi container dùng chung một host.

FreeRADIUS được giữ thành skeleton riêng trong `infra/freeradius/`; trước khi bật phải thay template bằng cấu hình thật, tạo secret per-NAS và kiểm tra `freeradius -XC`.

## 5. Sizing khởi điểm

Sizing cuối phải dựa trên số tàu, số user, tốc độ flow và retention. Có thể dùng baseline sau để lập kế hoạch, không dùng làm cam kết capacity:

| Role | vCPU | RAM | Disk |
|---|---:|---:|---:|
| API/worker | 4 | 8–16 GB | 80 GB OS + log |
| PostgreSQL control/AAA | 4–8 | 16–32 GB | SSD + WAL/archive |
| TimescaleDB | 8 | 32 GB | SSD theo retention |
| ClickHouse raw | 8–16 | 32–64 GB | NVMe theo raw retention |
| FreeRADIUS | 2 | 4 GB | 40 GB |
| Collector | 2–4 | 4–8 GB | OS + WAL buffer |
| NATS/Redis | 2–4 | 8 GB | SSD cho persistence |
| MinIO backup | 4 | 16 GB | dung lượng >= 2 lần backup window |

## 6. Quy tắc dữ liệu và bảo mật

- PostgreSQL AAA là nguồn sự thật cho auth/accounting; User Manager chỉ là adapter tùy chọn.
- HotSpot nên dùng HTTPS + `http-pap` để password có thể lưu dạng hash; không dùng plaintext trong git.
- Shared secret RADIUS là per-NAS, lấy từ secret store, không trả về API/frontend.
- Raw telemetry immutable; normalization/rollup có `parser_version` và có thể retry.
- Backup A và B phải kiểm tra restore định kỳ; backup tồn tại nhưng chưa restore test thì chưa được coi là usable.
- Địa chỉ runtime của RADIUS/database/collector/storage lấy từ `service_endpoints`.
- ZeroTier chỉ cung cấp overlay connectivity; không lưu credential hoặc business identity trong network config.
