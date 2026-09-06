# API Contract Design v0.1 — `/api/v1`

**Trạng thái:** Phase 2 contract dashboard/reconciliation đã được sinh vào `contracts/openapi.yaml` và có backend API nền; các nguồn telemetry vẫn chưa được triển khai.
**Liên quan:** [01-BACKEND_DESIGN.md](01-BACKEND_DESIGN.md) ADR-09, ADR-13 · `AGENT_COLLABORATION.md §5, §6`

> Tài liệu này là bản thiết kế để hai bên review **trước khi** viết `contracts/openapi.yaml`. Sau khi bạn duyệt, nội dung ở đây trở thành yaml, và từ lúc đó yaml là nguồn sự thật duy nhất.

---

## 1. Quy ước áp dụng cho mọi endpoint

### 1.1. Envelope

Theo `AGENT_COLLABORATION.md §5`, mọi response — kể cả lỗi — đều có ba khóa `data`, `meta`, `error`.

```jsonc
{
  "data": { },
  "meta": {
    "request_id": "req_01J8X...",              // luôn có, đối chiếu được với audit_logs
    "generated_at": "2026-08-24T10:00:00Z",
    "data_from": "2026-08-24T09:00:00Z",       // chỉ với endpoint có time range
    "data_to":   "2026-08-24T10:00:00Z",
    "data_freshness_seconds": 12,              // max của các nguồn đóng góp
    "freshness_by_source": {                   // bổ sung so với spec: FE cần biết nguồn nào cũ
      "interface_counters": 12,
      "radius_accounting": 45,
      "ipfix": 310
    },
    "warnings": [
      { "code": "PARTIAL_DATA",
        "message": "IPFIX collector delayed for ship SHIP-07",
        "details": { "ship_id": "..." } }
    ],
    "page": { "cursor_next": "eyJ0IjoxNz...", "has_more": true, "limit": 50 }
  },
  "error": null
}
```

**Bổ sung so với spec, cần bạn duyệt.**

- `meta.freshness_by_source` — spec chỉ có một con số tổng. Một con số duy nhất không cho phép UI phân biệt "RADIUS chậm" với "IPFIX chết", trong khi hai tình huống đó dẫn tới hành động khác nhau.
- `meta.warnings[]` — cho phép trả `200 OK` với dữ liệu không đầy đủ mà vẫn nói rõ thiếu gì. Không có nó thì backend chỉ còn hai lựa chọn tệ: trả lỗi toàn bộ, hoặc âm thầm trả số sai.

### 1.2. Lỗi

```jsonc
{
  "data": null,
  "meta": { "request_id": "req_01J8X..." },
  "error": {
    "code": "RADIUS_ENDPOINT_UNHEALTHY",
    "message": "No healthy RADIUS endpoint is available",
    "details": { "service_name": "radius.auth", "checked_endpoints": 2 },
    "retryable": true,
    "retry_after_seconds": 30
  }
}
```

`retryable` và `retry_after_seconds` là bổ sung, để Frontend biết nên hiện nút "Thử lại" hay hiện lỗi cứng — thay vì phải hard-code danh sách mã lỗi nào retry được ở phía UI.

### 1.3. Catalog mã lỗi (`contracts/errors.yaml`)

