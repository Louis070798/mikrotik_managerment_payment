import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { ApiException } from '@common/api-exception';
import { ServiceRegistry } from '@registry/service-registry.service';
import { EndpointCandidate } from '@registry/registry.types';
import { EnvCredentialResolver } from '@health-checks/credential-resolver';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { zerotierMemberLabels } from '@db/schema';
import { CreateNetworkInput, UpdateMemberInput, UpdateNetworkInput } from './dto';

export type ZtNetworkSummary = {
  id: string;
  name: string | null;
  private: boolean | null;
  member_count: number;
  authorized_member_count: number | null;
};

export type ZtNetworkDetail = ZtNetworkSummary & {
  auto_assign_v4: boolean | null;
  ip_assignment_pools: { ip_range_start: string; ip_range_end: string }[];
  routes: { target: string; via: string | null }[];
  dns: { domain: string; servers: string[] } | null;
};

export type ZtMember = {
  id: string;
  address: string;
  name: string | null;
  authorized: boolean | null;
  online: boolean | null;
  ip_assignments: string[];
  physical_address: string | null;
  version: string | null;
  last_authorized_at: string | null;
  last_deauthorized_at: string | null;
};

const SERVICE_NAME = 'zerotier.controller';

/**
 * Proxy tới ZeroTier controller API thật (chuẩn ZeroTier, không phải API tự nghĩ ra — xem
 * https://docs.zerotier.com/service/v1 mục Controller). Địa chỉ + secret_ref lấy qua
 * ServiceRegistry.resolve('zerotier.controller') (ADR-04 — KHÔNG hard-code IP/port ở đây), secret
 * thật qua EnvCredentialResolver (ADR-05 — chỉ secret_ref trong DB). Endpoint thật hiện đăng ký
 * trỏ tới zt-api-proxy (không phải controller 9993 trực tiếp — controller nằm trong Docker network
 * nội bộ, không publish port ra ngoài) — proxy dùng lại đúng header X-ZT1-Auth nên code ở đây
 * không cần biết có proxy ở giữa.
 */
@Injectable()
export class ZeroTierService {
  private readonly logger = new Logger(ZeroTierService.name);
  private readonly credentials = new EnvCredentialResolver();
  private controllerAddressCache: string | null = null;

  constructor(
    private readonly registry: ServiceRegistry,
    @Inject(DB_TOKEN) private readonly db: DbClient,
  ) {}

  private async resolveEndpoint(): Promise<{ endpoint: EndpointCandidate; token: string }> {
    const candidates = await this.registry.resolve(SERVICE_NAME);
    const endpoint = candidates.find((c) => !c.inMaintenance) ?? candidates[0];
    if (!endpoint) {
      throw new ApiException(
        'ZEROTIER_NOT_CONFIGURED',
        `No service_endpoints row for service_name="${SERVICE_NAME}" — register the controller first (POST /services/${SERVICE_NAME}/endpoints)`,
      );
    }
    const token = await this.credentials.resolve(endpoint.secretRef);
    if (!token) {
      throw new ApiException(
        'ZEROTIER_NOT_CONFIGURED',
        `service_endpoints "${SERVICE_NAME}" has no resolvable secret_ref — set secret_ref to "env:VAR_NAME" and export the real authtoken.secret content into that env var`,
      );
    }
    return { endpoint, token };
  }

