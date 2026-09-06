# Risk Register v0.1

**Liên quan:** [01-BACKEND_DESIGN.md](01-BACKEND_DESIGN.md) · [02-DATABASE_DESIGN.md](02-DATABASE_DESIGN.md) · [03-API_DESIGN.md](03-API_DESIGN.md)

> Xếp theo mức độ ảnh hưởng nếu bỏ qua, không theo thứ tự bảng chữ cái. Mỗi rủi ro có: vì sao xảy ra, hậu quả cụ thể, và mitigation đã được đưa vào thiết kế ở đâu (hoặc còn để ngỏ).

---

## Nhóm A — Sai số liệu mà không ai biết là sai (nguy hiểm nhất)

### R-01 — FastTrack bypass Traffic Flow

**Vì sao xảy ra.** RouterOS FastTrack (`ip firewall filter action=fasttrack-connection`) tăng throughput bằng cách cho traffic đi qua nhanh, bỏ qua phần lớn xử lý ở layer cao hơn — bao gồm Traffic Flow export. Đây là cấu hình phổ biến vì lý do hiệu năng, nhưng spec chưa nói có bật trên CREW/BUSINESS hay không (khoảng trống G2).

**Hậu quả.** Nếu FastTrack bật trên CREW/BUSINESS, IPFIX chỉ thấy một phần nhỏ traffic thật. Mọi con số ở dashboard Traffic Flow và phần lớn phân loại category/domain trở nên vô nghĩa, trong khi dashboard vẫn hiển thị số liệu như thể đầy đủ — không có cách nào tự phát hiện từ phía collector.

**Mitigation trong thiết kế.** ADR-11 có mã `FASTTRACK_BYPASS` trong `gap_reasons`, và commissioning checklist (`HARDWARE_ZEROTIER_FLOW §6` bước 4-9) phải kiểm tra `ip firewall filter print` để xác nhận FastTrack tắt trên CREW/BUSINESS trước khi bật IPFIX.

**Còn để ngỏ.** Đây là quyết định vận hành, không phải quyết định code — cần bạn xác nhận (Q2 ở §8 của tài liệu 01).

---

### R-02 — IPFIX export sai vị trí làm mất client IP

**Vì sao xảy ra.** Nếu Traffic Flow được cấu hình export tại interface WAN (sau khi NAT đã đổi source IP thành IP WAN), collector chỉ thấy một IP duy nhất cho toàn bộ CREW/BUSINESS. Identity correlation (ADR-12) không còn gì để join.

**Hậu quả.** `classified_flows.client_ip` sẽ toàn là IP WAN, `identity_bindings` không match được, mọi usage theo user sụp đổ về "unknown".

**Mitigation.** Traffic Flow phải export tại interface CREW_ACCESS/BUSINESS_ACCESS (pre-NAT), không phải tại WAN_INPUT. Ghi rõ trong commissioning checklist, và có test tự động trong `MikrotikSimulator` kiểm tra flow nhận được có client_ip nằm trong dải CREW/BUSINESS chứ không phải dải WAN.

---

### R-03 — Counter 32-bit wrap làm sai lệch nghiêm trọng ở tốc độ cao

**Vì sao xảy ra.** SNMP `ifInOctets`/`ifOutOctets` chuẩn là 32-bit. Ở 1 Gbps, counter này wrap sau khoảng 34 giây. Poll interval 60 giây (phổ biến) khiến counter wrap nhiều lần giữa hai lần poll — delta tính ra hoàn toàn sai, không phải chỉ là "hơi lệch".

**Hậu quả.** WAN throughput hiển thị sai theo cấp số nhân ở link tốc độ cao (fiber, LTE tốt). Đối soát dựa trên số sai sẽ ra gap giả.

**Mitigation.** ADR-10 bắt buộc dùng `ifHCInOctets`/`ifHCOutOctets` (64-bit). Nếu thiết bị không hỗ trợ, đánh dấu `counter_source = UNRELIABLE` và loại khỏi đối soát thay vì âm thầm tính sai.

