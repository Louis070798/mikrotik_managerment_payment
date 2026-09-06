/**
 * Cấu hình RouterOS mẫu dùng chung cho fleet — nguyên văn từ document/Config.txt (do người dùng
 * cung cấp), CỘNG THÊM khối NetFlow v9 (/ip traffic-flow) + DNS log (/system logging topics=dns)
 * — 2 nguồn dữ liệu thật mà NetflowCollectorService/DnsLogCollectorService lắng nghe (xem
 * backend/src/libs/netflow-collector, dns-log-collector) để phân loại "WAN dùng bao nhiêu cho
 * YouTube/TikTok/..." theo tài liệu tham khảo. Địa chỉ server dùng thẳng `10.149.79.186` — server
 * thật đang chạy hệ thống này (người dùng xác nhận, đã kiểm chứng qua NetFlow thật nhận được từ Hai
 * Nam 81); chỉ `<RADIUS_SECRET>` còn là placeholder vì mỗi thiết bị có secret riêng (xem tab "Kết
 * nối trực tiếp" của thiết bị đó). Chỉ dùng để ĐIỀN SẴN ô "Cấu hình router" khi 1 thiết bị chưa từng
 * lưu config nào, giúp không phải gõ/dán lại từ đầu cho mỗi tàu mới — người dùng vẫn phải tự sửa
 * phần đặc thù của tàu đó (vd IP WAN, placeholder ở trên) rồi bấm "Lưu cấu hình" mới thực sự lưu,
 * không tự động lưu ngầm.
 */
export const DEFAULT_ROUTEROS_CONFIG_TEMPLATE = `/interface bridge
add name=BUSINESS
add name=CREW
/interface ethernet
set [ find default-name=ether13 ] comment="Starlink ether1" name=wan1
/ip hotspot profile
add dns-name=hotspot.info hotspot-address=192.168.6.1 name=hsprof1 radius-interim-update=5m use-radius=yes
/ip hotspot user profile
set [ find default=yes ] keepalive-timeout=12h name=Hotspot shared-users=5
/ip pool
add name=dhcp_pool0 ranges=192.168.20.2-192.168.20.254
add name=hs-pool-7 ranges=192.168.6.2-192.168.6.254
/ip dhcp-server
add address-pool=dhcp_pool0 interface=BUSINESS name=dhcp1
add address-pool=hs-pool-7 interface=CREW name=dhcp2
/ip hotspot
add address-pool=hs-pool-7 addresses-per-mac=1 disabled=no idle-timeout=12h interface=CREW name=hotspot1 profile=hsprof1
/zerotier
set zt1 disabled=no disabled=no
/zerotier interface
add allow-default=no allow-global=no allow-managed=yes disabled=no instance=zt1 name=zerotier1 network=4cd06dc1f147eda3

/interface bridge port

add bridge=BUSINESS interface=ether2
add bridge=BUSINESS interface=ether3
add bridge=BUSINESS interface=ether4
add bridge=BUSINESS interface=ether5

/ip neighbor discovery-settings
set discover-interface-list=all
/ip address
add address=192.168.6.1/24 interface=CREW network=192.168.6.0
add address=192.168.20.1/24 interface=BUSINESS network=192.168.20.0
/ip dhcp-client
add interface=wan1
/ip dhcp-server network

add address=192.168.20.0/24 dns-server=8.8.8.8,8.8.4.4 gateway=192.168.20.1
/ip dns
set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4
/ip firewall filter
add action=passthrough chain=unused-hs-chain comment="place hotspot rules here" disabled=yes
/ip firewall nat

add action=masquerade chain=srcnat
add action=masquerade chain=srcnat comment="masquerade hotspot network" src-address=192.168.6.0/24


/ip service
set www disabled=yes
set www-ssl certificate=router disabled=no
/radius
# secret= phai khop dung voi RADIUS secret da cap cho thiet bi nay o tab "Ket noi truc tiep"
# (server that nghe UDP 1813, se tu choi goi Accounting neu secret sai).

# Dia chi server RADIUS/NetFlow/DNS log: 10.149.79.186 -- server that dang chay he thong nay (da
# xac nhan reachable qua NetFlow that). Ban dau Config.txt goc ghi 172.29.172.3 (kem
# src-address=172.29.163.95) -- dia chi tu mang cu, khong con dung, da bo src-address vi khong con
# khop mang hien tai; neu router can chi dinh IP nguon rieng (vd qua VPN/ZeroTier) hay them lai
# src-address=<IP_NGUON_THAT_TREN_ROUTER>.
add address=10.149.79.186 require-message-auth=no secret=<RADIUS_SECRET> service=hotspot timeout=5s
/radius incoming
set accept=yes
/ip traffic-flow
set active-flow-timeout=1m cache-entries=32k enabled=yes inactive-flow-timeout=2m interfaces=CREW,BUSINESS
/ip traffic-flow target
# Cong 2055 = NetFlow v9 UDP server cua he thong, dung de do byte theo tung ket noi (WAN dung bao
# nhieu cho dich vu nao).
add dst-address=10.149.79.186 port=2055 version=9
/system logging action
# Cung server, cong 5514 -- DNS log UDP collector, dung de biet 1 dia chi IP la dich vu gi
# (Youtube/TikTok/...), ghep voi so lieu NetFlow o tren. KHONG doi topics=dns. Ten action RouterOS
# chi cho phep chu+so (khong dau gach ngang), dung "remotedns" chu khong phai "remote-dns".
add name=remotedns remote=10.149.79.186 remote-port=5514 target=remote
/system logging
add action=remotedns topics=dns
/system clock
set time-zone-autodetect=no time-zone-name=Asia/Ho_Chi_Minh
/system note
set show-at-login=no
/system routerboard settings
set enter-setup-on=delete-key
/system scheduler
add interval=5m name=sch_http_get_interfaces on-event=http_get_interfaces policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon start-date=2025-06-20 start-time=00:00:00
`;

