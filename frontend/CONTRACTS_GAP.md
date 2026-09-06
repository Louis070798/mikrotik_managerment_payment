# Frontend contract status — OpenAPI v1.4.0

Frontend Phase 5B đã regenerate typed client trực tiếp từ `contracts/openapi.yaml` v1.4.0. Không có URL hoặc field ngoài contract được thêm vào giao diện.

## Tab đã nối

- Overview, Global, Area và WAN/Reconciliation.
- Interfaces: `GET /ships/{shipId}/interfaces`.
- CREW:
  - `GET /ships/{shipId}/crew/users`
  - `GET /ships/{shipId}/crew/users/{username}/sessions`
  - `GET /ships/{shipId}/crew/radius-health`
  - `GET /ships/{shipId}/crew/raw-accounting`
- BUSINESS:
  - `GET /ships/{shipId}/business/devices`
  - `GET /ships/{shipId}/business/usage`
  - `GET /ships/{shipId}/business/flows`
  - `GET /ships/{shipId}/business/flows/unknown`
  - `GET /ships/{shipId}/business/raw-records`
- Traffic Flow: dùng đúng nhóm `BUSINESS` flow endpoint ở trên; không gọi URL generic `/ships/{shipId}/flows/summary` vì contract không có route này.
- Devices: `GET /devices?ship_id={shipId}`.
- Health & Events:
  - `GET /health/summary`
  - `GET /health/ha`
  - `GET /telemetry/health`
  - `GET /alerts`

## Gap còn lại

Frontend đã nối API nhưng dữ liệu thật vẫn phụ thuộc backend pipeline. Các phần sau chưa có API/implementation vận hành đầy đủ trong contract hoặc backend:

- Collector MikroTik thật cho interface counters/SNMP/API polling.
- RADIUS accounting receiver thật và nguồn raw accounting liên tục.
- IPFIX receiver thật, raw flow store và classifier domain/IP/ASN/TLS-SNI.
- Reconciliation engine hoàn chỉnh cho WAN/Ethernet/CREW/BUSINESS.
- Configuration revision, diff, apply, rollback và staged rollout cho thiết bị.
- Backup/restore history, backup freshness, restore point và restore job.

## Quy tắc UI

- `null` hiển thị `Not available`, không chuyển thành `0`.
- `AVAILABLE`, `INSUFFICIENT_DATA`, `UNAVAILABLE`, `DEGRADED`, `STALE` được hiển thị riêng.
- CREW dùng username/RADIUS identity; `service_usage` và `domain_usage` null hiển thị `Not available`.
- BUSINESS chỉ dùng IP/MAC/VLAN/device identity; không suy diễn username.
- Mỗi metric có period, unit, source, freshness và data-quality context.
- Mock chỉ dùng khi `VITE_USE_MOCK_API=true`; production không tự động bật mock khi biến không được đặt.