**Còn để ngỏ.** Cần kiểm tra thực tế model MikroTik nào trong fleet có hỗ trợ HC counter qua SNMP — một số model cũ/entry-level có thể không có. Đây là mục cần điền vào bảng "thông tin cần thu thập trước khi chọn thiết bị" của `HARDWARE_ZEROTIER_FLOW §3.3`.

---

### R-04 — IP reuse làm gán nhầm usage giữa hai người dùng

**Vì sao xảy ra.** DHCP lease ngắn (phổ biến trên tàu để tiết kiệm địa chỉ) khiến một IP được cấp lại cho thiết bị khác trong vài phút. Nếu identity correlation join flow với user chỉ theo IP mà không xét khoảng thời gian hiệu lực, user B sẽ bị tính usage của user A.

**Hậu quả.** Đây là loại lỗi nguy hiểm nhất vì nó không gây crash, không gây gap lớn bất thường — nó âm thầm gán sai usage, và chỉ lộ ra khi có khiếu nại "tôi không dùng nhiều vậy" mà không điều tra được nguyên nhân nếu không có timeline join.

**Mitigation.** ADR-12 — `identity_bindings` là bảng temporal với exclusion constraint (`02-DATABASE_DESIGN.md §3.3`) chặn hai binding cùng nguồn chồng lấn thời gian trên cùng IP. `valid_to` phải đóng ngay khi có `Acct-Stop` hoặc DHCP release. Mọi query join đều bắt buộc qua điều kiện thời gian.

**Còn để ngỏ.** Cần xác nhận DHCP lease time thực tế trên các tàu — lease càng ngắn thì rủi ro overlap càng cao, và có thể cần giảm interim update interval để rút ngắn cửa sổ sai lệch.

---

### R-05 — Double counting khi topology bridge/VLAN thay đổi ngoài API

**Vì sao xảy ra.** `SYSTEM_SPEC §6.1` cấm cộng đồng thời bridge, VLAN và port thành viên. Nhưng người vận hành có thể thêm bridge member trực tiếp trên router (qua WinBox, ngoài luồng API) mà không đi qua `PATCH /interfaces/{id}/assign-zone`. Trigger database (ADR-10) chỉ chặn được thay đổi đi qua API.

**Hậu quả.** Counter bị cộng hai lần, WAN/CREW/BUSINESS bị tính vượt.

**Mitigation.** ADR-10 có job kiểm tra định kỳ toàn fleet, không chỉ dựa vào trigger tại thời điểm ghi. Job này đọc topology thật từ thiết bị qua `DeviceGateway` và so với `interfaces.accounting_group` đã khai báo, sinh alert `CONFIG_DRIFT` nếu lệch.

---

### R-06 — Gigawords bị bỏ qua làm session lớn tính sai

**Vì sao xảy ra.** RADIUS attribute `Acct-Input-Octets`/`Acct-Output-Octets` chỉ 32-bit; phần vượt 4GB nằm ở `Acct-Input-Gigawords`/`Acct-Output-Gigawords` riêng biệt. Đây là lỗi kinh điển khi ai đó viết query mới mà quên cộng gigawords.

**Hậu quả.** Mọi session CREW dùng trên 4GB (rất phổ biến với video streaming) sẽ bị tính thiếu nghiêm trọng.

**Mitigation.** ADR-09 chốt công thức, và `02-DATABASE_DESIGN.md §2.1` tạo view `radacct_usage` là **đường duy nhất** được phép đọc usage — không cho phép code nào query trực tiếp cột thô `acctinputoctets`. Enforce bằng code review checklist và có thể bằng việc revoke quyền SELECT trực tiếp trên cột thô, chỉ cấp quyền qua view.

---

## Nhóm B — Bảo mật và tuân thủ

### R-07 — HotSpot CHAP buộc lưu password khôi phục được

**Vì sao xảy ra.** Xem ADR-08 / khoảng trống G1. Đây là mâu thuẫn giữa hành vi mặc định của RouterOS HotSpot và yêu cầu bảo mật của spec.

**Hậu quả nếu không xử lý đúng.** Nếu implement vội mà không có quyết định rõ ràng, rất dễ rơi vào tình huống lưu password RADIUS ở dạng plaintext hoặc NT-hash mà không có kiểm soát truy cập tương xứng — vi phạm trực tiếp `SYSTEM_SPEC §13`.

