# Runbook — Chạy integration test local với PostgreSQL thật

Mục tiêu: chạy **toàn bộ** unit + integration + contract test của `backend/` trên một
PostgreSQL **thật**, không mock, không sqlite, không dữ liệu giả.

Test integration trong repo này cố tình **không** giả lập database: chúng dựng Nest app thật,
gọi HTTP qua `app.inject()`, ghi/đọc trực tiếp trên Postgres và assert ở mức bảng. Vì vậy
**không có Postgres thì không có kết quả integration test** — và không được coi là PASS.

---

## 0. Yêu cầu

| Thành phần | Phiên bản | Bắt buộc |
|---|---|---|
| Node.js | ≥ 20 (repo đang chạy 22.x) | có |
| PostgreSQL | 16.x | có (qua Docker hoặc cài trực tiếp) |
| Docker + Docker Compose v2 | bất kỳ bản còn hỗ trợ | không, nếu đã có Postgres 16 khác |

Kiểm tra trước:

```bash
docker --version
docker compose version
node --version
```

Nếu `docker` báo `command not found` → nhảy sang [Phụ lục A](#phụ-lục-a--không-có-docker).

---

## 1. Khởi động PostgreSQL test

```bash
# từ thư mục gốc repo
docker compose -f infra/docker-compose.test.yml up -d
```

Compose dựng `postgres:16-alpine`, map ra **`127.0.0.1:54329`** (không phải 5432, để không
đụng Postgres sẵn có trên máy). Đổi được bằng biến `POSTGRES_PORT`.

Chờ tới khi container **healthy** (healthcheck `pg_isready` đã có sẵn trong compose):

```bash
docker compose -f infra/docker-compose.test.yml ps
# đợi cột STATUS hiện "(healthy)"
```

Chờ tự động thay vì nhìn bằng mắt:

```bash
until [ "$(docker inspect -f '{{.State.Health.Status}}' $(docker compose -f infra/docker-compose.test.yml ps -q postgres-test))" = "healthy" ]; do sleep 2; done
```

> **Đừng chạy migrate khi container mới `Up` mà chưa `healthy`.** Postgres trong
> `postgres:16-alpine` khởi động hai lần (lần đầu chỉ để initdb, chỉ nghe socket nội bộ);
> kết nối vào giữa hai lần đó sẽ lỗi `the database system is starting up`.

---

## 2. Tạo `backend/.env.test`

```bash
cp backend/.env.test.example backend/.env.test    # bash / PowerShell 7+
# Windows PowerShell 5:
# Copy-Item backend\.env.test.example backend\.env.test
```

Giá trị mặc định đã khớp `infra/docker-compose.test.yml`:

```
DATABASE_CONTROL_URL=postgres://fleet_app:fleet_dev_local_only@127.0.0.1:54329/fleet_control_test
```

Đây là **credential test local-only**, không dùng ở bất kỳ môi trường nào khác.

> **Bẫy trên Windows:** đừng tạo `.env.test` bằng `>` hay `Set-Content` của PowerShell 5 —
> chúng ghi file **UTF-16LE có BOM**, mọi biến sẽ biến mất một cách im lặng và bạn nhận được
> `DATABASE_CONTROL_URL is required` dù file rõ ràng có dòng đó. `scripts/load-env.ts` đã
> nhận diện và decode được BOM UTF-16/UTF-8, nhưng `Copy-Item` vẫn là cách an toàn nhất.

---

## 3. Migrate + seed

```bash
cd backend
npm install          # lần đầu

npm run migrate:test # áp dụng migrations/control/0001..0005 vào DB test
npm run seed:test    # inventory anchor tối thiểu (TEST-ORG/TEST-AREA/TEST-SHIP/TEST-EDGE)
```

Cách chọn file env (`scripts/load-env.ts`), theo thứ tự ưu tiên:

```
--env=<file>  >  $ENV_FILE  >  .env.<NODE_ENV>  >  .env
```

Biến đã có trong shell **luôn thắng** file — tiện cho CI:

```bash
DATABASE_CONTROL_URL=postgres://... npm run migrate
```

`npm run migrate` (không hậu tố `:test`) đọc `.env` và nhắm vào **DB dev**. Muốn chắc chắn
không chạm nhầm DB dev thì luôn dùng `migrate:test` / `seed:test`.

Cả hai script đều **idempotent**:

- `migrate` ghi tên file đã áp dụng vào `schema_migrations`, chạy lại chỉ in `skip (already applied)`.
- `seed:test` dùng `ON CONFLICT ... DO UPDATE` trên `code`, chạy lại **không** nhân đôi hàng và
  **không** xoá gì. Kiểm nhanh:

```bash
npm run seed:test && npm run seed:test
psql "$DATABASE_CONTROL_URL" -tAc "select count(*) from organizations where code='TEST-ORG'"   # phải là 1
```

---

## 4. Chạy test

```bash
cd backend
npm test                                   # toàn bộ: unit + integration + contract
npx jest --runInBand test/contract         # chỉ contract test OpenAPI
npx jest --runInBand test/integration      # chỉ integration test
```

Jest chạy `--runInBand` (tuần tự) vì các integration test dùng chung một database và
`TRUNCATE` giữa các file — chạy song song sẽ xoá dữ liệu của nhau.

`test/jest.setup.ts` tự nạp `backend/.env.test`, nên không cần export biến trước khi chạy.

### Test có gì

| File | Kiểm cái gì |
|---|---|
| `test/integration/inventory.spec.ts` | CRUD Area/Ship/Device, phân quyền, envelope chuẩn |
| `test/integration/interfaces.spec.ts` | Gán zone WAN/CREW/BUSINESS/MANAGEMENT, chặn double-count |
| `test/integration/service-endpoints.spec.ts` | Registry, hot-reload, health check SQL_RW thật, circuit breaker |
| `test/integration/health-checkers.spec.ts` | RADIUS/Collector/Backup checker với server giao thức thật (cổng ephemeral) |
| `test/integration/telemetry-normalize-crew-business.spec.ts` | Pipeline ingest → normalize → CREW/BUSINESS/reconciliation |
| `test/integration/telemetry-invariants.spec.ts` | Idempotency 3 nguồn, NULL không thành 0, UNKNOWN classification, số học reconciliation |
| `test/integration/collector-round-trip.spec.ts` | Output adapter collector đi hết đường ingest → normalize |
| `test/contract/openapi-contract.spec.ts`, `openapi-contract-v14.spec.ts` | Response thật khớp `contracts/openapi.yaml` |

---

## 5. Kiểm tra trước khi commit

```bash
cd backend
npm run build          # nest build
npx tsc --noEmit       # type-check cả src/, scripts/, test/
npx drizzle-kit check  # phát hiện migration trùng/đụng nhau
npm test
```

---

## 6. Dọn dẹp

```bash
docker compose -f infra/docker-compose.test.yml down          # giữ dữ liệu
docker compose -f infra/docker-compose.test.yml down -v       # xoá luôn volume, migrate lại từ đầu
```

Volume `fleet_control_test_data` là **named volume**, dữ liệu sống qua các lần `down`. Muốn
kiểm tra migration chạy sạch từ database trống thì bắt buộc dùng `down -v`.

---

## Phụ lục A — Không có Docker

Test integration vẫn chạy được với **bất kỳ PostgreSQL 16 nào**, chỉ cần `DATABASE_CONTROL_URL`
trỏ đúng. Không có Docker **không** phải lý do để bỏ qua hay coi là PASS.

### A.1 Cài PostgreSQL 16 trực tiếp

- **Windows:** installer từ postgresql.org, hoặc `winget install PostgreSQL.PostgreSQL.16`
- **macOS:** `brew install postgresql@16 && brew services start postgresql@16`
- **Debian/Ubuntu:** `sudo apt install postgresql-16`

### A.2 Tạo role + database khớp `.env.test.example`

```sql
CREATE ROLE fleet_app LOGIN PASSWORD 'fleet_dev_local_only';
CREATE DATABASE fleet_control_test OWNER fleet_app;
```

### A.3 Trỏ đúng cổng

Nếu Postgres của bạn nghe cổng mặc định 5432 (không phải 54329 như compose), sửa
`backend/.env.test`:

```
DATABASE_CONTROL_URL=postgres://fleet_app:fleet_dev_local_only@127.0.0.1:5432/fleet_control_test
```

Không cần sửa test: test lấy host/port từ `DATABASE_CONTROL_URL` qua
`testDbTarget()` trong `test/support/app.ts` — **không có cổng nào hard-code trong test**.

### A.4 Chạy y hệt mục 3–5

```bash
cd backend
npm install
npm run migrate:test
npm run seed:test
npm test
```

---

## Phụ lục B — Sự cố thường gặp

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `DATABASE_CONTROL_URL is required` | chưa có `.env.test`, hoặc file là UTF-16 do PowerShell tạo | `cp backend/.env.test.example backend/.env.test`, chạy lại với `--env=.env.test` |
| `ECONNREFUSED 127.0.0.1:54329` | container chưa healthy, hoặc cổng bị chiếm | `docker compose -f infra/docker-compose.test.yml ps`, đổi `POSTGRES_PORT` |
| `the database system is starting up` | migrate chạy khi container mới `Up` chưa `healthy` | chờ healthy rồi chạy lại |
| Health check `SQL_RW` trả UNHEALTHY | `DATABASE_CONTROL_URL` trỏ sang Postgres khác với cái test dùng | test đã lấy toạ độ từ URL; kiểm lại `.env.test` |
| Integration test đỏ lẻ tẻ, không lặp lại được | chạy song song nhiều jest worker trên cùng DB | luôn dùng `--runInBand` (đã đặt sẵn trong `npm test`) |
| `docker compose up` lỗi `403 Forbidden` khi pull image | registry bị chặn bởi proxy/allowlist mạng | dùng Phụ lục A (Postgres cài trực tiếp) |

---

## Phụ lục C — Ranh giới của lượt kiểm thử này

Những điều **chưa** được kiểm bằng integration test, và lý do:

- **Collector thật** (RouterOS API, RADIUS UDP 1813, IPFIX UDP 2055/4739) chưa có client giao
  thức, nên chưa có hạ tầng UDP/API test. `src/libs/collectors/` mới có **port + adapter +
  mapper**; `collect()` cố tình ném `CollectorNotConfiguredError` thay vì trả mảng rỗng — mảng
  rỗng đồng nghĩa "thiết bị không có dữ liệu", một khẳng định sai.
  Phần map sang telemetry event **đã** được test: `test/unit/collectors.spec.ts` và
  `test/integration/collector-round-trip.spec.ts`.
- **Phân loại service/domain** chưa tồn tại. Mọi flow trả `classification_method='UNKNOWN'` +
  `unknown_reason='NO_CLASSIFIER_IMPLEMENTED'`, không đoán từ port.
- **Attribution engine cho gap** chưa có: toàn bộ chênh lệch nằm ở `unattributed_bytes`,
  không chia bừa theo mười reason code của ADR-11.
- **NATS / ClickHouse** chưa có: normalize chạy đồng bộ ngay trong `TelemetryService.ingest()`,
  `POST /telemetry/normalize` là trigger catch-up thủ công.