| Nhóm | Code | HTTP | Retryable |
|---|---|---:|---|
| Auth | `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `TOKEN_REUSED`, `MFA_REQUIRED` | 401 | no |
| | `FORBIDDEN`, `SCOPE_FORBIDDEN`, `PERMISSION_DENIED` | 403 | no |
| Validation | `VALIDATION_FAILED`, `INVALID_TIME_RANGE`, `INVALID_GRANULARITY`, `UNSUPPORTED_TIMEZONE` | 400 | no |
| Không tồn tại | `AREA_NOT_FOUND`, `SHIP_NOT_FOUND`, `DEVICE_NOT_FOUND`, `INTERFACE_NOT_FOUND`, `USER_NOT_FOUND`, `JOB_NOT_FOUND`, `ENDPOINT_NOT_FOUND` | 404 | no |
| Xung đột | `RESOURCE_CONFLICT`, `IDEMPOTENCY_KEY_REUSED`, `JOB_ALREADY_RUNNING`, `INTERFACE_DOUBLE_COUNT`, `ZONE_ASSIGNMENT_CONFLICT` | 409 | no |
| Dữ liệu | `STALE_DATA`, `INSUFFICIENT_DATA`, `RECONCILIATION_UNAVAILABLE`, `RAW_RETENTION_EXPIRED` | 422 | no |
| Hạ tầng | `RADIUS_ENDPOINT_UNHEALTHY`, `DATABASE_UNAVAILABLE`, `ANALYTICS_UNAVAILABLE`, `RAW_STORE_UNAVAILABLE`, `COLLECTOR_UNAVAILABLE`, `BUS_UNAVAILABLE` | 503 | **yes** |
| Thiết bị | `DEVICE_UNREACHABLE`, `DEVICE_AUTH_FAILED`, `DEVICE_BUSY`, `DEVICE_UNSUPPORTED_VERSION`, `CONFIG_APPLY_FAILED`, `ROLLBACK_FAILED` | 502 / 409 | tùy |
| Rate limit | `RATE_LIMITED` | 429 | **yes** |
| Nội bộ | `INTERNAL_ERROR` | 500 | yes |

**Quy tắc bắt buộc:** không bao giờ trả database exception, stack trace hoặc chuỗi lỗi của driver ra browser — `AGENT_COLLABORATION §11` cấm. Exception filter map mọi lỗi chưa biết thành `INTERNAL_ERROR` kèm `request_id`, chi tiết chỉ nằm trong log phía server.

### 1.4. Xác thực và phân quyền

```text
Authorization: Bearer <access_token>        JWT, sống 15 phút
Refresh:       httpOnly cookie hoặc body    opaque, rotation có phát hiện tái sử dụng
```

Ký hiệu permission dùng trong bảng endpoint: `resource:action`. Scope nằm trong assignment (`ORG` / `AREA:{id}` / `SHIP:{id}`), và mọi endpoint có `shipId` hoặc `areaId` đều bị lọc theo scope ở tầng repository — không phải ở tầng controller. Lọc ở controller dễ bỏ sót một đường query và rò dữ liệu sang tàu khác.

### 1.5. Query parameter chuẩn cho endpoint dashboard

```text
from        RFC3339, bắt buộc với endpoint chuỗi thời gian
to          RFC3339, mặc định = hiện tại
timezone    IANA, mặc định = timezone của tàu; chỉ ảnh hưởng ranh giới bucket 1d (ADR-09)
granularity 1m | 5m | 1h | 1d
area_id     lọc, lặp lại được
ship_id     lọc, lặp lại được
zone        CREW | BUSINESS | MANAGEMENT | ALL
limit       mặc định 50, tối đa 500 (raw: tối đa 1000)
cursor      opaque, dùng cho keyset pagination
sort        vd "-total_bytes"
```

**Giới hạn cứng.** `to - from` chia cho `granularity` không được vượt 5.000 điểm. Vượt thì trả `INVALID_TIME_RANGE` kèm `details.suggested_granularity`. Đây là bảo vệ backend, đồng thời tránh việc Frontend vô tình yêu cầu một biểu đồ 200.000 điểm mà trình duyệt không vẽ nổi.

### 1.6. Idempotency

Mọi `POST` làm đổi state thiết bị hoặc hạ tầng **bắt buộc** có header `Idempotency-Key` (UUIDv4, client sinh). Lặp lại cùng key trong 24 giờ trả về chính job cũ, không tạo job mới. Thiếu header thì trả `VALIDATION_FAILED`.

Áp dụng cho: `config-apply`, `config-rollback`, `backup`, `restore`, `rollout`, `rollback`, `endpoint check`, `crew disconnect`, `secret rotate`, `raw reprocess`.

### 1.7. Async job

Theo `AGENT_COLLABORATION §5`, mọi thao tác dài trả `202 Accepted` ngay:

```json
{
  "data": {
    "job_id": "job_01J8X...",
    "status": "queued",
    "poll_url": "/api/v1/jobs/job_01J8X...",
    "stream_url": "/api/v1/events/stream?job_id=job_01J8X...",
    "estimated_duration_seconds": 45
  },
  "meta": { "request_id": "req_01J8X..." },
  "error": null
}
```

---

## 2. Module 1 — Authentication / RBAC

| Method | Path | Permission | Ghi chú |
|---|---|---|---|
| POST | `/auth/login` | công khai | Rate limit 5 lần / 15 phút / IP. Trả `MFA_REQUIRED` nếu bật MFA |
| POST | `/auth/mfa/verify` | công khai + mfa_token | |
| POST | `/auth/refresh` | refresh token | Rotation; tái dùng token đã xoay thì thu hồi cả family |
| POST | `/auth/logout` | đã đăng nhập | Thu hồi cả family |
| GET | `/auth/me` | đã đăng nhập | Profile + role + scope |
| GET | `/auth/permissions` | đã đăng nhập | **FE dùng để render có điều kiện** |
| GET | `/rbac/roles` | `rbac:read` | |
| GET | `/rbac/permissions` | `rbac:read` | Catalog đầy đủ |
| GET | `/rbac/users` | `rbac:read` | Có phân trang |
| POST | `/rbac/users` | `rbac:write` | |
| PATCH | `/rbac/users/{userId}` | `rbac:write` | |
| POST | `/rbac/users/{userId}/roles` | `rbac:write` | Gán role kèm scope |
| DELETE | `/rbac/users/{userId}/roles/{assignmentId}` | `rbac:write` | |

**`GET /auth/permissions`** là endpoint quan trọng nhất với Frontend, nên định nghĩa chặt:

```jsonc
{
  "data": {
    "user_id": "...",
    "permissions": ["inventory:read", "crew:read", "device:config-apply"],
    "scopes": [
      { "type": "AREA", "id": "area-uuid", "name": "Khu vực A",
        "permissions": ["inventory:read", "inventory:write"] },
      { "type": "SHIP", "id": "ship-uuid", "name": "Tàu 07",
        "permissions": ["device:config-apply"] }
    ],
    "accessible_area_ids": ["..."],     // FE lọc dropdown bằng hai mảng này
    "accessible_ship_ids": ["..."],
    "ui_capabilities": {                // suy ra sẵn ở backend, FE không tự suy luận
      "can_apply_config": true,
      "can_manage_endpoints": false,
      "can_view_raw": true,
      "can_ack_alerts": true,
      "can_disconnect_crew": false
    }
  }
}
```

`ui_capabilities` là bổ sung có chủ đích. Nếu Frontend phải tự suy ra "được bấm nút này không" từ mảng permission thô, thì logic quyền bị nhân bản ở hai nơi và sẽ lệch nhau. Backend tính sẵn, một nguồn sự thật.

---

## 3. Module 2 — Area / Ship / Device

### 3.1. Đọc (Frontend cần trước)

| Method | Path | Permission | Ghi chú |
|---|---|---|---|
| GET | `/areas` | `inventory:read` | Lọc theo scope, kèm số tàu và trạng thái tổng hợp |
| GET | `/areas/{areaId}` | `inventory:read` | |
| GET | `/areas/{areaId}/dashboard` | `dashboard:read` | Xem §4 |
| GET | `/ships` | `inventory:read` | `?area_id=&status=&q=` |
| GET | `/ships/{shipId}` | `inventory:read` | |
| GET | `/ships/{shipId}/dashboard` | `dashboard:read` | |
| GET | `/ships/{shipId}/topology` | `inventory:read` | Node và edge để FE vẽ sơ đồ |
| GET | `/ships/{shipId}/interfaces` | `inventory:read` | Gộp mọi thiết bị của tàu |
| GET | `/devices` | `inventory:read` | `?ship_id=&role=&status=` |
| GET | `/devices/{deviceId}` | `inventory:read` | |
| GET | `/devices/{deviceId}/health` | `inventory:read` | |
| GET | `/devices/{deviceId}/interfaces` | `inventory:read` | |
| GET | `/devices/{deviceId}/interfaces/{interfaceId}/traffic` | `inventory:read` | Chuỗi thời gian |
| GET | `/devices/{deviceId}/config-revisions` | `device:read` | |
| GET | `/devices/{deviceId}/config-revisions/{revId}/diff` | `device:read` | Diff before/after |
| GET | `/devices/{deviceId}/logs` | `device:read` | Từ raw syslog, có cursor |
| GET | `/devices/{deviceId}/backups` | `device:read` | **Không trả nội dung backup** |
| GET | `/devices/{deviceId}/commissioning` | `device:read` | Record theo `HARDWARE_ZEROTIER_FLOW §9` |

### 3.2. Ghi (bổ sung so với `AGENT_COLLABORATION §6` — cần duyệt)

`AGENT_COLLABORATION §6` chỉ liệt kê endpoint đọc, nhưng `SYSTEM_SPEC §12` có `POST /api/areas`, `POST /api/ships`, `POST /api/devices`, `PATCH /api/devices/{id}`, và `§15` yêu cầu "có thể tạo Area, Ship và Device". Đề xuất bổ sung để hai tài liệu khớp nhau:

| Method | Path | Permission | Ghi chú |
|---|---|---|---|
| POST | `/areas` · PATCH `/areas/{id}` · DELETE `/areas/{id}` | `inventory:write` | Xóa: chỉ soft delete, chặn nếu còn tàu |
| POST | `/ships` · PATCH `/ships/{id}` · DELETE `/ships/{id}` | `inventory:write` | |
| POST | `/devices` · PATCH `/devices/{id}` · DELETE `/devices/{id}` | `inventory:write` | |
| PATCH | `/interfaces/{id}` | `inventory:write` | Đổi `accounting_group`, `counted_in_reconciliation` |
| POST | `/interfaces/{id}/assign-zone` | `inventory:write` | Trả `INTERFACE_DOUBLE_COUNT` nếu vi phạm ADR-10 |
| POST | `/ships/{shipId}/zones` · PATCH · DELETE | `inventory:write` | |
| POST | `/ships/{shipId}/vlans` · PATCH · DELETE | `inventory:write` | |
| POST | `/ships/{shipId}/wan-links` · PATCH · DELETE | `inventory:write` | |
| POST | `/devices/{deviceId}/discovery` | `device:read` | 202 → job đọc read-only, không ghi gì |
| POST | `/devices/{deviceId}/backup` | `device:backup` | 202 → job |
| POST | `/devices/{deviceId}/config-apply` | `device:config-apply` | 202 → job, cần `Idempotency-Key`, hỗ trợ `dry_run` |
| POST | `/devices/{deviceId}/config-rollback` | `device:config-rollback` | 202 → job |

**`dry_run: true`** trả về diff mà không chạm thiết bị. Đây phải là mặc định trong UI: người vận hành nhìn thấy diff trước, rồi mới xác nhận apply.

### 3.3. Ship dashboard — hình dạng response

```jsonc
{
  "data": {
    "ship": { "id": "...", "code": "SHIP-07", "name": "...", "area": {...},
              "status": "ACTIVE", "timezone": "Asia/Bangkok" },
    "connectivity": {
      "management_vpn": { "status": "HEALTHY", "handshake_age_seconds": 23,
                          "rtt_ms": 612, "loss_pct": 0.4 },
      "devices": { "total": 5, "online": 4, "degraded": 1, "offline": 0 }
    },
    "wan": [
      { "wan_id": "...", "name": "WAN1-VSAT", "kind": "VSAT", "is_up": true,
        "rx_bps": 18400000, "tx_bps": 3200000,
        "capacity_down_bps": 25000000, "capacity_up_bps": 5000000,
        "utilization_down_pct": 73.6, "p95_down_bps": 21000000,
        "rtt_ms": 610, "loss_pct": 0.4, "failover_count_24h": 0 }
    ],
    "crew":     { "active_sessions": 87, "total_users": 210,
                  "download_bytes": 41000000000, "upload_bytes": 3900000000,
                  "users_near_quota": 4, "users_over_quota": 1,
                  "users_without_accounting": 2 },
    "business": { "download_bytes": 12000000000, "upload_bytes": 2100000000,
                  "active_devices": 34, "identified_pct": 0 },
    "reconciliation_summary": {
      "crew_gap_pct": 7.4, "wan_gap_pct": 3.1,
      "data_quality_score": 0.78,
      "top_gap_reason": "DEVICE_NOT_LOGGED_IN"
    },
    "alerts": { "critical": 0, "major": 1, "warning": 3 }
  },
  "meta": { "data_freshness_seconds": 45, "freshness_by_source": {...}, ... }
}
```

`business.identified_pct: 0` không phải lỗi. `SYSTEM_SPEC §4.3` nói rõ BUSINESS không có username nếu chưa triển khai cơ chế xác thực bổ sung. Frontend phải hiển thị điều đó như một đặc tính đã biết của vùng BUSINESS, không phải như dữ liệu bị thiếu.

---

## 4. Module 3 — Ship reconciliation

| Method | Path | Permission | Ghi chú |
|---|---|---|---|
| GET | `/ships/{shipId}/reconciliation` | `reconciliation:read` | Tổng hợp + gap + lý do |
| GET | `/ships/{shipId}/reconciliation/by-wan` | `reconciliation:read` | Tách theo từng WAN |
| GET | `/ships/{shipId}/reconciliation/by-interface` | `reconciliation:read` | Tách theo interface |
| GET | `/ships/{shipId}/reconciliation/by-zone` | `reconciliation:read` | CREW / BUSINESS / MANAGEMENT |
| GET | `/ships/{shipId}/reconciliation/timeseries` | `reconciliation:read` | **Bổ sung** — chuỗi gap theo thời gian để vẽ biểu đồ |
| GET | `/ships/{shipId}/reconciliation/raw-records` | `raw:read` | Drill-down, cursor, giới hạn cứng |
| POST | `/ships/{shipId}/reconciliation/recompute` | `reconciliation:write` | 202 → job tính lại một khoảng |

Query: `from`, `to`, `timezone`, `granularity=1m|5m|1h|1d`, `zone=CREW|BUSINESS|MANAGEMENT|ALL`.

### Response chính

```jsonc
{
  "data": {
    "period": { "from": "...", "to": "...", "granularity": "1h", "timezone": "Asia/Bangkok" },
    "wan":      { "download_bytes": 128000000000, "upload_bytes": 14000000000 },
    "crew":     { "port_download_bytes": 56000000000, "port_upload_bytes": 6100000000,
                  "user_download_bytes": 51816108766, "user_upload_bytes": 5800000000,
                  "identified_source": "RADIUS_ACCOUNTING" },
    "business": { "port_download_bytes": 62000000000, "port_upload_bytes": 7200000000,
                  "identified_source": null },
    "management": { "download_bytes": 900000000, "upload_bytes": 400000000,
                    "counted_as_user": false },

    "gaps": {
      "crew_download_gap_bytes": 4183891234, "crew_download_gap_pct": 7.4,
      "crew_upload_gap_bytes": 300000000,    "crew_upload_gap_pct": 4.9,
      "wan_download_gap_bytes": 10000000000, "wan_download_gap_pct": 7.8,
      "wan_upload_gap_bytes": 700000000,     "wan_upload_gap_pct": 5.0
    },

    "gap_reasons": [
      { "code": "DEVICE_NOT_LOGGED_IN", "applies_to": "CREW_DOWNLOAD",
        "estimated_bytes": 2900000000, "confidence": 0.62,
        "evidence": { "unauthenticated_hosts": 14, "sample_ips": ["…"] },
        "drill_down_url": "/api/v1/ships/{id}/reconciliation/raw-records?reason=DEVICE_NOT_LOGGED_IN" },
      { "code": "BROADCAST_MULTICAST", "applies_to": "WAN_DOWNLOAD",
        "estimated_bytes": 180000000, "confidence": 0.85, "evidence": {...} },
      { "code": "FASTTRACK_BYPASS", "applies_to": "CREW_DOWNLOAD",
        "estimated_bytes": 0, "confidence": 1.0,
        "evidence": { "fasttrack_enabled": false } }
    ],
    "unattributed_bytes": 203891234,

    "data_quality": {
      "score": 0.78,
      "counter_resets": 1,
      "missing_buckets": 0,
      "flow_sampling_rate": 1,
      "radius_sessions_without_stop": 3,
      "interfaces_excluded": [ { "interface_id": "...", "reason": "UNRELIABLE_COUNTER" } ]
    },
    "formula_version": "recon-1.0.0"
  }
}
```

**Bốn quy tắc contract cho module này** (hệ quả của ADR-11):

1. `gaps` không bao giờ xuất hiện mà thiếu `gap_reasons` và `data_quality`. Frontend không được phép hiển thị một con số gap trần.
2. `unattributed_bytes` luôn hiện diện, kể cả bằng 0. Đây là con số đáng chú ý nhất — phần chênh lệch mà hệ thống **không** giải thích được.
3. `formula_version` để đối chiếu khi công thức thay đổi giữa hai lần xem.
4. Mỗi `gap_reason` có `drill_down_url` sẵn, để FE không phải tự ghép query string.

**Khi dữ liệu không đủ để đối soát** (thiếu counter, thiếu RADIUS, tàu vừa lên): trả `422 RECONCILIATION_UNAVAILABLE` kèm `details.missing_sources[]`, không trả số 0. Số 0 sẽ bị đọc nhầm thành "không có traffic".

---

## 5. Module 4 — CREW User / AAA

| Method | Path | Permission | Ghi chú |
|---|---|---|---|
| GET | `/ships/{shipId}/crew/users` | `crew:read` | Lọc `status`, `q`, `quota_state`, sort |
| GET | `/ships/{shipId}/crew/users/{userId}` | `crew:read` | |
| GET | `/ships/{shipId}/crew/users/{userId}/sessions` | `crew:read` | Lịch sử, cursor |
| GET | `/ships/{shipId}/crew/users/{userId}/usage` | `crew:read` | Chuỗi thời gian |
| GET | `/ships/{shipId}/crew/users/{userId}/services` | `crew:read` | Theo category / domain |
| GET | `/ships/{shipId}/crew/users/{userId}/raw-records` | `raw:read` | Drill-down |
| GET | `/ships/{shipId}/crew/sessions/active` | `crew:read` | **Bổ sung** — session đang mở toàn tàu |
| GET | `/ships/{shipId}/crew/radius-health` | `crew:read` | accept / reject / timeout / RTT / server active |
| POST | `/ships/{shipId}/crew/users` | `crew:write` | **Bổ sung** — `§15` yêu cầu CREW login được |
| PATCH | `/ships/{shipId}/crew/users/{userId}` | `crew:write` | **Bổ sung** |
| POST | `/ships/{shipId}/crew/users/{userId}/reset-password` | `crew:write` | **Bổ sung** — trả `password_set: true`, không trả password |
| POST | `/ships/{shipId}/crew/users/{userId}/suspend` · `/resume` | `crew:write` | **Bổ sung** |
| POST | `/ships/{shipId}/crew/users/{userId}/disconnect` | `crew:disconnect` | CoA / Disconnect-Request, 202 |
| GET | `/crew/profiles` · POST · PATCH | `crew:read` / `crew:write` | Profile và limitation dùng chung fleet |

### Response user detail

```jsonc
{
  "data": {
    "user": {
      "id": "...", "username": "crew.nguyen",       // KHÔNG có trường password nào
      "display_name": "...", "department": "Deck",
      "status": "ACTIVE", "profile": { "id": "...", "name": "CREW-STANDARD",
                                       "rate_limit_rx_bps": 4000000,
                                       "rate_limit_tx_bps": 2000000 },
      "valid_from": "...", "valid_to": null
    },
    "quota": { "period": "MONTHLY", "limit_bytes": 21474836480,
               "used_bytes": 18300000000, "used_pct": 85.2,
               "resets_at": "2026-09-01T00:00:00Z", "state": "NEAR_LIMIT" },
    "usage":   { "download_bytes": 16500000000, "upload_bytes": 1800000000,
                 "total_bytes": 18300000000, "session_count": 143 },
    "current_session": {
      "acct_session_id": "81a0...", "started_at": "...",
      "framed_ip": "10.100.4.87",                    // IP nội bộ tàu, không phải production
      "calling_station_mac": "AA:BB:CC:DD:EE:FF",
      "nas": { "device_id": "...", "device_name": "EDGE-01" },
      "download_bytes": 420000000, "upload_bytes": 31000000,
      "last_interim_at": "...", "interim_overdue": false
    },
    "accounting_health": {
      "sessions_without_stop": 1,
      "last_accounting_at": "...",
      "interim_interval_s": 300,
      "warning": "ONE_SESSION_MISSING_STOP"
    }
  }
}
```

**Ràng buộc bảo mật.** Không endpoint nào của module này trả `password`, `password_hash`, `shared_secret` hay `nt_hash`. Reset password trả `{"password_set": true}`; mật khẩu mới đi tới người dùng qua kênh ngoài băng, không qua API response. Có contract test riêng quét toàn bộ response schema tìm các key bị cấm.

---

## 6. Module 5 — BUSINESS usage

| Method | Path | Permission | Ghi chú |
|---|---|---|---|
| GET | `/ships/{shipId}/business/ports` | `business:read` | Counter theo ether port |
| GET | `/ships/{shipId}/business/vlans` | `business:read` | Counter theo VLAN |
| GET | `/ships/{shipId}/business/devices` | `business:read` | Theo IP / MAC, từ DHCP và ARP |
| GET | `/ships/{shipId}/business/usage` | `business:read` | Chuỗi thời gian tổng hợp |
| GET | `/ships/{shipId}/business/flows` | `business:read` | Flow đã phân loại |
| GET | `/ships/{shipId}/business/raw-records` | `raw:read` | **Bổ sung** — drill-down cho đồng bộ với CREW |

### Contract quan trọng nhất của module này

Mọi response đều mang khối `identity_capability` ở đầu:

```jsonc
{
  "data": {
    "identity_capability": {
      "has_user_identity": false,
      "reason": "NO_AUTHENTICATION_MECHANISM",
      "measured_by": ["ETHER_PORT", "VLAN", "IP", "MAC", "DEVICE", "DESTINATION"],
      "to_enable_user_identity": ["802.1X", "PPPoE_RADIUS", "DEDICATED_HOTSPOT"]
    },
    "devices": [
      { "client_ip": "10.200.1.42", "client_mac": "…", "hostname": "BRIDGE-PC-01",
        "vlan_id": 200, "interface": "ether5",
        "download_bytes": 8200000000, "upload_bytes": 940000000,
        "first_seen": "…", "last_seen": "…",
        "identity": null, "identity_note": "BUSINESS zone has no user-level identity" }
    ]
  }
}
```

Đây là hiện thực trực tiếp của `SYSTEM_SPEC §4.3`. Nếu contract không nói rõ điều này, Frontend sẽ dựng cột "User" rỗng và người xem sẽ hiểu nhầm rằng dữ liệu bị mất, thay vì hiểu rằng vùng BUSINESS vốn không đo theo người dùng.

---

## 7. Module 6 — Traffic Flow

| Method | Path | Permission | Ghi chú |
|---|---|---|---|
| GET | `/ships/{shipId}/flows/summary` | `flows:read` | KPI tổng hợp |
| GET | `/ships/{shipId}/flows/top-users` | `flows:read` | |
| GET | `/ships/{shipId}/flows/top-domains` | `flows:read` | |
| GET | `/ships/{shipId}/flows/top-categories` | `flows:read` | |
| GET | `/ships/{shipId}/flows/top-destinations` | `flows:read` | IP và ASN |
| GET | `/ships/{shipId}/flows/top-ports` | `flows:read` | Port và protocol |
| GET | `/ships/{shipId}/flows/by-wan` | `flows:read` | |
| GET | `/ships/{shipId}/flows/by-zone` | `flows:read` | |
| GET | `/ships/{shipId}/flows/unknown` | `flows:read` | Traffic chưa phân loại, kèm lý do |
| GET | `/ships/{shipId}/flows/raw` | `raw:read` | Drill-down từng flow, cursor |
| GET | `/flows/classification-catalog` | `flows:read` | Danh mục category để FE render legend |
| POST | `/flows/reprocess` | `flows:admin` | 202 → job reprocess theo `parser_version` |

Mọi bản ghi flow đều kèm ba trường theo `SYSTEM_SPEC §5.4`:

```jsonc
{
  "classification_method": "DNS",     // DNS | IP_CATALOG | ASN | PORT | TLS_SNI | UNKNOWN
  "classification_confidence": 0.88,
  "unknown_reason": null              // NO_DNS_RECORD | ENCRYPTED_SNI | IP_NOT_IN_CATALOG
                                      // | SAMPLED_OUT | FLOW_TOO_SHORT
}
```

Endpoint `/flows/unknown` tồn tại vì `§7.6` yêu cầu dashboard hiển thị "unknown/encrypted traffic" như một hạng mục hạng nhất. Hệ thống không cam kết nhận diện nội dung HTTPS, và phần không nhận diện được phải nhìn thấy được thay vì bị gộp vào "Other".

---

## 8. Module 7 — Server health

| Method | Path | Permission | Ghi chú |
|---|---|---|---|
| GET | `/health/summary` | `health:read` | Tổng quan mọi service |
| GET | `/health/services` | `health:read` | Theo logical service |
| GET | `/health/services/{serviceName}` | `health:read` | Từng endpoint của service |
| GET | `/health/services/{serviceName}/history` | `health:read` | **Bổ sung** — chuỗi trạng thái để vẽ timeline |
| GET | `/health/ships` | `health:read` | **Bổ sung** — tàu nào bị ảnh hưởng |
| GET | `/health/collectors` | `health:read` | **Bổ sung** — last flow, queue depth, drop |
| GET | `/health/backups` | `health:read` | **Bổ sung** — tuổi backup, kết quả restore test |
| GET | `/healthz` · `/readyz` | công khai | Liveness/readiness cho container, không nằm dưới `/api/v1` |

```jsonc
{
  "data": {
    "overall": "DEGRADED",
    "services": [
      { "service_name": "radius.auth", "service_type": "RADIUS", "status": "DEGRADED",
        "healthy_endpoints": 1, "total_endpoints": 2,
        "active_endpoint": { "id": "...", "label": "radius-01", "priority": 10 },
        "affected_ships": 0,
        "endpoints": [
          { "id": "...", "label": "radius-01", "priority": 10, "status": "HEALTHY",
            "last_check_at": "...", "last_success_at": "...", "rtt_ms": 24,
            "failure_count": 0, "breaker_state": "CLOSED",
            "check": { "type": "RADIUS_ACCESS_REQUEST", "result": "ACCEPT" } },
          { "id": "...", "label": "radius-02", "priority": 20, "status": "UNHEALTHY",
            "failure_count": 7, "breaker_state": "OPEN",
            "last_error": { "code": "TIMEOUT", "message": "no response in 5000ms" } }
        ] },
      { "service_name": "database.analytics", "status": "HEALTHY",
        "extra": { "replication_lag_seconds": 2, "read_ok": true, "write_ok": true } },
      { "service_name": "collector.ipfix", "status": "DEGRADED",
        "extra": { "last_flow_received_at": "...", "queue_depth": 18400,
                   "dropped_last_hour": 230 } },
      { "service_name": "storage.backup.a", "status": "HEALTHY",
        "extra": { "last_backup_at": "...", "backup_age_hours": 6,
                   "last_restore_test": "PASSED", "restore_tested_at": "..." } }
    ],
    "data_pipeline": {
      "raw_ingest_delay_seconds": 12,
      "aggregation_lag_seconds": 45,
      "ships_with_stale_data": ["SHIP-12"]
    }
  }
}
```

**Health check phải kiểm tra chức năng, không phải TCP port** — `SYSTEM_SPEC §10.3`. Field `check` trong mỗi endpoint ghi rõ đã kiểm bằng cách nào: RADIUS gửi Access-Request thật và nhận Accept; database chạy cả read và write transaction; IPFIX kiểm tra có flow mới không; backup kiểm tra restore test gần nhất. Một endpoint mở port nhưng không trả lời đúng chức năng vẫn phải là `UNHEALTHY`.

---

## 9. Module 8 — Dynamic service endpoints

| Method | Path | Permission | Ghi chú |
|---|---|---|---|
| GET | `/service-endpoints` | `endpoint:read` | Lọc `service_name`, `environment`, `status` |
| GET | `/service-endpoints/{id}` | `endpoint:read` | |
| POST | `/services/{serviceName}/endpoints` | `endpoint:write` | Tạo mới |
| PATCH | `/service-endpoints/{id}` | `endpoint:write` | Cập nhật, sinh revision mới |
| DELETE | `/service-endpoints/{id}` | `endpoint:write` | Chặn nếu là endpoint cuối cùng còn healthy |
| POST | `/service-endpoints/{id}/check` | `endpoint:read` | Synthetic health check tức thời, 202 |
| POST | `/service-endpoints/{id}/enable` · `/disable` | `endpoint:write` | |
| POST | `/service-endpoints/{id}/rollout` | `endpoint:rollout` | 202 → job staged rollout |
| POST | `/service-endpoints/{id}/rollback` | `endpoint:rollout` | 202 → job |
| GET | `/service-endpoints/{id}/revisions` | `endpoint:read` | **Bổ sung** — lịch sử thay đổi |
| GET | `/services` | `endpoint:read` | **Bổ sung** — danh sách logical service |
| GET | `/services/{serviceName}/rollouts` | `endpoint:read` | **Bổ sung** — lịch sử rollout |
| POST | `/service-endpoints/validate` | `endpoint:write` | **Bổ sung** — validate trước khi lưu |

### Quy trình `SYSTEM_SPEC §9.2` ánh xạ sang API

```text
Admin nhập host/port/protocol
  → POST /service-endpoints/validate            DNS + IP + port + certificate
  → POST /services/{name}/endpoints             tạo (enabled=false)
  → POST /service-endpoints/{id}/check          synthetic health check
  → POST /service-endpoints/{id}/rollout        staged theo scope, 202 → job
       job: STAGE → APPLY theo batch → VERIFY (auth + accounting + telemetry)
            → COMMIT hoặc ROLLBACK tự động
  → theo dõi qua /jobs/{id} hoặc /events/stream