**Mitigation.** ADR-08 đề xuất HTTPS + PAP làm mặc định, cho phép lưu hash một chiều. Đây là **quyết định cần chữ ký người có thẩm quyền bảo mật**, không phải mặc định kỹ thuật âm thầm — đã đánh dấu là Q1 cần bạn chốt.

---

### R-08 — Rò rỉ secret qua log hoặc response API

**Vì sao xảy ra.** Secret dễ vô tình lọt ra qua: log request/response tự động của framework, error message chứa toàn bộ object, hoặc DTO serializer quên loại trừ field mới thêm sau này.

**Hậu quả.** Vi phạm trực tiếp `SYSTEM_SPEC §13` và `AGENT_COLLABORATION §11`. Một secret RADIUS lộ ra có thể bị dùng để giả mạo NAS hoặc đọc trộm traffic CREW.

**Mitigation.** ADR-05: Pino serializer redact theo pattern trước khi ghi log; serializer interceptor dùng allow-list field (không phải deny-list — an toàn hơn khi có field mới); contract test quét toàn bộ response example tìm `secret`, `password`, `private_key`. Ba lớp độc lập vì một lớp duy nhất luôn có thể bị bỏ sót khi code thay đổi.

**Còn để ngỏ.** Cần thêm bước CI: chạy contract test này trên **mọi** response thật (không chỉ example) trong môi trường staging trước khi cho phép merge — việc này chưa được đặc tả chi tiết ở Sprint 0 và nên bổ sung.

---

### R-09 — Retention dữ liệu duyệt web của thuyền viên có thể vướng nghĩa vụ pháp lý

**Vì sao xảy ra.** `raw_dns_events` ghi lại domain mà từng CREW user truy vấn, gắn với identity qua correlation. Đây thực chất là log duyệt web ở mức domain, giữ theo cấu hình retention.

**Hậu quả.** Tùy luật lao động hàng hải và luật bảo vệ dữ liệu cá nhân áp dụng (quốc gia treo cờ, quốc tịch thuyền viên), việc giữ log này có thể cần thông báo cho thuyền viên, có thể có giới hạn thời gian giữ, và có thể cần quy trình xóa theo yêu cầu.

**Mitigation trong thiết kế.** Retention là cấu hình được (`02-DATABASE_DESIGN.md §5`), không hard-code — cho phép điều chỉnh theo yêu cầu pháp lý cụ thể. Nhưng **đây không phải vấn đề kỹ thuật có thể tự giải quyết** — cần tư vấn pháp lý về nghĩa vụ thông báo và retention tối đa trước khi Phase 4 lên production thật.

---

### R-10 — RadSec certificate management chưa có quy trình

**Vì sao xảy ra.** ADR-08 khuyến nghị nâng cấp lên RadSec (RADIUS over TLS) khi có thể. `SYSTEM_SPEC §13` cũng đề cập RadSec cho mạng không tin cậy. Nhưng certificate lifecycle (issue, rotate, revoke, CN/SAN matching per-NAS) chưa có thiết kế chi tiết.

**Hậu quả.** Nếu triển khai vội, certificate hết hạn không ai theo dõi có thể làm gãy RADIUS toàn fleet cùng lúc — một single point of failure mới do chính giải pháp bảo mật tạo ra.

**Mitigation.** Ở MVP, dùng UDP RADIUS trong ZeroTier overlay (đã có network-layer encryption) làm bước đệm; hoãn RadSec tới Phase 5 khi có quy trình quản lý certificate rõ ràng, có alert khi certificate sắp hết hạn.

---

## Nhóm C — Vận hành và độ tin cậy hạ tầng

### R-11 — ZeroTier bị chặn bởi device-mode hoặc không hỗ trợ kiến trúc

**Vì sao xảy ra.** `HARDWARE_ZEROTIER_FLOW §3.3` ghi rõ ZeroTier trên RouterOS chỉ hỗ trợ ARM/ARM64 trong v7, và có thể bị tắt bởi `device-mode`. Một số model MikroTik phổ biến (MIPS-based, entry-level) không thuộc kiến trúc này.

