/**
 * Sinh TOÀN BỘ cấu hình RouterOS cho một MikroTik trong đội tàu, gói vào MỘT khối dán duy nhất.
 *
 * Trước đây phần này bị chẻ làm ba chỗ (RADIUS / NetFlow+DNS / script đẩy counter), mỗi chỗ một
 * nút sao chép và một hướng dẫn dán khác nhau — Terminal cho hai cái đầu, Scheduler cho cái cuối.
 * Đó là cách chắc chắn để ai đó dán thiếu một mảnh rồi mất buổi chiều dò xem vì sao dữ liệu không
 * lên. Giờ mọi thứ vào chung một cửa sổ Terminal: mục 4 tự tạo `/system script` và
 * `/system scheduler` bằng lệnh, nên không phải mở màn hình nào khác.
 *
 * Toàn bộ nội dung ở đây là VĂN BẢN cho admin tự dán — server không bao giờ kết nối vào router để
 * chạy hộ (mô hình push 1 chiều).
 *
 * Ba điểm dễ sai nhất, cố ý viết thẳng vào comment của chính đoạn lệnh chứ không chỉ để trên UI:
 *
 *   1. Server nhận diện router bằng ĐỊA CHỈ NGUỒN của gói UDP (radius-server.service.ts so khớp
 *      rinfo.address với devices.ip_address). Gói đi ra từ IP khác bị bỏ IM LẶNG — không
 *      Access-Reject, không log phía router. Nên cả `/radius` lẫn traffic-flow target đều ghi
 *      `src-address` rõ ràng thay vì để RouterOS tự chọn theo bảng định tuyến.
 *
 *   2. Dán lại lần hai phải xoá bản cũ, nếu không router có 2 entry trùng và quay vòng giữa
 *      secret cũ/mới — biểu hiện y hệt "lúc được lúc không". Mọi mục đều mở đầu bằng một lệnh
 *      remove, xoá theo CẢ comment lẫn địa chỉ (entry tạo tay trước đây không mang comment nào).
 *
 *   3. JSON cần ký tự `{` và `}`, nhưng trong `source={...}` hai ký tự đó làm lệch bộ đếm ngoặc
 *      của trình phân tích script RouterOS — kể cả khi nằm trong chuỗi. Phải viết bằng mã hex
 *      `\7B` / `\7D`.
 *
 * CHỈ HOTSPOT: hệ thống không dùng PPPoE, nên `service=` chỉ có hotspot và không đụng `/ppp aaa`.
 */

export type RouterOsRadiusInput = {
    /** Địa chỉ server như ROUTER nhìn thấy (thường là IP ZeroTier) — Settings.radius_server_address. */
    serverAddress?: string | null;
    authPort?: number | null;
    acctPort?: number | null;
    coaPort?: number | null;
    /** Shared secret thật. Để trống khi admin chưa bấm "Hiện secret" — chỗ đó in placeholder. */
    secret?: string | null;
    /** devices.ip_address — IP mà router phải dùng làm địa chỉ nguồn. */
    nasIpAddress?: string | null;
    deviceName?: string | null;
};

export type RouterOsFullConfigInput = RouterOsRadiusInput & {
    deviceId?: string | null;
    pushApiKey?: string | null;
    /** URL HTTP nhận telemetry push — có thể khác địa chỉ UDP nếu đi qua reverse proxy. */
    telemetryUrl?: string | null;
    /** Tên các interface xuất NetFlow, theo quy ước đặt tên của đội tàu. */
    netflowInterfaces?: string;
};

const PLACEHOLDER_SECRET = '<BAM "Hien secret" DE LAY GIA TRI THAT>';
const PLACEHOLDER_ADDRESS = '<dat "Dia chi server RADIUS" trong Cai dat>';
const PLACEHOLDER_NAS_IP = '<dat IP router cho thiet bi nay>';
const PLACEHOLDER_KEY = '<DAT PUSH API KEY O O BEN TREN>';
const DEFAULT_NETFLOW_INTERFACES = 'CREW,BUSINESS,WAN';

/** Ghi chú tại sao chưa sinh được lệnh hoàn chỉnh — rỗng nghĩa là đủ dữ liệu. */
export function routerOsRadiusBlockers(input: RouterOsRadiusInput): string[] {
    const missing: string[] = [];
    if (!input.serverAddress) missing.push('địa chỉ server RADIUS (Cài đặt → RADIUS)');
    if (!input.nasIpAddress) missing.push('IP router của thiết bị (devices.ip_address)');
    if (!input.secret) missing.push('shared secret (bấm "Hiện secret")');
    return missing;
}