const FLEET_SERVER_ADDRESS = '10.149.79.186';

export type WanMode = 'single' | 'failover' | 'loadbalance';

export type FleetConfigOptions = {
    wanCount: 1 | 2 | 3;
    wanMode: WanMode; // bỏ qua khi wanCount === 1
    wanInterfaces: string[]; // tên interface vật lý thật, length === wanCount, vd ['ether13','ether14']
    enableCrewHotspot: boolean; // bridge CREW + Hotspot + RADIUS use-radius=yes
    enableBusiness: boolean; // bridge BUSINESS + DHCP
    enableZeroTier: boolean;
    radiusSecret: string; // '<RADIUS_SECRET>' nếu chưa cấp, hoặc secret thật sau khi issueRadiusSecret()
};

export const DEFAULT_FLEET_CONFIG_OPTIONS: FleetConfigOptions = {
    wanCount: 1,
    wanMode: 'single',
    wanInterfaces: ['ether13'],
    enableCrewHotspot: true,
    enableBusiness: true,
    enableZeroTier: true,
    radiusSecret: '<RADIUS_SECRET>',
};

/**
 * Sinh cấu hình RouterOS theo lựa chọn thật (số WAN, kiểu WAN, bật/tắt CREW/BUSINESS/ZeroTier) —
 * với wanCount=1 + mọi toggle bật (mặc định), các dòng LỆNH giống hệt DEFAULT_ROUTEROS_CONFIG_TEMPLATE
 * ở trên (đã verify thật trên Hai Nam 81); chỉ khác ở comment giải thích (ngắn gọn hơn, không lặp lại
 * lịch sử "vì sao 172.29.172.3 sai" ở mỗi lần sinh) và `radiusSecret` điền được giá trị thật thay vì
 * luôn để placeholder. Địa chỉ server (10.149.79.186) LUÔN cố định — không có option nào đổi được,
 * đúng yêu cầu "server RADIUS và server backend phải giữ nguyên không đổi".
 *
 * Kiểu WAN "failover": DHCP client dùng distance= tăng dần theo thứ tự ưu tiên (RouterOS tự chuyển
 * default route khi WAN có distance thấp hơn mất route). Kiểu "loadbalance": PCC 2 lớp
 * (mark-connection + mark-routing) theo mẫu chuẩn MikroTik wiki — gateway thật của mỗi WAN là DHCP
 * động nên để placeholder <WANn_GATEWAY>, người dùng tự điền sau khi router đã lên DHCP thật.
 */