**Hậu quả.** Không thể dùng ZeroTier làm overlay quản trị cho những thiết bị đó — toàn bộ mô hình kết nối ở `HARDWARE_ZEROTIER_FLOW §2` không áp dụng được.

**Mitigation.** Đã hỏi Q4 trong `01-BACKEND_DESIGN.md §8`: thiết kế transport-agnostic cho `service_endpoints` và `DeviceGateway` để dễ dàng thêm WireGuard làm phương án dự phòng mà không đổi kiến trúc. Cần kiểm kê kiến trúc thực tế của fleet trước khi cam kết ZeroTier là giải pháp duy nhất.

---

### R-12 — VSAT latency cao làm health check và job timeout sai

**Vì sao xảy ra.** VSAT có RTT phổ biến 600-800ms, có lúc cao hơn nhiều khi thời tiết xấu. Timeout mặc định thiết kế theo giả định mạng đất liền (vài trăm ms) sẽ trigger false positive liên tục trên tàu dùng VSAT.

**Hậu quả.** Alert `RADIUS_FAILURE` hoặc `DEVICE_UNREACHABLE` giả liên tục, gây "alert fatigue" — người vận hành bắt đầu bỏ qua alert thật vì quá nhiều alert giả.

**Mitigation.** `service_endpoints.timeout_ms` là cấu hình per-endpoint, nên set riêng cho tàu dùng VSAT (`MikrotikSimulator` có `--latency=800ms` để test đúng kịch bản này, §4 lớp 2 của tài liệu 01). `alert_rules.for_seconds` (chống nhấp nháy) cũng cần tune riêng theo loại kết nối WAN của tàu.

**Còn để ngỏ.** Cần bộ giá trị timeout mặc định theo loại WAN (`wan_links.kind`), chưa thiết kế chi tiết — nên làm ở Sprint 1 khi có dữ liệu RTT thật từ simulator.

---

### R-13 — User Manager không đồng bộ realtime giữa các node

**Vì sao xảy ra.** Đã phân tích ở ADR-07. Nếu vô tình chọn Model A (User Manager primary/standby) thay vì Model B, RPO RADIUS config sẽ bị giới hạn bởi chu kỳ backup `.umb`, không đạt `SYSTEM_SPEC §8.6`.

**Mitigation.** Đã chọn Model B (FreeRADIUS + SQL) làm mặc định trong ADR-07. Rủi ro còn lại là vận hành FreeRADIUS đòi hỏi kỹ năng khác với quản trị RouterOS thuần túy — cần đào tạo hoặc thuê ngoài nếu team chưa có kinh nghiệm FreeRADIUS.

---

### R-14 — Backup "thành công" nhưng không restore được

**Vì sao xảy ra.** Một hàng trong `device_backups` báo `SUCCESS` chỉ chứng minh rằng thao tác ghi đã hoàn tất, không chứng minh file còn nguyên vẹn hoặc còn khôi phục được. Bit rot, lỗi ghi một phần, hoặc thay đổi format giữa các version RouterOS đều có thể làm backup vô dụng mà không ai biết cho tới khi cần dùng.

**Hậu quả.** Đây là kịch bản tệ nhất: tưởng có backup, tới lúc cần rollback khẩn cấp thì backup hỏng — đúng lúc router đang gặp sự cố và cần phục hồi nhanh nhất.

**Mitigation.** `SYSTEM_SPEC §8.4` đã yêu cầu "test restore tự động". `02-DATABASE_DESIGN.md §1.4` có cột `restore_tested_at`/`restore_test_result`, và `§15` acceptance criteria yêu cầu "có kiểm thử restore thành công". Job `RESTORE_TEST` chạy định kỳ, không phải một lần khi tạo backup.

---

### R-15 — Deferred rollback scheduler tự nó có thể là điểm hỏng

**Vì sao xảy ra.** ADR-06 dùng `/system scheduler` trên chính router để tự restore nếu job apply làm mất đường quản trị. Nhưng nếu job apply config đó **chính là thứ vô hiệu hóa scheduler** (ví dụ đổi RouterOS clock, hoặc named script bị conflict), cơ chế tự cứu này thất bại đúng lúc cần nhất.