  private async request<T>(
    endpoint: EndpointCandidate,
    token: string,
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${endpoint.protocol}://${endpoint.host}:${endpoint.port}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), endpoint.timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'X-ZT1-Auth': token,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new ApiException('ZEROTIER_UPSTREAM_ERROR', `ZeroTier controller trả HTTP ${res.status} cho ${method} ${path}`);
      }
      const text = await res.text();
      return (text ? JSON.parse(text) : {}) as T;
    } catch (err) {
      if (err instanceof ApiException) throw err;
      throw new ApiException('ZEROTIER_UNREACHABLE', `Không gọi được ZeroTier controller (${endpoint.host}:${endpoint.port}): ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchJson<T>(endpoint: EndpointCandidate, token: string, path: string): Promise<T> {
    return this.request<T>(endpoint, token, 'GET', path);
  }

  private static isoOrNull(epochMs: unknown): string | null {
    return typeof epochMs === 'number' && epochMs > 0 ? new Date(epochMs).toISOString() : null;
  }

  private static versionOrNull(detail: Record<string, unknown>): string | null {
    const { vMajor, vMinor, vRev } = detail as { vMajor?: unknown; vMinor?: unknown; vRev?: unknown };
    if (typeof vMajor === 'number' && typeof vMinor === 'number' && typeof vRev === 'number' && vMajor >= 0) {
      return `${vMajor}.${vMinor}.${vRev}`;
    }
    return null;
  }

  private static toSummary(nwid: string, detail: Record<string, unknown>, memberCount: number): ZtNetworkSummary {
    return {
      id: nwid,
      name: typeof detail?.name === 'string' && detail.name ? detail.name : null,
      private: typeof detail?.private === 'boolean' ? detail.private : null,
      member_count: memberCount,
      // authorizedMemberCount không có sẵn trên mọi bản controller -- trung thực null nếu thiếu.
      authorized_member_count: typeof detail?.authorizedMemberCount === 'number' ? (detail.authorizedMemberCount as number) : null,
    };
  }

  private static toDetail(nwid: string, detail: Record<string, unknown>, memberCount: number): ZtNetworkDetail {
    const v4AssignMode = detail?.v4AssignMode as { zt?: unknown } | undefined;
    const pools = Array.isArray(detail?.ipAssignmentPools) ? (detail.ipAssignmentPools as Record<string, unknown>[]) : [];
    const routes = Array.isArray(detail?.routes) ? (detail.routes as Record<string, unknown>[]) : [];
    const dns = detail?.dns as { domain?: unknown; servers?: unknown } | undefined;
    return {
      ...ZeroTierService.toSummary(nwid, detail, memberCount),
      auto_assign_v4: typeof v4AssignMode?.zt === 'boolean' ? v4AssignMode.zt : null,
      ip_assignment_pools: pools
        .filter((p) => typeof p.ipRangeStart === 'string' && typeof p.ipRangeEnd === 'string')
        .map((p) => ({ ip_range_start: p.ipRangeStart as string, ip_range_end: p.ipRangeEnd as string })),
      routes: routes
        .filter((r) => typeof r.target === 'string')
        .map((r) => ({ target: r.target as string, via: typeof r.via === 'string' ? (r.via as string) : null })),
      dns: dns && typeof dns.domain === 'string' && dns.domain
        ? { domain: dns.domain, servers: Array.isArray(dns.servers) ? (dns.servers as string[]) : [] }
        : null,
    };
  }

  /**
   * `name` không có nguồn thật trên controller (member object chuẩn ZeroTier không có field
   * này) — lấy từ `zerotierMemberLabels` (alias riêng của hệ thống này, xem migration 0012).
   * `online` cũng không có sẵn trực tiếp — suy ra từ /peer thật (controller không có "/active"),
   * NHƯNG /peer chỉ là góc nhìn của CHÍNH controller (nó có đang liên lạc trực tiếp với thiết bị
   * hay không), không phải góc nhìn toàn mạng — sau khi 2 thiết bị đã bắt tay P2P xong, traffic
   * thật đi thẳng giữa chúng, không qua controller nữa, nên 1 thiết bị hoàn toàn online thật vẫn
   * có thể không có path nào tới controller lúc đó (đã xác nhận thật qua ping thủ công — xem
   * lịch sử trò chuyện). Vì vậy CHỈ true là khẳng định chắc; false/null đều là "không có tín hiệu
   * trực tiếp", không phải "chắc chắn offline":
   * - true: có path active=true trong /peer ngay lúc gọi -- chắc chắn đang liên lạc được.
   * - false: KHÔNG có path active NHƯNG đã từng kết nối ít nhất 1 lần (có version thật).
   * - null: chưa từng thấy kết nối nào (không version).
   */
  private static toMember(memberId: string, detail: Record<string, unknown>, label: string | null, hasActivePath: boolean): ZtMember {
    const version = ZeroTierService.versionOrNull(detail);
    return {
      id: memberId,
      address: typeof detail?.address === 'string' ? detail.address : memberId,
      name: label,
      authorized: typeof detail?.authorized === 'boolean' ? detail.authorized : null,
      online: hasActivePath ? true : version !== null ? false : null,
      ip_assignments: Array.isArray(detail?.ipAssignments) ? (detail.ipAssignments as string[]) : [],
      physical_address: typeof detail?.physicalAddress === 'string' && detail.physicalAddress ? detail.physicalAddress : null,
      version,
      last_authorized_at: ZeroTierService.isoOrNull(detail?.lastAuthorizedTime),
      last_deauthorized_at: ZeroTierService.isoOrNull(detail?.lastDeauthorizedTime),
    };
  }

  private async countMembers(endpoint: EndpointCandidate, token: string, networkId: string): Promise<number> {
    const membersMap = await this.fetchJson<Record<string, number>>(endpoint, token, `/controller/network/${networkId}/member`);
    return Object.keys(membersMap ?? {}).length;
  }

  /** Địa chỉ node của chính controller (10 ký tự hex) — cần để build đường dẫn tạo network mới. */
  private async getControllerAddress(endpoint: EndpointCandidate, token: string): Promise<string> {
    if (this.controllerAddressCache) return this.controllerAddressCache;
    const status = await this.fetchJson<Record<string, unknown>>(endpoint, token, '/status');
    const address = typeof status?.address === 'string' ? status.address : null;
    if (!address) {
      throw new ApiException('ZEROTIER_UPSTREAM_ERROR', 'Controller không trả về "address" ở /status — không thể tạo network mới');
    }
    this.controllerAddressCache = address;
    return address;
  }

  /**
   * Danh sách network do controller này quản lý + số thành viên (đếm thật từ /member, controller
   * không luôn trả sẵn member_count trên chính network object).
   */
  async listNetworks(): Promise<ZtNetworkSummary[]> {
    const { endpoint, token } = await this.resolveEndpoint();
    // Controller thật trả về mảng ID (["8056c2e21c000001", ...]), không phải object map —
    // xử lý cả 2 dạng phòng khi phiên bản controller khác trả object (một số bản cũ ghi nhận có).
    const raw = await this.fetchJson<string[] | Record<string, string>>(endpoint, token, '/controller/network');
    const ids = Array.isArray(raw) ? raw : Object.keys(raw ?? {});

    return Promise.all(
      ids.map(async (nwid): Promise<ZtNetworkSummary> => {
        const [detail, memberCount] = await Promise.all([
          this.fetchJson<Record<string, unknown>>(endpoint, token, `/controller/network/${nwid}`),
          this.countMembers(endpoint, token, nwid),
        ]);
        return ZeroTierService.toSummary(nwid, detail, memberCount);
      }),
    );
  }

  /** Chi tiết đầy đủ 1 network (IP pool, route, DNS, auto-assign) — dùng để nạp form chỉnh sửa. */
  async getNetwork(networkId: string): Promise<ZtNetworkDetail> {
    const { endpoint, token } = await this.resolveEndpoint();
    const [detail, memberCount] = await Promise.all([
      this.fetchJson<Record<string, unknown>>(endpoint, token, `/controller/network/${networkId}`),
      this.countMembers(endpoint, token, networkId),
    ]);
    return ZeroTierService.toDetail(networkId, detail, memberCount);
  }

  /** Tạo network mới trên controller — ZeroTier yêu cầu POST vào /controller/network/{controllerAddress}______ (6 dấu gạch dưới). */
  async createNetwork(input: CreateNetworkInput): Promise<ZtNetworkDetail> {
    const { endpoint, token } = await this.resolveEndpoint();
    const controllerAddress = await this.getControllerAddress(endpoint, token);
    const created = await this.request<Record<string, unknown>>(
      endpoint,
      token,
      'POST',
      `/controller/network/${controllerAddress}______`,
      { name: input.name, private: input.private },
    );
    const nwid = typeof created?.id === 'string' ? created.id : typeof created?.nwid === 'string' ? (created.nwid as string) : null;
    if (!nwid) {
      throw new ApiException('ZEROTIER_UPSTREAM_ERROR', 'Controller không trả về id network vừa tạo');
    }
    this.logger.log(`Đã tạo ZeroTier network "${input.name}" (${nwid})`);
    return ZeroTierService.toDetail(nwid, created, 0);
  }

  /** Cập nhật network — chỉ gửi field người dùng thật sự đổi (merge phía controller, không phải replace toàn bộ). */
  async updateNetwork(networkId: string, input: UpdateNetworkInput): Promise<ZtNetworkDetail> {
    const { endpoint, token } = await this.resolveEndpoint();
    const body: Record<string, unknown> = {};
    if (input.name !== undefined) body.name = input.name;
    if (input.private !== undefined) body.private = input.private;
    if (input.auto_assign_v4 !== undefined) body.v4AssignMode = { zt: input.auto_assign_v4 };
    if (input.ip_assignment_pools !== undefined) {
      body.ipAssignmentPools = input.ip_assignment_pools.map((p) => ({ ipRangeStart: p.ip_range_start, ipRangeEnd: p.ip_range_end }));
    }
    if (input.routes !== undefined) {
      body.routes = input.routes.map((r) => ({ target: r.target, via: r.via ?? null }));
    }
    if (input.dns !== undefined) {
      body.dns = input.dns ? { domain: input.dns.domain, servers: input.dns.servers } : { domain: '', servers: [] };
    }

    const updated = await this.request<Record<string, unknown>>(endpoint, token, 'POST', `/controller/network/${networkId}`, body);
    const memberCount = await this.countMembers(endpoint, token, networkId);
    return ZeroTierService.toDetail(networkId, updated, memberCount);
  }

  async deleteNetwork(networkId: string): Promise<void> {
    const { endpoint, token } = await this.resolveEndpoint();
    await this.request(endpoint, token, 'DELETE', `/controller/network/${networkId}`);
    this.logger.log(`Đã xoá ZeroTier network ${networkId}`);
  }

  /**
   * ZeroTier controller không có endpoint "/active" cho online/offline — suy ra thật từ /peer
   * (danh sách peer controller đang/từng liên lạc): có ít nhất 1 path active=true nghĩa là vừa
   * trao đổi gói tin thật gần đây. Lọc role=LEAF (bỏ PLANET/root server — không phải thành viên
   * network nào), nhưng thực ra chỉ cần match đúng address nên không bắt buộc lọc role.
   */
  private async getOnlineAddresses(endpoint: EndpointCandidate, token: string): Promise<Set<string>> {
    const peers = await this.fetchJson<Array<{ address?: unknown; paths?: Array<{ active?: unknown }> }>>(endpoint, token, '/peer');
    const online = new Set<string>();
    for (const peer of peers ?? []) {
      if (typeof peer.address === 'string' && Array.isArray(peer.paths) && peer.paths.some((p) => p?.active === true)) {
        online.add(peer.address);
      }
    }
    return online;
  }

  private async getLabels(networkId: string): Promise<Map<string, string>> {
    const rows = await this.db.select().from(zerotierMemberLabels).where(eq(zerotierMemberLabels.networkId, networkId));
    return new Map(rows.map((r) => [r.memberId, r.label]));
  }

  /** Chi tiết từng thành viên của 1 network — gọi khi người dùng mở 1 network cụ thể, không phải ở list tổng quan. */
  async listMembers(networkId: string): Promise<ZtMember[]> {
    const { endpoint, token } = await this.resolveEndpoint();
    const [membersMap, onlineAddresses, labels] = await Promise.all([
      this.fetchJson<Record<string, number>>(endpoint, token, `/controller/network/${networkId}/member`),
      this.getOnlineAddresses(endpoint, token),
      this.getLabels(networkId),
    ]);
    const memberIds = Object.keys(membersMap ?? {});

    return Promise.all(
      memberIds.map(async (memberId): Promise<ZtMember> => {
        const detail = await this.fetchJson<Record<string, unknown>>(endpoint, token, `/controller/network/${networkId}/member/${memberId}`);
        return ZeroTierService.toMember(memberId, detail, labels.get(memberId) ?? null, onlineAddresses.has(memberId));
      }),
    );
  }

  /**
   * Cấp phép / thu hồi / gán IP tay / đặt tên cho 1 thành viên. Khi gán ip_assignments tay, kèm
   * theo noAutoAssignIps:true — nếu không, controller (khi auto-assign đang bật) sẽ tự ghi đè IP
   * tay lại bằng IP nó tự cấp ở lần commit kế tiếp (hành vi thật của ZeroTier). Field `name`
   * KHÔNG gửi lên controller (không có field này thật) — chỉ lưu vào zerotierMemberLabels.
   */
  async updateMember(networkId: string, memberId: string, input: UpdateMemberInput): Promise<ZtMember> {
    const { endpoint, token } = await this.resolveEndpoint();
    const body: Record<string, unknown> = {};
    if (input.authorized !== undefined) body.authorized = input.authorized;
    if (input.ip_assignments !== undefined) {
      body.ipAssignments = input.ip_assignments;
      body.noAutoAssignIps = true;
    }

    const [updated] = await Promise.all([
      Object.keys(body).length > 0
        ? this.request<Record<string, unknown>>(endpoint, token, 'POST', `/controller/network/${networkId}/member/${memberId}`, body)
        : this.fetchJson<Record<string, unknown>>(endpoint, token, `/controller/network/${networkId}/member/${memberId}`),
      input.name !== undefined
        ? input.name
          ? this.db
              .insert(zerotierMemberLabels)
              .values({ networkId, memberId, label: input.name })
              .onConflictDoUpdate({ target: [zerotierMemberLabels.networkId, zerotierMemberLabels.memberId], set: { label: input.name, updatedAt: new Date() } })
          : this.db.delete(zerotierMemberLabels).where(and(eq(zerotierMemberLabels.networkId, networkId), eq(zerotierMemberLabels.memberId, memberId)))
        : Promise.resolve(undefined),
    ]);

    const [onlineAddresses, labels] = await Promise.all([this.getOnlineAddresses(endpoint, token), this.getLabels(networkId)]);
    return ZeroTierService.toMember(memberId, updated, labels.get(memberId) ?? null, onlineAddresses.has(memberId));
  }

  async deleteMember(networkId: string, memberId: string): Promise<void> {
    const { endpoint, token } = await this.resolveEndpoint();
    await this.request(endpoint, token, 'DELETE', `/controller/network/${networkId}/member/${memberId}`);
    await this.db.delete(zerotierMemberLabels).where(and(eq(zerotierMemberLabels.networkId, networkId), eq(zerotierMemberLabels.memberId, memberId)));
    this.logger.log(`Đã xoá thành viên ${memberId} khỏi network ${networkId}`);
  }
}