export function routerOsFullConfigBlockers(input: RouterOsFullConfigInput): string[] {
    const missing = routerOsRadiusBlockers(input);
    if (!input.pushApiKey) missing.push('push API key (đặt ở ô phía trên)');
    if (!input.telemetryUrl) missing.push('Server URL cho telemetry');
    return missing;
}

function resolved(input: RouterOsRadiusInput) {
    return {
        server: input.serverAddress || PLACEHOLDER_ADDRESS,
        nasIp: input.nasIpAddress || PLACEHOLDER_NAS_IP,
        secret: input.secret || PLACEHOLDER_SECRET,
        authPort: input.authPort ?? 1812,
        acctPort: input.acctPort ?? 1813,
        coaPort: input.coaPort ?? 3799,
    };
}

/** Riêng phần RADIUS — dùng ở trang RADIUS/AAA, nơi không có push key của từng thiết bị. */
export function buildRouterOsRadiusScript(input: RouterOsRadiusInput): string {
    const r = resolved(input);
    return [
        `# === Fleet RADIUS client${input.deviceName ? ` — ${input.deviceName}` : ''} ===`,
        '# Dan ca khoi vao Terminal cua router. Chi phan RADIUS -- NetFlow, DNS log va script day',
        '# counter nam trong khoi cau hinh day du o tab "Ket noi truc tiep" cua thiet bi nay.',
        '',
        ...radiusLines(r),
        '',
        '# Kiem tra ngay sau khi dan:',
        '/radius print detail where comment="fleet-radius"',
        '/log print where topics~"radius"',
    ].join('\n');
}

function radiusLines(r: ReturnType<typeof resolved>): string[] {
    return [
        '# Chi Hotspot -- he thong khong dung PPPoE nen khong dung toi /ppp aaa.',
        '# src-address BAT BUOC dung IP da khai trong he thong: server nhan dien router bang',
        '# DIA CHI NGUON cua goi UDP, sai IP = goi bi bo im lang.',
        '/radius remove [find comment="fleet-radius"]',
        `/radius remove [find address=${r.server}]`,
        `/radius add service=hotspot address=${r.server} secret="${r.secret}" authentication-port=${r.authPort} accounting-port=${r.acctPort} src-address=${r.nasIp} timeout=3s comment="fleet-radius"`,
        '',
        '# Cho phep server chu dong ngat phien (CoA/Disconnect, RFC 5176).',
        `/radius incoming set accept=yes port=${r.coaPort}`,
        '',
        '# radius-accounting=yes moi la thu day byte len server -- thieu no thi user dang nhap duoc',
        '# nhung khong co so lieu su dung nao. interim-update=5m de quota cap nhat lien tuc,',
        '# khong doi toi luc user dang xuat moi biet da dung bao nhieu.',
        '/ip hotspot profile set [find] use-radius=yes radius-accounting=yes radius-interim-update=5m',
    ];
}