**Hậu quả.** Mất hoàn toàn khả năng rollback từ xa, phải cử người ra tàu — chi phí rất cao với fleet phân tán trên biển.

**Mitigation.** Test case bắt buộc trong `MikrotikSimulator` (`--fail=partial-apply`) phải bao gồm kịch bản scheduler bị vô hiệu hóa giữa chừng. Đồng thời `HARDWARE_ZEROTIER_FLOW §10` đã có nguyên tắc "luôn giữ local recovery path" — đây là lớp phòng thủ thứ hai không phụ thuộc vào chính config đang được thay đổi.

---

### R-16 — Job kẹt khi worker chết giữa chừng (không có lease hoặc lease sai)

**Vì sao xảy ra.** Nếu không có cơ chế lease, một worker crash giữa lúc đang apply config sẽ để job kẹt ở `RUNNING` mãi mãi — không ai biết job đã chết hay đang chạy chậm.

**Hậu quả.** Router có thể ở trạng thái cấu hình dở dang, và không job nào khác được phép chạy trên thiết bị đó (nếu có lock theo device) vì hệ thống nghĩ job cũ vẫn đang chạy.

**Mitigation.** `02-DATABASE_DESIGN.md §1.5` có `lease_owner`/`lease_expires_at`. Nhưng cần lưu ý: worker nhận lại job sau khi lease hết hạn phải **kiểm tra state thật trên thiết bị trước khi resume**, không được giả định state theo bước cuối cùng đã ghi — vì có thể bước đó đã thực thi trên router nhưng chưa kịp ghi kết quả trước khi crash.

---

### R-17 — Redis là SPOF cho cache registry, lock và SSE dù không phải nguồn sự thật

**Vì sao xảy ra.** ADR-03/ADR-04 dùng Redis cho cache endpoint, circuit breaker state, distributed lock (leader election), và SSE fan-out. Redis chết không làm mất dữ liệu (vì không phải nguồn sự thật), nhưng làm **toàn bộ control plane mất khả năng phối hợp** cùng lúc.

**Hậu quả.** ServiceRegistry cache miss liên tục dồn tải lên Postgres; scheduler mất leader election có thể chạy trùng; SSE ngắt kết nối toàn bộ Frontend.

**Mitigation.** `docker-compose.ha.yml` (Sprint 5) nên có Redis Sentinel hoặc cluster tối thiểu 3 node thay vì Redis đơn. Ở Phase 1-4 (MVP nhỏ), chấp nhận Redis đơn nhưng phải có health check riêng cho Redis và alert `DATABASE_FAILURE`-tương-đương khi Redis down, để vận hành biết ngay thay vì suy luận qua triệu chứng gián tiếp.

**Còn để ngỏ.** Chưa thiết kế chi tiết fallback khi Redis down hoàn toàn — ví dụ ServiceRegistry có nên fallback đọc thẳng Postgres (chậm hơn nhưng vẫn đúng) hay từ chối resolve. Nên chốt ở Sprint 1.

---

### R-18 — NATS JetStream buffer 24h không đủ nếu ClickHouse chết lâu hơn dự kiến

**Vì sao xảy ra.** ADR-03 thiết kế buffer 24 giờ dựa trên giả định "sự cố ClickHouse thường được xử lý trong vài giờ". Một sự cố nghiêm trọng hơn (disk hỏng, cần restore từ backup) có thể mất hơn 24 giờ.

**Hậu quả.** Buffer đầy, JetStream bắt đầu drop message cũ nhất, dẫn tới mất raw telemetry vĩnh viễn cho khoảng thời gian đó — vi phạm RPO `SYSTEM_SPEC §8.6`.

**Mitigation.** Collector có WAL fallback ra local disk (ADR-03) như lớp phòng thủ thứ hai. Nhưng WAL cũng có capped size. Cần alert sớm (`collector.ipfix` health check báo `queue_depth` cao) để con người can thiệp trước khi chạm giới hạn, không chỉ dựa vào buffer tự động.

---

## Nhóm D — Rủi ro về độ chính xác của chính engine đối soát

