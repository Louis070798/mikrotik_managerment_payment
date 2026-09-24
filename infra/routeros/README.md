# Cấu hình RouterOS cho đội tàu

## Có gì ở đây

| File | Dùng khi nào |
|---|---|
| `fleet-crew-accounting.rsc` | Bản A — giữ nguyên bridge `CREW` / `BUSINESS` hiện có, chỉ thêm lớp đo đếm và quy kết. Áp được lên tàu đang chạy, không cần đổi switch hay AP. |

## Mục tiêu

Mọi byte của thuyền viên phải quy được về một dòng:

```
username · tên miền · nhóm dịch vụ · số byte · thời điểm
```

Điều này cần **bốn dòng dữ liệu** cùng tồn tại, phát ra từ cùng một router:

| # | Dòng dữ liệu | Trả lời câu hỏi | Cổng |
|---|---|---|---|
| ① | RADIUS accounting | ai, và bao nhiêu | UDP 1813 |
| ② | NetFlow v9 trên interface CREW | ai tới IP nào | UDP 2055 |
| ③ | Log DNS | IP đó là trang nào | UDP 5514 |
| ④ | Interface counter push | số thật tại cổng, để đối soát | HTTPS |

Thiếu bất kỳ dòng nào thì dashboard vẫn có số byte, nhưng mất khả năng trả lời
"vào trang nào" hoặc "của ai".

## Trước khi áp lên một tàu

1. Backup: `/system backup save name=truoc-fleet`
2. Khai báo thiết bị trên portal, lấy `device_id`
3. `POST /devices/{id}/radius-secret` → lấy shared secret (riêng từng tàu)
4. `POST /devices/{id}/push-key` → lấy API key push (riêng từng tàu)
5. Xác nhận `devices.ip_address` **bằng đúng IP ZeroTier của router** — collector
   nhận diện thiết bị bằng IP nguồn của gói UDP, sai field này là mọi dữ liệu
   đều bị bỏ qua mà không báo lỗi.

## Áp cấu hình — dán vào terminal

Mở Winbox > New Terminal (hoặc SSH vào router), rồi **dán từng khối một**, theo
thứ tự 0 → 9. Sau mỗi khối xem có dòng lỗi đỏ không rồi mới dán khối tiếp theo.

- **Khối 0 bắt buộc dán trước và dán trọn vẹn** — các khối sau dùng biến của nó.
- File dùng `:global` chứ không phải `:local`: trong terminal RouterOS mỗi dòng là
  một ngữ cảnh riêng, biến `:local` chết ngay khi hết dòng đó.
- Mỗi lệnh nằm gọn trên một dòng. Đừng tự xuống dòng giữa chừng.
- Mỗi khối kết thúc bằng một dòng `:put "FLEET | khối N xong"` để biết đã chạy tới đâu.

Muốn chạy bằng file thì `/import file=fleet-crew-accounting.rsc` cũng được — cùng
một file, không cần sửa gì.

File idempotent — chạy lại không nhân đôi rule.

## Ba thay đổi dễ bị bỏ sót nhất

- **Chặn DoH/DoT.** Chrome và Android bật DNS mã hoá mặc định. Không chặn thì
  tên miền biến mất hoàn toàn khỏi log, byte vẫn đúng nhưng dashboard chỉ còn "Khác".
- **NetFlow phải xuất trên interface CREW, không chỉ trên WAN.** Flow ở WAN là sau
  NAT — mọi thuyền viên mang chung một IP nguồn, không tách được ai.
- **Tắt FastTrack.** FastTrack đưa gói đi tắt khỏi connection tracking, Traffic Flow
  đếm thiếu và gap phình ra mà không có lý do nào giải thích được.

## Nghiệm thu

Mục 10 trong file `.rsc` liệt kê 7 lệnh kiểm tra. Quan trọng nhất là (b): xác nhận
`/log print where topics~"dns"` sinh **đủ cả hai** dạng dòng `dns query from ...`
và `dns done query: ...`. Một số bản RouterOS chỉ sinh dòng thứ hai nếu không bật
thêm mức debug — khi đó chỉ tra cứu được ở tầng 2 với độ tin cậy 0.70 thay vì 0.95.

## Chưa làm được bằng kỹ thuật

- VPN cá nhân của thuyền viên: chỉ thấy một đích duy nhất là máy chủ VPN.
- Kết nối thẳng bằng IP (app, game, IoT): không có truy vấn DNS để tra. Cần
  catalog IP/ASN — chưa có.
- Nội dung bên trong HTTPS: không đọc được, và hệ thống không đoán.

Phạm vi thu thập là metadata (tên miền, nhóm dịch vụ, byte, thời điểm). Nên công bố
trong nội quy sử dụng mạng cho thuyền viên trước khi bật.
