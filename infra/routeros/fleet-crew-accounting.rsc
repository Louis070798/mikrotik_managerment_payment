# =============================================================================
#  FLEET MIKROTIK — CAU HINH DO DEM & QUY KET LUU LUONG CREW
#  Ban A: giu nguyen bridge CREW / BUSINESS hien co (khong doi sang VLAN)
#
#  Muc tieu: moi byte cua thuyen vien phai quy duoc ve mot dong
#            username · ten mien · nhom dich vu · so byte · thoi diem
#            tren server trung tam.
#
#  RouterOS : v7.x
#  Chay     : /import file=fleet-crew-accounting.rsc
#  An toan  : moi khoi deu idempotent (chay lai khong nhan doi rule).
#             Backup truoc khi chay: /system backup save name=truoc-fleet
#
#  LUU Y khi /import bao loi cu phap o khoi script (muc 8):
#  mo Winbox > System > Scripts, dan tay phan source cua script do.
# =============================================================================


# =============================================================================
#  0. DOI 8 GIA TRI NAY CHO TUNG TAU — phan con lai giu nguyen
# =============================================================================

:local btServer  "172.29.172.3"      ;# IP ZeroTier cua backend (RADIUS + collector + API)
:local btPort    "3000"              ;# cong HTTP cua backend API
:local ztSrc     "172.29.163.95"     ;# IP ZeroTier CUA ROUTER NAY — phai trung devices.ip_address
:local crewIf    "CREW"              ;# interface/bridge mang thuyen vien
:local bizIf     "BUSINESS"          ;# interface/bridge mang nghiep vu
:local wanIf     "wan1"              ;# interface WAN chinh
:local crewNet   "192.168.6.0/24"
:local bizNet    "192.168.20.0/24"
:local crewGw    "192.168.6.1"
:local bizGw     "192.168.20.1"

# Lay tu backend, RIENG cho tung tau — khong dung chung giua cac tau:
#   POST /devices/{id}/radius-secret  -> radSecret
#   POST /devices/{id}/push-key       -> pushKey
:local deviceId  "00000000-0000-0000-0000-000000000000"
:local radSecret "DOI-SECRET-RIENG-CHO-TAU-NAY"
:local pushKey   "DOI-PUSH-KEY-RIENG-CHO-TAU-NAY"

# RADIUS thu hai (HA). De trong neu tau nay chua co RADIUS-02.
:local btServer2 ""

:log info "FLEET: bat dau ap cau hinh do dem CREW"


# =============================================================================
#  1. DNS — ep ve resolver cua router va bat log truy van
#     Day la mat xich quyet dinh cau hoi "vao trang nao".
# =============================================================================

/ip/dns/set allow-remote-requests=yes cache-size=10240KiB cache-max-ttl=1d

# DHCP phai tro DNS ve router, khong tro thang 8.8.8.8.
:if ([:len [/ip/dhcp-server/network/find address=$bizNet]] > 0) do={
  /ip/dhcp-server/network/set [find address=$bizNet] dns-server=$bizGw
} else={
  /ip/dhcp-server/network/add address=$bizNet gateway=$bizGw dns-server=$bizGw comment="FLEET"
}
:if ([:len [/ip/dhcp-server/network/find address=$crewNet]] > 0) do={
  /ip/dhcp-server/network/set [find address=$crewNet] dns-server=$crewGw
} else={
  /ip/dhcp-server/network/add address=$crewNet gateway=$crewGw dns-server=$crewGw comment="FLEET"
}

# Firefox tu tat DNS-over-HTTPS khi ten mien canary tra ve NXDOMAIN.
# Day la co che chinh thuc cua Mozilla cho mang co quan ly — re hon moi cach chan khac.
:if ([:len [/ip/dns/static/find name="use-application-dns.net"]] = 0) do={
  /ip/dns/static/add name="use-application-dns.net" type=NXDOMAIN comment="FLEET: tat DoH Firefox"
}


# =============================================================================
#  2. EP MOI TRUY VAN DNS VE ROUTER (dstnat redirect cong 53)
#     Khong co khoi nay, may khach cau hinh DNS tay van thoat ra ngoai
#     va he thong mat ten mien cua dung nhung nguoi do.
#
#     place-before=0: phai chay TRUOC rule dong cua HotSpot.
# =============================================================================