### R-19 — Bộ quy tắc quy kết gap có thể "quy kết nhầm" và che giấu vấn đề thật

**Vì sao xảy ra.** ADR-11 dùng một chuỗi quy tắc heuristic để giải thích gap (`DEVICE_NOT_LOGGED_IN`, `BROADCAST_MULTICAST`, ...). Heuristic có thể sai theo hướng nguy hiểm nhất: gán một gap thực sự đáng ngờ (ví dụ rò rỉ traffic, hoặc lỗi cấu hình NAT) vào một lý do nghe có vẻ vô hại.

**Hậu quả.** Dashboard trông "sạch" trong khi có vấn đề thật đang bị che bởi một `gap_reason` sai.

**Mitigation.** `unattributed_bytes` luôn hiển thị công khai (§4 của `03-API_DESIGN.md`) — đây là van an toàn: dù quy tắc có sai ở đâu đó, phần không giải thích được vẫn lộ ra thay vì bị quy tắc "nuốt" hết. `confidence` trên từng gap_reason cho phép người vận hành lọc theo độ tin cậy thấp để soát lại bằng tay.

**Còn để ngỏ.** Chưa có cơ chế "báo cáo sai" — nơi người vận hành đánh dấu một `gap_reason` là gán sai, để cải thiện heuristic theo thời gian. Nên cân nhắc thêm ở Phase 4-5.

---

### R-20 — Exit criteria "sai số dưới 1%, gán đúng 80%" chưa có dataset chuẩn để đo

**Vì sao xảy ra.** `01-BACKEND_DESIGN.md §5 Phase 2` đặt ra ngưỡng số cụ thể, nhưng dataset tổng hợp "có đáp án biết trước" (§4 lớp 3) chưa được thiết kế chi tiết — nó cần mô phỏng đúng các tình huống gap thật (management traffic, broadcast, user chưa login...) với tỷ lệ thực tế, không phải dữ liệu ngẫu nhiên.

**Hậu quả.** Nếu dataset test không đại diện cho thực tế, engine có thể "đạt" exit criteria trên dataset giả nhưng vẫn sai nhiều khi gặp dữ liệu tàu thật.

**Mitigation.** Đã đưa vào Sprint 2 làm việc cần làm, nhưng thiết kế chi tiết bộ dataset (bao nhiêu % traffic thuộc mỗi loại gap, phân bố theo giờ trong ngày...) chưa có — cần một phiên thiết kế riêng trước khi Sprint 2 bắt đầu, có thể cần tham khảo dữ liệu vận hành thực tế nếu có tàu đang chạy hệ thống cũ.

---

### R-21 — Classification chỉ dựa DNS/IP/port có tỷ lệ "unknown" cao với traffic hiện đại

**Vì sao xảy ra.** `SYSTEM_SPEC §5.4` đã tự nhận thức giới hạn này: không cam kết nhận diện nội dung HTTPS. Với xu hướng DNS-over-HTTPS (DoH), Encrypted Client Hello (ECH) ngày càng phổ biến, ngay cả DNS domain và TLS SNI cũng có thể không quan sát được.

**Hậu quả.** Tỷ lệ `unknown_reason = ENCRYPTED_SNI` hoặc traffic không phân loại được có thể cao hơn kỳ vọng, làm dashboard Traffic Flow kém hữu ích hơn dự kiến ban đầu.

**Mitigation.** Contract đã thiết kế để "unknown" là hạng mục hạng nhất (`/flows/unknown` trong `03-API_DESIGN.md §7`), không bị che giấu. Đây là giới hạn cố hữu của phương pháp, không phải lỗi implementation — cần set kỳ vọng đúng với người dùng cuối ngay từ đầu.

---

### R-22 — Rollup từ raw sang aggregate có thể lệch nếu reprocess xảy ra sau khi đã rollup

**Vì sao xảy ra.** ADR-02 quy định `ClickHouse (raw) → rollup job → Timescale (aggregate)`. Nếu raw được reprocess với `parser_version` mới (ví dụ sửa lỗi parser IPFIX) **sau khi** rollup đã chạy và aggregate đã được dùng để tính `wan_reconciliation_hourly`, thì aggregate cũ trở nên lỗi thời nhưng không có gì báo cho biết.