export function buildFleetConfigFromOptions(options: FleetConfigOptions): string {
    const lines: string[] = [];
    const lan: string[] = [];
    if (options.enableCrewHotspot) lan.push('CREW');
    if (options.enableBusiness) lan.push('BUSINESS');

    lines.push('/interface bridge');
    if (options.enableBusiness) lines.push('add name=BUSINESS');
    if (options.enableCrewHotspot) lines.push('add name=CREW');

    lines.push('/interface ethernet');
    options.wanInterfaces.forEach((ifaceName, i) => {
        lines.push(`set [ find default-name=${ifaceName} ] comment="WAN${i + 1}" name=wan${i + 1}`);
    });

    if (options.enableCrewHotspot) {
        lines.push('/ip hotspot profile');
        lines.push('add dns-name=hotspot.info hotspot-address=192.168.6.1 name=hsprof1 radius-interim-update=5m use-radius=yes');
        lines.push('/ip hotspot user profile');
        lines.push('set [ find default=yes ] keepalive-timeout=12h name=Hotspot shared-users=5');
    }

    if (options.enableBusiness || options.enableCrewHotspot) lines.push('/ip pool');
    if (options.enableBusiness) lines.push('add name=dhcp_pool0 ranges=192.168.20.2-192.168.20.254');
    if (options.enableCrewHotspot) lines.push('add name=hs-pool-7 ranges=192.168.6.2-192.168.6.254');

    if (options.enableBusiness || options.enableCrewHotspot) lines.push('/ip dhcp-server');
    if (options.enableBusiness) lines.push('add address-pool=dhcp_pool0 interface=BUSINESS name=dhcp1');
    if (options.enableCrewHotspot) lines.push('add address-pool=hs-pool-7 interface=CREW name=dhcp2');

    if (options.enableCrewHotspot) {
        lines.push('/ip hotspot');
        lines.push('add address-pool=hs-pool-7 addresses-per-mac=1 disabled=no idle-timeout=12h interface=CREW name=hotspot1 profile=hsprof1');
    }

    if (options.enableZeroTier) {
        lines.push('/zerotier');
        lines.push('set zt1 disabled=no disabled=no');
        lines.push('/zerotier interface');
        lines.push('add allow-default=no allow-global=no allow-managed=yes disabled=no instance=zt1 name=zerotier1 network=4cd06dc1f147eda3');
    }

    lines.push('', '/interface bridge port', '');
    if (options.enableBusiness) {
        lines.push('add bridge=BUSINESS interface=ether2');
        lines.push('add bridge=BUSINESS interface=ether3');
        lines.push('add bridge=BUSINESS interface=ether4');
        lines.push('add bridge=BUSINESS interface=ether5');
    }

    lines.push('', '/ip neighbor discovery-settings', 'set discover-interface-list=all');
    lines.push('/ip address');
    if (options.enableCrewHotspot) lines.push('add address=192.168.6.1/24 interface=CREW network=192.168.6.0');
    if (options.enableBusiness) lines.push('add address=192.168.20.1/24 interface=BUSINESS network=192.168.20.0');

    lines.push('/ip dhcp-client');
    if (options.wanCount === 1) {
        lines.push('add interface=wan1');
    } else if (options.wanMode === 'failover') {
        options.wanInterfaces.forEach((_, i) => lines.push(`add add-default-route=yes distance=${i + 1} interface=wan${i + 1} use-peer-dns=no`));
        lines.push('# Failover uu tien wan1 (distance nho nhat) -- RouterOS tu chuyen sang wan ke tiep khi wan uu tien mat default route.');
    } else {
        // loadbalance: khong de DHCP tu them default route (se dung /ip route dat tay theo routing-mark ben duoi).
        options.wanInterfaces.forEach((_, i) => lines.push(`add add-default-route=no interface=wan${i + 1} use-peer-dns=no`));
    }

    if (lan.length > 0) {
        lines.push('/ip dhcp-server network', '');
        if (options.enableBusiness) lines.push('add address=192.168.20.0/24 dns-server=8.8.8.8,8.8.4.4 gateway=192.168.20.1');
    }
    lines.push('/ip dns');
    lines.push('set allow-remote-requests=yes servers=8.8.8.8,8.8.4.4');
    if (options.enableCrewHotspot) {
        lines.push('/ip firewall filter');
        lines.push('add action=passthrough chain=unused-hs-chain comment="place hotspot rules here" disabled=yes');
    }

    lines.push('/ip firewall nat', '');
    lines.push('add action=masquerade chain=srcnat');
    if (options.enableCrewHotspot) lines.push('add action=masquerade chain=srcnat comment="masquerade hotspot network" src-address=192.168.6.0/24');
    lines.push('', '');

    if (options.wanCount > 1 && options.wanMode === 'loadbalance') {
        lines.push('# Can bang tai PCC nhieu WAN -- mau chuan MikroTik (mark-connection + mark-routing). Gateway');
        lines.push('# that cua tung WAN la IP dong (DHCP), khong doan truoc duoc -- dien <WANn_GATEWAY> sau khi');
        lines.push('# router da len DHCP that tren tung WAN.');
        lines.push('/interface list');
        lines.push('add name=LAN');
        lines.push('/interface list member');
        lan.forEach((name) => lines.push(`add interface=${name} list=LAN`));
        lines.push('/ip firewall mangle');
        options.wanInterfaces.forEach((_, i) => {
            lines.push(`add action=mark-connection chain=prerouting dst-address-type=!local in-interface-list=LAN new-connection-mark=wan${i + 1}_conn passthrough=yes per-connection-classifier=both-addresses-and-ports:${options.wanInterfaces.length}/${i}`);
        });
        options.wanInterfaces.forEach((_, i) => {
            lines.push(`add action=mark-routing chain=prerouting connection-mark=wan${i + 1}_conn new-routing-mark=to_wan${i + 1} passthrough=yes`);
        });
        lines.push('/ip route');
        options.wanInterfaces.forEach((_, i) => {
            const n = i + 1;
            lines.push(`add dst-address=0.0.0.0/0 gateway=<WAN${n}_GATEWAY> routing-mark=to_wan${n}`);
            lines.push(`add distance=${n} gateway=<WAN${n}_GATEWAY>`);
        });
    }

    lines.push('/ip service');
    lines.push('set www disabled=yes');
    lines.push('set www-ssl certificate=router disabled=no');

    if (options.enableCrewHotspot) {
        lines.push('/radius');
        lines.push('# secret= phai khop dung voi RADIUS secret da cap cho thiet bi nay (server that nghe UDP');
        lines.push('# 1813, se tu choi goi Accounting neu secret sai). Dia chi server LUON co dinh, khong doi.');
        lines.push(`add address=${FLEET_SERVER_ADDRESS} require-message-auth=no secret=${options.radiusSecret} service=hotspot timeout=5s`);
        lines.push('/radius incoming');
        lines.push('set accept=yes');
    }

    lines.push('/ip traffic-flow');
    lines.push(`set active-flow-timeout=1m cache-entries=32k enabled=yes inactive-flow-timeout=2m interfaces=${lan.join(',') || 'all'}`);
    lines.push('/ip traffic-flow target');
    lines.push('# Cong 2055 = NetFlow v9 UDP server cua he thong, dung de do byte theo tung ket noi (WAN dung');
    lines.push('# bao nhieu cho dich vu nao). Dia chi server LUON co dinh, khong doi.');
    lines.push(`add dst-address=${FLEET_SERVER_ADDRESS} port=2055 version=9`);
    if (options.enableCrewHotspot) {
        lines.push('/system logging action');
        lines.push('# Cung server, cong 5514 -- DNS log UDP collector. Ten action RouterOS chi cho phep chu+so');
        lines.push('# (khong dau gach ngang), dung "remotedns" chu khong phai "remote-dns".');
        lines.push(`add name=remotedns remote=${FLEET_SERVER_ADDRESS} remote-port=5514 target=remote`);
        lines.push('/system logging');
        lines.push('add action=remotedns topics=dns');
    }

    lines.push('/system clock');
    lines.push('set time-zone-autodetect=no time-zone-name=Asia/Ho_Chi_Minh');
    lines.push('/system note');
    lines.push('set show-at-login=no');
    lines.push('/system routerboard settings');
    lines.push('set enter-setup-on=delete-key');
    lines.push('/system scheduler');
    lines.push('add interval=5m name=sch_http_get_interfaces on-event=http_get_interfaces policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon start-date=2025-06-20 start-time=00:00:00');

    return lines.join('\n');
}