:if ([:len [/ip/firewall/nat/find comment="FLEET: ep DNS CREW udp"]] = 0) do={
  /ip/firewall/nat/add chain=dstnat action=redirect to-ports=53 protocol=udp \
    dst-port=53 in-interface=$crewIf place-before=0 comment="FLEET: ep DNS CREW udp"
}
:if ([:len [/ip/firewall/nat/find comment="FLEET: ep DNS CREW tcp"]] = 0) do={
  /ip/firewall/nat/add chain=dstnat action=redirect to-ports=53 protocol=tcp \
    dst-port=53 in-interface=$crewIf place-before=0 comment="FLEET: ep DNS CREW tcp"
}
:if ([:len [/ip/firewall/nat/find comment="FLEET: ep DNS BUSINESS udp"]] = 0) do={
  /ip/firewall/nat/add chain=dstnat action=redirect to-ports=53 protocol=udp \
    dst-port=53 in-interface=$bizIf place-before=0 comment="FLEET: ep DNS BUSINESS udp"
}
:if ([:len [/ip/firewall/nat/find comment="FLEET: ep DNS BUSINESS tcp"]] = 0) do={
  /ip/firewall/nat/add chain=dstnat action=redirect to-ports=53 protocol=tcp \
    dst-port=53 in-interface=$bizIf place-before=0 comment="FLEET: ep DNS BUSINESS tcp"
}


# =============================================================================
#  3. CHAN DNS MA HOA (DoT / DoH)
#     Chrome va Android bat DNS ma hoa mac dinh. Khong chan thi ten mien
#     bien mat hoan toan khoi log router — byte van dem dung, nhung
#     dashboard chi con "Khac".
#
#     Chi chan cong 443/853 toi cac resolver nay. Cong 53 van di qua muc 2,
#     va router van dung duoc 8.8.8.8 lam upstream (chain output khong bi anh huong).
# =============================================================================

/ip/firewall/address-list/remove [find list=fleet-doh]
:foreach a in={
  "1.1.1.1"; "1.0.0.1";
  "8.8.8.8"; "8.8.4.4";
  "9.9.9.9"; "149.112.112.112";
  "94.140.14.14"; "94.140.15.15";
  "208.67.222.222"; "208.67.220.220";
  "185.228.168.9"; "185.228.169.9";
  "45.90.28.0/22";
  "76.76.2.0/24"; "76.76.10.0/24"
} do={
  /ip/firewall/address-list/add list=fleet-doh address=$a comment="FLEET: resolver DoH/DoT cong khai"
}

# DoT — cong 853, khong co ngoai le hop le nao trong mang tau.
:if ([:len [/ip/firewall/filter/find comment="FLEET: chan DoT 853"]] = 0) do={
  /ip/firewall/filter/add chain=forward action=drop protocol=tcp dst-port=853 \
    in-interface-list=all comment="FLEET: chan DoT 853"
}
# DoH — HTTPS va HTTP/3 toi cac resolver da biet.
:if ([:len [/ip/firewall/filter/find comment="FLEET: chan DoH tcp443"]] = 0) do={
  /ip/firewall/filter/add chain=forward action=drop protocol=tcp dst-port=443 \
    dst-address-list=fleet-doh comment="FLEET: chan DoH tcp443"
}
:if ([:len [/ip/firewall/filter/find comment="FLEET: chan DoH udp443"]] = 0) do={
  /ip/firewall/filter/add chain=forward action=drop protocol=udp dst-port=443 \
    dst-address-list=fleet-doh comment="FLEET: chan DoH udp443"
}


# =============================================================================
#  4. TAT FASTTRACK CHO MANG DUOC DO DEM
#     FastTrack dua goi di tat khoi connection tracking — Traffic Flow
#     dem thieu, gap phinh ra ma khong co ly do nao giai thich duoc.
#     Doi lai: CPU router tang. Voi bang thong VSAT/LTE thi chap nhan duoc.
# =============================================================================

:foreach r in=[/ip/firewall/filter/find action=fasttrack-connection] do={
  /ip/firewall/filter/set $r disabled=yes \
    comment="FLEET: tat de Traffic Flow dem du luu luong CREW"
}


# =============================================================================
#  5. TRAFFIC FLOW (NetFlow v9) — xuat TRUOC NAT
#     Bat tren ca interface CREW/BUSINESS lan WAN.
#     Chi bat o WAN thi moi thuyen vien deu mang chung mot IP nguon sau NAT
#     va khong con tach duoc ai la ai.
#
#     src-address PHAI la IP ZeroTier cua router — collector nhan dien
#     thiet bi bang IP nguon cua goi UDP.
# =============================================================================

