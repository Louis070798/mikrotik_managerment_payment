/**
 * Parser thuần cho RouterOS export config (vd `/export hide-sensitive`) — chỉ đọc để HIỂN THỊ
 * tóm tắt tham khảo trên giao diện, không bao giờ được dùng để suy diễn số liệu telemetry hay tự
 * thực thi bất cứ điều gì xuống router. Best-effort: field nào không tìm thấy trong text thì để
 * trống ("Không tìm thấy trong config"), không bao giờ bịa giá trị.
 *
 * Định dạng RouterOS export: mỗi dòng `/section/subsection`, tiếp theo là các dòng `add ...`/`set ...`
 * chứa cặp `key=value` (value có thể trong dấu ngoặc kép). Section hiện hành áp dụng cho mọi dòng
 * `add`/`set` phía sau nó cho tới khi gặp dòng `/...` mới.
 */

export type ParsedBridge = { name: string; ports: string[] };
export type ParsedRadius = { address: string; service?: string };
export type ParsedZeroTier = { name: string; network: string };
export type ParsedIpAddress = { address: string; interface: string };
export type ParsedInterfaceRename = { defaultName: string; newName: string; comment?: string };

export type ParsedRouterOsConfig = {
  bridges: ParsedBridge[];
  radius: ParsedRadius[];
  zerotier: ParsedZeroTier[];
  hotspotInterfaces: string[];
  ipAddresses: ParsedIpAddress[];
  interfaceRenames: ParsedInterfaceRename[];
  dnsServers: string[];
};

/** Tách các cặp key=value trên 1 dòng lệnh RouterOS, tôn trọng chuỗi trong dấu ngoặc kép. */
function parseKeyValuePairs(line: string): Record<string, string> {
  const pairs: Record<string, string> = {};
  const re = /([\w-]+)=("[^"]*"|\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    const key = match[1];
    let value = match[2];
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    pairs[key] = value;
  }
  return pairs;
}

export function parseRouterOsConfig(text: string): ParsedRouterOsConfig {
  const result: ParsedRouterOsConfig = {
    bridges: [],
    radius: [],
    zerotier: [],
    hotspotInterfaces: [],
    ipAddresses: [],
    interfaceRenames: [],
    dnsServers: [],
  };
  if (!text) return result;

  const lines = text.split(/\r?\n/);
  let section = '';
  const bridgeByName = new Map<string, ParsedBridge>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('/')) {
      section = line.toLowerCase();
      continue;
    }
    if (!/^(add|set)\b/.test(line)) continue;
    const kv = parseKeyValuePairs(line);

    if (section === '/interface bridge' && kv.name) {
      if (!bridgeByName.has(kv.name)) bridgeByName.set(kv.name, { name: kv.name, ports: [] });
    } else if (section === '/interface bridge port' && kv.bridge && kv.interface) {
      if (!bridgeByName.has(kv.bridge)) bridgeByName.set(kv.bridge, { name: kv.bridge, ports: [] });
      bridgeByName.get(kv.bridge)!.ports.push(kv.interface);
    } else if (section === '/interface ethernet' && kv.name && (kv['default-name'] || kv.comment)) {
      result.interfaceRenames.push({ defaultName: kv['default-name'] ?? '?', newName: kv.name, comment: kv.comment });
    } else if (section === '/radius' && kv.address) {
      result.radius.push({ address: kv.address, service: kv.service });
    } else if (section === '/zerotier interface' && kv.network) {
      result.zerotier.push({ name: kv.name ?? '?', network: kv.network });
    } else if (section === '/ip hotspot' && kv.interface) {
      result.hotspotInterfaces.push(kv.interface);
    } else if (section === '/ip address' && kv.address && kv.interface) {
      result.ipAddresses.push({ address: kv.address, interface: kv.interface });
    } else if (section === '/ip dns' && kv.servers) {
      result.dnsServers.push(...kv.servers.split(','));
    }
  }

  result.bridges = [...bridgeByName.values()];
  return result;
}