**Hậu quả.** Dashboard hiển thị số liệu tính từ dữ liệu đã bị coi là sai (đó là lý do mới reprocess), nhưng không ai biết cần refresh.

**Mitigation.** `wan_reconciliation_hourly.engine_version` và `raw_*.parser_version` (`02-DATABASE_DESIGN.md §3.4`, `§4.1`) cho phép nhận diện. Cần bổ sung: job `RAW_REPROCESS` khi hoàn tất phải tự động trigger `AGGREGATE_REBUILD` cho đúng khoảng thời gian bị ảnh hưởng, không để hai job này độc lập nhau. Đây là điểm cần làm rõ trong thiết kế chi tiết Phase 4, hiện mới dừng ở việc liệt kê hai loại job riêng biệt trong `jobs.type`.

---

## Bảng tổng hợp theo mức ưu tiên xử lý

| Rủi ro | Nhóm | Mức độ | Đã có mitigation thiết kế | Cần quyết định thêm |
|---|---|---|---|---|
| R-01 FastTrack bypass | A | Cao | Có (mã gap_reason) | Q2 — có xác nhận |
| R-02 IPFIX sai vị trí export | A | Cao | Có (checklist + test) | — |
| R-03 Counter 32-bit wrap | A | Cao | Có (bắt buộc HC64) | Kiểm kê model thật |
| R-04 IP reuse gán nhầm user | A | Cao | Có (exclusion constraint) | Kiểm tra lease time thật |
| R-05 Double counting ngoài API | A | Trung bình | Có (job quét định kỳ) | — |
| R-06 Gigawords bị bỏ qua | A | Cao | Có (view bắt buộc) | — |
| R-07 HotSpot CHAP/PAP | B | Rất cao | Có (ADR-08) | **Q1 — bắt buộc chốt trước Sprint 0** |
| R-08 Rò rỉ secret | B | Cao | Có (3 lớp) | Bổ sung CI staging scan |
| R-09 Nghĩa vụ pháp lý DNS log | B | Cao | Một phần (retention cấu hình được) | **Cần tư vấn pháp lý** |
| R-10 RadSec certificate | B | Trung bình | Hoãn tới Phase 5 | — |
| R-11 ZeroTier device-mode | C | Cao | Một phần (transport-agnostic) | **Q4 — kiểm kê kiến trúc fleet** |
| R-12 VSAT latency false alert | C | Trung bình | Một phần (timeout cấu hình được) | Bộ giá trị mặc định theo WAN kind |
| R-13 User Manager không sync | C | Cao | Có (chọn Model B) | — |
| R-14 Backup không restore được | C | Rất cao | Có (restore test job) | — |
| R-15 Deferred rollback tự hỏng | C | Cao | Một phần (test case) | — |
| R-16 Job kẹt do worker chết | C | Trung bình | Có (lease) | Xác nhận resume phải verify state thật |
| R-17 Redis SPOF | C | Trung bình | Một phần (HA ở Phase 5) | Fallback khi Redis down ở MVP |
| R-18 JetStream buffer tràn | C | Trung bình | Có (WAL fallback) | Alert sớm trước khi tràn |
| R-19 Quy kết gap sai | D | Cao | Một phần (unattributed_bytes) | Cơ chế phản hồi/hiệu chỉnh |
| R-20 Exit criteria chưa có dataset chuẩn | D | Cao | Chưa | **Thiết kế dataset trước Sprint 2** |
| R-21 Tỷ lệ unknown cao | D | Thấp | Có (set kỳ vọng qua contract) | — |
| R-22 Rollup lệch sau reprocess | D | Trung bình | Một phần | Liên kết job REPROCESS → REBUILD |

**Bốn rủi ro cần quyết định của bạn trước khi Sprint 0 kết thúc:** R-07 (Q1), R-01 (Q2), R-11 (Q4), và R-09 (tư vấn pháp lý, không phải câu hỏi kỹ thuật). R-20 cần một phiên thiết kế riêng trước khi Sprint 2 bắt đầu.