/ip/traffic-flow/set enabled=yes interfaces=($crewIf . "," . $bizIf . "," . $wanIf) \
  cache-entries=128k active-flow-timeout=1m inactive-flow-timeout=15s

/ip/traffic-flow/target/remove [find comment="FLEET"]
/ip/traffic-flow/target/add dst-address=$btServer port=2055 version=9 \
  v9-template-refresh=20 v9-template-timeout=1m src-address=$ztSrc comment="FLEET"


# =============================================================================
#  6. GUI LOG DNS VE COLLECTOR (syslog UDP 5514)
#     Backend bocs hai dang dong:
#       "dns query from <ip>:#<id> <domain>"
#       "dns done query: #<id> <domain> <ip>"
#     Ghep lai thanh bang tra IP -> ten mien theo tung may khach.
# =============================================================================

/system/logging/remove [find action="fleet-remote"]
/system/logging/action/remove [find name="fleet-remote"]
/system/logging/action/add name=fleet-remote target=remote remote=$btServer \
  remote-port=5514 src-address=$ztSrc bsd-syslog=yes
/system/logging/add topics=dns action=fleet-remote prefix="fleet"

# KIEM TRA BAT BUOC sau khi ap: chay `/log print where topics~"dns"` va xac nhan
# thay DU CA HAI dang dong o tren. Mot so ban RouterOS chi sinh dong "query from"
# khi bat them muc debug:
#   /system/logging/add topics=dns,debug action=fleet-remote
# Thieu mot trong hai dang dong thi chi con tra cuu tang 2 (do tin cay 0.70).


# =============================================================================
#  7. RADIUS — hai server, accounting va interim update
#     Thu tu khai bao co y nghia: server dau tien duoc goi truoc.
#     CHI HOTSPOT -- he thong khong dung PPPoE, nen khong khai service=ppp va khong dung /ppp aaa.
# =============================================================================

/radius/remove [find comment~"FLEET"]
/radius/add address=$btServer secret=$radSecret service=hotspot \
  src-address=$ztSrc authentication-port=1812 accounting-port=1813 \
  timeout=3s require-message-auth=no comment="FLEET RADIUS-01"

:if ([:len $btServer2] > 0) do={
  /radius/add address=$btServer2 secret=$radSecret service=hotspot \
    src-address=$ztSrc authentication-port=1812 accounting-port=1813 \
    timeout=3s require-message-auth=no comment="FLEET RADIUS-02 du phong"
}

# Cho phep NOC ngat phien tu dashboard (CoA/Disconnect — RFC 5176).
# Khong bat thi moi lenh disconnect deu tra ve TIMEOUT.
/radius/incoming/set accept=yes port=3799

# HotSpot phai bat accounting va interim update.
# Khong co interim, quota chi cap nhat luc dang xuat — mat dien giua chung la mat so lieu phien.
# [find] chu KHONG phai [find use-radius=yes]: loc theo use-radius=yes thi khi chua profile nao bat
# RADIUS, lenh nay khop 0 dong va khong lam gi ca — hotspot van xac thuc noi bo, khong goi nao len server.
/ip/hotspot/profile/set [find] use-radius=yes radius-accounting=yes radius-interim-update=5m


# =============================================================================
#  8. SCRIPT DAY INTERFACE COUNTER VE BACKEND
#     Nguon so lieu cho doi soat WAN <-> CREW <-> BUSINESS (cong thuc §5.3).
#
#     Ghi chu ky thuat: JSON can ky tu { va }, nhung hai ky tu do se lam lech
#     bo dem ngoac cua trinh phan tich script. Nen dung ma hex \7B va \7D.
# =============================================================================

/system/script/remove [find name="fleet-config"]
/system/script/add name="fleet-config" policy=read,test \
  source=(":global fleetUrl \"http://" . $btServer . ":" . $btPort . "/api/v1/devices/" . $deviceId . "/telemetry-push\"; :global fleetKey \"" . $pushKey . "\"; :global fleetSrc \"" . $ztSrc . "\"")

