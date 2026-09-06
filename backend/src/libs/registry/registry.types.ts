export interface EndpointCandidate {
  id: string;
  serviceName: string;
  serviceType: string;
  host: string;
  port: number;
  protocol: string;
  priority: number;
  healthcheckType: string;
  healthcheckIntervalS: number;
  timeoutMs: number;
  secretRef: string | null;
  tls: unknown;
  checkConfig: Record<string, unknown>;
  inMaintenance: boolean;
  shipScope: unknown;
}

export const ENDPOINT_CHANGED_EVENT = 'registry.endpoint.changed';