```

Request rollout:

```jsonc
{
  "scope": { "type": "AREA", "ids": ["area-uuid"] },
  "strategy": "BATCHED",
  "batch_size": 3,
  "batch_delay_seconds": 120,
  "verification": {
    "require_radius_accept": true,
    "require_accounting_within_seconds": 300,
    "require_telemetry_within_seconds": 120,
    "auto_rollback_on_failure": true
  },
  "reason": "Chuyển RADIUS-02 sang subnet mới"
}
```

**Ràng buộc contract, bắt nguồn từ `§9.2` và `§13`:**

- Response **không bao giờ** trả `secret`. Chỉ có `secret_ref` và `secret_configured: true|false`.
- `PATCH` bắt buộc có `reason` — nó đi thẳng vào `audit_logs`.
- `DELETE` hoặc `disable` endpoint cuối cùng còn healthy của một service trả `409 RESOURCE_CONFLICT`, kèm `details.would_break_ships[]`. Hệ thống không cho phép người vận hành tự cắt chân mình.

---

## 10. Module 9 — Jobs

| Method | Path | Permission | Ghi chú |
|---|---|---|---|
| GET | `/jobs` | `job:read` | **Bổ sung** — lọc `type`, `status`, `scope`, cursor |
| GET | `/jobs/{jobId}` | `job:read` | Kèm `steps[]` |
| POST | `/jobs/{jobId}/cancel` | `job:cancel` | |
| POST | `/jobs/{jobId}/rollback` | `job:rollback` | Tạo job bù trừ |
| GET | `/jobs/{jobId}/logs` | `job:read` | **Bổ sung** — log từng bước |
| POST | `/jobs/config-apply` | `device:config-apply` | Theo `SYSTEM_SPEC §12`, apply cho nhiều thiết bị |

```jsonc
{
  "data": {
    "job_id": "job_01J8X...", "type": "CONFIG_APPLY", "status": "running",
    "progress_pct": 60, "dry_run": false,
    "scope": { "ship_ids": ["..."], "device_ids": ["..."] },
    "requested_by": { "id": "...", "name": "..." },
    "started_at": "...", "estimated_completion_at": "...",
    "steps": [
      { "seq": 1, "name": "backup", "status": "succeeded", "target_device_id": "...",
        "output": { "backup_id": "...", "targets_written": 2 } },
      { "seq": 2, "name": "arm-deferred-rollback", "status": "succeeded",
        "output": { "scheduler_name": "auto-rollback", "fires_in_seconds": 600 } },
      { "seq": 3, "name": "apply", "status": "running" },
      { "seq": 4, "name": "verify", "status": "pending" },
      { "seq": 5, "name": "disarm-deferred-rollback", "status": "pending" }
    ],
    "rollback_available": true, "rollback_job_id": null,
    "poll_url": "/api/v1/jobs/job_01J8X...",
    "stream_url": "/api/v1/events/stream?job_id=job_01J8X..."
  }
}
```

Bước `arm-deferred-rollback` và `disarm-deferred-rollback` hiển thị công khai trong `steps[]` là có chủ đích: người vận hành nhìn thấy mạng lưới an toàn đang được giăng và gỡ, thay vì phải tin rằng nó tồn tại.

---

## 11. Module 10 — Alerts

| Method | Path | Permission | Ghi chú |
|---|---|---|---|
| GET | `/alerts` | `alert:read` | Lọc `status`, `severity`, `scope`, `kind` |
| GET | `/alerts/{alertId}` | `alert:read` | Kèm evidence và timeline |
| POST | `/alerts/{alertId}/ack` | `alert:ack` | Có `note` |
| POST | `/alerts/{alertId}/resolve` | `alert:ack` | Có `reason` |
| POST | `/alerts/{alertId}/suppress` | `alert:admin` | **Bổ sung** — im lặng có thời hạn |
| GET | `/alert-rules` · POST · PATCH · DELETE | `alert:read` / `alert:admin` | **Bổ sung** |
| GET | `/alerts/summary` | `alert:read` | **Bổ sung** — đếm theo severity và scope |

```jsonc
{
  "data": {
    "id": "...", "rule": { "code": "RADIUS_FAILURE", "name": "RADIUS endpoint unhealthy" },
    "severity": "MAJOR", "status": "FIRING",
    "scope": { "service_name": "radius.auth", "endpoint_id": "...", "area_id": null },
    "title": "radius-02 không phản hồi",
    "summary": "7 lần Access-Request liên tiếp timeout trong 4 phút",
    "evidence": { "consecutive_failures": 7, "last_rtt_ms": null,
                  "first_failure_at": "...", "affected_ships": 0 },
    "started_at": "...", "duration_seconds": 246,
    "timeline": [
      { "at": "...", "event": "FIRED" },
      { "at": "...", "event": "FAILOVER_TO", "details": { "endpoint": "radius-01" } }
    ],
    "related_job_id": null,
    "runbook_url": "/docs/runbooks/radius-failover.md"
  }
}
```

---

## 12. Module 11 — Audit logs

| Method | Path | Permission | Ghi chú |
|---|---|---|---|
| GET | `/audit-logs` | `audit:read` | Lọc `actor_id`, `action`, `resource_type`, `resource_id`, `from`, `to`, `result`, cursor |
| GET | `/audit-logs/{id}` | `audit:read` | Kèm `before` / `after` / `diff` đầy đủ |
| GET | `/audit-logs/export` | `audit:export` | 202 → job xuất CSV/JSON, trả link tải có hạn |
| GET | `/audit-logs/actions` | `audit:read` | **Bổ sung** — catalog action để FE dựng bộ lọc |

```jsonc
{
  "data": {
    "id": "...", "created_at": "...",
    "actor": { "type": "USER", "id": "...", "label": "ops@example" },
    "action": "service_endpoint.update",
    "resource": { "type": "service_endpoint", "id": "...", "label": "radius.auth / radius-02" },
    "result": "SUCCESS",
    "reason": "Chuyển RADIUS-02 sang subnet mới",
    "diff": {
      "host":     { "before": "radius-02.internal", "after": "radius-02b.internal" },
      "priority": { "before": 20, "after": 15 },
      "secret_ref": { "before": "***", "after": "***", "changed": true }
    },
    "request_id": "req_01J8X...",
    "job_id": "job_01J8X...",
    "ip": "…", "user_agent": "…"
  }
}
```

`secret_ref` trong diff luôn hiện dưới dạng `***` kèm cờ `changed`. Audit ghi lại **rằng** secret đã đổi, không ghi lại **giá trị** — đủ để truy vết mà không tạo ra một kho secret thứ hai nằm trong audit log.

---

## 13. SSE — `/api/v1/events/stream`

```text
GET /api/v1/events/stream?ship_id=&job_id=&types=alert,job,health,failover
Accept: text/event-stream
Last-Event-ID: <id>          ← resume sau khi mất kết nối
```

Loại event (định nghĩa trong `contracts/events.yaml`):

| Type | Khi nào | Payload |
|---|---|---|
| `job.progress` | Job đổi progress hoặc step | `{job_id, status, progress_pct, current_step}` |
| `job.completed` | Job kết thúc | `{job_id, status, error}` |
| `alert.fired` · `alert.resolved` · `alert.acked` | Alert đổi trạng thái | Alert summary |
| `health.transition` | Service đổi status | `{service_name, endpoint_id, from, to}` |
| `endpoint.failover` | Chuyển endpoint active | `{service_name, from_endpoint, to_endpoint, reason}` |
| `data.stale` | Freshness vượt ngưỡng | `{ship_id, source_type, lag_seconds}` |
| `heartbeat` | Mỗi 15 giây | `{server_time}` — giữ kết nối qua proxy |

Frontend phải có polling fallback theo `AGENT_COLLABORATION §6`. `heartbeat` giúp FE phát hiện kết nối chết mà proxy chưa đóng — không có nó, UI sẽ hiển thị dữ liệu đứng yên và trông như "yên tĩnh" thay vì "mất kết nối".

---

## 14. Ma trận permission

| Module | viewer | operator | network-admin | security-admin | platform-admin |
|---|---|---|---|---|---|
| Dashboard, inventory (đọc) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reconciliation (đọc) | ✅ | ✅ | ✅ | ✅ | ✅ |
| CREW (đọc) | ✅ | ✅ | ✅ | ✅ | ✅ |
| BUSINESS, flows (đọc) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Raw records | — | ✅ | ✅ | ✅ | ✅ |
| Alert ack / resolve | — | ✅ | ✅ | ✅ | ✅ |
| Inventory (ghi) | — | — | ✅ | — | ✅ |
| CREW (ghi, disconnect) | — | ✅ | ✅ | — | ✅ |
| Device config apply / rollback | — | — | ✅ | — | ✅ |
| Service endpoint (ghi) | — | — | ✅ | ✅ | ✅ |
| Service endpoint rollout | — | — | — | ✅ | ✅ |
| Audit log (đọc) | — | — | — | ✅ | ✅ |
| Audit export | — | — | — | ✅ | ✅ |
| RBAC quản trị | — | — | — | — | ✅ |
| Secret rotate | — | — | — | ✅ | ✅ |

Ma trận này ánh xạ trực tiếp phần tách quyền ở `SYSTEM_SPEC §13`. Điểm đáng chú ý: `network-admin` cấu hình được endpoint nhưng **không** rollout được — rollout chạm cả fleet nên cần `security-admin`. Đây là kiểm soát hai người cho thao tác có bán kính ảnh hưởng lớn nhất.

---

## 15. Danh sách bổ sung so với hai tài liệu gốc — cần bạn duyệt

| # | Bổ sung | Vì sao |
|---|---|---|
| A1 | CRUD ghi cho area/ship/device/interface/zone/vlan/wan | `AGENT_COLLABORATION §6` chỉ có endpoint đọc, nhưng `SYSTEM_SPEC §12` và `§15` yêu cầu tạo được |
| A2 | CRUD ghi cho CREW user | `§15` yêu cầu CREW login được qua HotSpot; phải có đường tạo user |
| A3 | `meta.freshness_by_source` | Một con số freshness tổng không cho biết nguồn nào đang hỏng |
| A4 | `meta.warnings[]` | Trả được dữ liệu một phần mà vẫn trung thực |
| A5 | `error.retryable`, `retry_after_seconds` | Tránh nhân bản logic retry sang Frontend |
| A6 | `ui_capabilities` trong `/auth/permissions` | Một nguồn sự thật cho quyền hiển thị |
| A7 | `/reconciliation/timeseries` | `§7.3` cần biểu đồ gap theo thời gian |
| A8 | `/health/collectors`, `/health/backups`, `/health/ships` | `§10.4` liệt kê các chỉ số này nhưng chưa có endpoint |
| A9 | `/alert-rules` CRUD | `§7.8` cần cấu hình ngưỡng cảnh báo |
| A10 | `/jobs` list + `/jobs/{id}/logs` | Không có list thì UI không dựng được trang Jobs |
| A11 | `/service-endpoints/validate` và `/revisions` | `§9.2` yêu cầu validate trước và có version |
| A12 | `identity_capability` trong mọi response BUSINESS | Hiện thực `§4.3` để tránh hiểu nhầm |
| A13 | Header `Idempotency-Key` | Chống apply hai lần khi mạng vệ tinh timeout rồi client retry |
| A14 | `heartbeat` trong SSE | Phát hiện kết nối chết sau proxy |

Tất cả đều là **thêm mới**, không phá vỡ endpoint nào đã có trong hai tài liệu gốc, nên vẫn nằm trong `/api/v1` theo chính sách non-breaking ở `AGENT_COLLABORATION §11`.

---

## 16. Thứ tự viết contract ở Sprint 0

| Đợt | Endpoint | Vì sao trước |
|---|---|---|
| 1 | Envelope, error catalog, security scheme, `/auth/*` | Mọi thứ khác phụ thuộc |
| 2 | `/dashboard/global`, `/areas`, `/ships`, `/ships/{id}/dashboard` | Antigravity dựng app shell và điều hướng |
| 3 | `/ships/{id}/reconciliation` + `gap_reasons` | Schema phức tạp nhất, cần review sớm nhất |
| 4 | `/ships/{id}/crew/*` | Màn hình nhiều dữ liệu thứ hai |
| 5 | `/health/*`, `/service-endpoints/*` | Trang vận hành |
| 6 | `/jobs/*`, `/alerts/*`, `/audit-logs/*`, `/events/stream` | Chung một mô hình async |
| 7 | `/flows/*`, `/business/*` | Phụ thuộc pipeline Phase 4 |

---

## 17. Phase 3 — raw telemetry ingest foundation

Phase 3 đã bổ sung contract và backend foundation cho `POST /telemetry/ingest` và `GET /telemetry/health`.

- Ingest nhận raw event của `INTERFACE_COUNTER`, `RADIUS_ACCOUNTING` và `IPFIX_FLOW`.
- Mỗi event có `source`, `observed_at`, `idempotency_key`, payload hoặc `raw_reference`.
- Identity inventory (`ship_id`, `device_id`, `interface_id`) và user identity đều nullable.
- Backend dùng hash payload/reference cùng unique `(source, idempotency_key)` để deduplicate.
- `analytics_processed` luôn là `false` ở Phase 3; chưa có parser, collector, ClickHouse writer, Timescale rollup hoặc reconciliation engine.
- `GET /telemetry/health` trả freshness và trạng thái `UNKNOWN` nếu chưa nhận event, không tạo dữ liệu giả.