/system/script/remove [find name="fleet-push-interfaces"]
/system/script/add name="fleet-push-interfaces" policy=read,write,test,policy source={
  /system/script/run fleet-config
  :global fleetUrl
  :global fleetKey
  :global fleetSrc

  :local ob "\7B"
  :local cb "\7D"
  :local ident [/system/identity/get name]
  :local rows ""
  :local sep ""

  :foreach i in=[/interface/find where !disabled] do={
    :local n [/interface/get $i name]
    :local rb 0
    :local tb 0
    :do {
      :set rb [/interface/get $i rx-byte]
      :set tb [/interface/get $i tx-byte]
    } on-error={
      :set rb 0
      :set tb 0
    }
    :set rows ($rows . $sep . $ob . "\"name\":\"" . $n . "\",\"rx_byte\":" . $rb . ",\"tx_byte\":" . $tb . $cb)
    :set sep ","
  }

  :local body ($ob . "\"identity\":\"" . $ident . "\",\"ip_address\":\"" . $fleetSrc . "\",\"interfaces\":[" . $rows . "]" . $cb)
  :local hdr ("Content-Type: application/json,X-Device-Api-Key: " . $fleetKey)

  :do {
    /tool/fetch url=$fleetUrl http-method=post http-header-field=$hdr http-data=$body output=none as-value
  } on-error={
    :log warning "FLEET: day counter that bai — kiem tra ZeroTier, push-key va device_id"
  }
}

/system/scheduler/remove [find name="fleet-push-interfaces"]
/system/scheduler/add name="fleet-push-interfaces" interval=5m start-time=startup \
  on-event="/system/script/run fleet-push-interfaces" \
  policy=read,write,test,policy comment="FLEET: day counter moi 5 phut"

# Backend tu hieu chinh poll_interval_s theo nhip day that, nen doi interval o day
# la du — khong can sua gi ben server.


# =============================================================================
#  9. DON DEP CAU HINH CU
# =============================================================================

# Script/scheduler cu cua ban thu nghiem truoc day — bo di de khong day trung.
/system/scheduler/remove [find name="sch_http_get_interfaces"]
/system/script/remove [find name="http_get_interfaces"]

# Chi cho quan tri router qua ZeroTier, khong mo ra WAN.
/ip/service/set www disabled=yes
/ip/service/set telnet disabled=yes
/ip/service/set ftp disabled=yes
/ip/service/set api disabled=yes
/ip/service/set www-ssl disabled=no
/ip/service/set winbox address=172.29.0.0/16

/system/clock/set time-zone-name=Asia/Ho_Chi_Minh time-zone-autodetect=no

:log info "FLEET: ap cau hinh do dem CREW xong"
:put "FLEET: xong. Chay cac lenh kiem tra o muc 10 truoc khi roi tau."


# =============================================================================
#  10. KIEM TRA SAU KHI AP — chay tay tung lenh, DUNG import phan nay
# =============================================================================
#
#  a) DNS co bi ep ve router khong (phai thay counter tang):
#     /ip/firewall/nat/print stats where comment~"FLEET: ep DNS"
#
#  b) Log DNS co sinh du hai dang dong khong — quan trong nhat:
#     /log/print where topics~"dns"
#     Phai thay ca "dns query from ..." lan "dns done query: ..."
#
#  c) Traffic Flow co dang chay va da gui goi chua:
#     /ip/traffic-flow/print
#     /ip/traffic-flow/target/print
#
#  d) FastTrack da tat chua (khong duoc con rule nao enabled):
#     /ip/firewall/filter/print where action=fasttrack-connection
#
#  e) RADIUS co thong khong (thu dang nhap 1 tai khoan that roi xem):
#     /radius/monitor 0 once
#     Phai thay requests tang va khong co timeout.
#
#  f) Day counter co chay khong:
#     /system/script/run fleet-push-interfaces
#     /log/print where message~"FLEET"
#
#  g) Tren server, sau 10 phut phai thay:
#     - GET /telemetry/health          -> ca 3 nguon deu fresh
#     - GET /ships/{id}/crew/users     -> co username va so byte
#     - GET /ships/{id}/business/flows -> co ten mien, ty le "Khac" giam dan
#     - GET /ships/{id}/reconciliation -> gap co so, khong phai UNAVAILABLE
#
#
#  GO BO TOAN BO (neu can quay lai trang thai cu):
#     /ip/firewall/nat/remove [find comment~"FLEET"]
#     /ip/firewall/filter/remove [find comment~"FLEET"]
#     /ip/firewall/address-list/remove [find list=fleet-doh]
#     /ip/traffic-flow/set enabled=no
#     /ip/traffic-flow/target/remove [find comment="FLEET"]
#     /system/logging/remove [find action="fleet-remote"]
#     /system/logging/action/remove [find name="fleet-remote"]
#     /system/scheduler/remove [find name="fleet-push-interfaces"]
#     /system/script/remove [find name~"fleet-"]
#     /ip/dns/static/remove [find name="use-application-dns.net"]
#     /ip/firewall/filter/set [find action=fasttrack-connection] disabled=no
# =============================================================================