export function buildRouterOsFullConfig(input: RouterOsFullConfigInput): string {
    const r = resolved(input);
    const deviceId = input.deviceId || '<device_id>';
    const apiKey = input.pushApiKey || PLACEHOLDER_KEY;
    const telemetryUrl = input.telemetryUrl || `http://${r.server}:3000/api/v1/devices/${deviceId}/telemetry-push`;
    const ifaces = input.netflowInterfaces || DEFAULT_NETFLOW_INTERFACES;

    return [
        '# =============================================================================',
        `#  CAU HINH FLEET${input.deviceName ? ` — ${input.deviceName}` : ''}`,
        '#',
        '#  Dan TOAN BO khoi nay vao Terminal cua router (New Terminal trong WinBox).',
        '#  Khong can mo Scheduler hay Files: muc 4 tu tao script va scheduler bang lenh.',
        '#',
        `#  Server UDP : ${r.server}`,
        `#    RADIUS     auth ${r.authPort} / acct ${r.acctPort}`,
        `#    CoA        ${r.coaPort} (cong ROUTER lang nghe, khong phai cong server)`,
        '#    NetFlow v9 2055',
        '#    DNS log    5514',
        `#  Telemetry  : POST ${telemetryUrl}`,
        `#  IP router  : ${r.nasIp} (dia chi nguon cua MOI goi gui len -- sai la mat sach du lieu)`,
        '# =============================================================================',
        '',
        '',
        '# ---------------------------------------------------------------------------',
        '#  1/4. RADIUS',
        '# ---------------------------------------------------------------------------',
        ...radiusLines(r),
        '',
        '',
        '# ---------------------------------------------------------------------------',
        '#  2/4. NetFlow v9 — WAN dung bao nhieu cho dich vu nao',
        '#       Bat buoc xuat ca interface NOI BO (CREW/BUSINESS), khong chi WAN: sau NAT moi',
        '#       goi deu mang IP router, khong con quy duoc ve tung thuyen vien.',
        '# ---------------------------------------------------------------------------',
        `#       Ten interface duoi day theo quy uoc dat ten cua doi tau (${ifaces}). Router nao dat ten`,
        '#       khac thi sua lai cho dung, neu khong RouterOS bao loi va dung ngay tai dong do.',
        `/ip traffic-flow set enabled=yes interfaces=${ifaces} cache-entries=128k active-flow-timeout=1m inactive-flow-timeout=15s`,
        '/ip traffic-flow target remove [find comment="fleet-netflow"]',
        `/ip traffic-flow target add dst-address=${r.server} port=2055 version=9 v9-template-refresh=20 v9-template-timeout=1m src-address=${r.nasIp} comment="fleet-netflow"`,
        '',
        '# FastTrack bo qua bo dem ket noi, nen luong da fasttrack KHONG xuat hien trong NetFlow.',
        '# Kiem tra va tat neu con rule nao dang bat:',
        '/ip firewall filter print where action=fasttrack-connection',
        '',
        '',
        '# ---------------------------------------------------------------------------',
        '#  3/4. DNS log — de biet luu luong thuoc ten mien nao',
        '#       Ten action chi duoc chua chu va so (RouterOS tu choi dau gach ngang).',
        '# ---------------------------------------------------------------------------',
        '/system logging remove [find action="fleetdns"]',
        '/system logging action remove [find name="fleetdns"]',
        `/system logging action add name=fleetdns target=remote remote=${r.server} remote-port=5514`,
        '/system logging add action=fleetdns topics=dns',
        '',
        '',
        '# ---------------------------------------------------------------------------',
        '#  4/4. Day counter interface ve server moi 5 phut',
        '#       JSON can { va }, nhung trong source={...} hai ky tu do lam lech bo dem ngoac',
        '#       cua trinh phan tich script -- ke ca khi nam trong chuoi. Dung ma hex \\7B / \\7D.',
        '# ---------------------------------------------------------------------------',
        '/system scheduler remove [find name="fleet-push"]',
        '/system script remove [find name="fleet-push"]',
        '/system script add name="fleet-push" policy=read,write,test,policy source={',
        `  :local url "${telemetryUrl}"`,
        `  :local key "${apiKey}"`,
        `  :local src "${r.nasIp}"`,
        '',
        '  :local ob "\\7B"',
        '  :local cb "\\7D"',
        '  :local ident [/system identity get name]',
        '  :local rows ""',
        '  :local sep ""',
        '',
        '  :foreach i in=[/interface find where !disabled] do={',
        '    :local n [/interface get $i name]',
        '    :local rb 0',
        '    :local tb 0',
        '    :do {',
        '      :set rb [/interface get $i rx-byte]',
        '      :set tb [/interface get $i tx-byte]',
        '    } on-error={',
        '      :set rb 0',
        '      :set tb 0',
        '    }',
        '    :set rows ($rows . $sep . $ob . "\\"name\\":\\"" . $n . "\\",\\"rx_byte\\":" . $rb . ",\\"tx_byte\\":" . $tb . $cb)',
        '    :set sep ","',
        '  }',
        '',
        '  :local body ($ob . "\\"identity\\":\\"" . $ident . "\\",\\"ip_address\\":\\"" . $src . "\\",\\"interfaces\\":[" . $rows . "]" . $cb)',
        '  :local hdr ("Content-Type: application/json,X-Device-Api-Key: " . $key)',
        '',
        '  :do {',
        '    /tool fetch url=$url http-method=post http-header-field=$hdr http-data=$body output=none as-value',
        '  } on-error={',
        '    :log warning "FLEET: day counter that bai -- kiem tra ZeroTier, push-key va device_id"',
        '  }',
        '}',
        '',
        '/system scheduler add name="fleet-push" interval=5m start-time=startup on-event="/system script run fleet-push" policy=read,write,test,policy comment="FLEET: day counter moi 5 phut"',
        '',
        '',
        '# ---------------------------------------------------------------------------',
        '#  KIEM TRA NGAY SAU KHI DAN',
        '# ---------------------------------------------------------------------------',
        '/radius print detail where comment="fleet-radius"',
        '/ip traffic-flow print',
        '/ip traffic-flow target print',
        '/system script run fleet-push',
        '/log print where topics~"radius"',
        '/log print where message~"FLEET"',
    ].join('\n');
}
