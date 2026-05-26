import type {
  Asset,
  AssetDetail,
  CompanyFirstScanResponse,
  CompanyMatch,
  Delivery,
  DeliveryAssetsResponse,
  DeliveryRunResponse,
  OpenApiCompanyScanResponse,
  ReportState,
  ScanAssetsResponse,
  ScanResponse,
  Suitability,
  Territory,
  TerritoryOverview,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // Keep HTTP status when response is not JSON.
    }
    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}

export function satelliteImageUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const normalized = path.replaceAll("\\", "/");
  const storageIndex = normalized.indexOf("storage/");
  if (storageIndex >= 0) {
    return `${API_BASE}/${normalized.slice(storageIndex)}`;
  }
  if (normalized.startsWith("/storage/")) {
    return `${API_BASE}${normalized}`;
  }
  return null;
}

export async function getTerritories(): Promise<Territory[]> {
  return request<Territory[]>("/territories");
}

export async function getTerritoryOverview(slug: string): Promise<TerritoryOverview> {
  return request<TerritoryOverview>(`/territories/${slug}/overview`);
}

export async function getAssets(params: {
  territory?: string;
  suitability?: Suitability;
  minAreaMq?: number;
  minKwp?: number;
  maxAreaMq?: number;
  maxKwp?: number;
  limit?: number;
}): Promise<Asset[]> {
  const query = new URLSearchParams();
  if (params.territory) query.set("territory", params.territory);
  if (params.suitability) query.set("suitability", params.suitability);
  if (params.minAreaMq) query.set("min_area_mq", String(params.minAreaMq));
  if (params.minKwp) query.set("min_kwp", String(params.minKwp));
  if (params.maxAreaMq) query.set("max_area_mq", String(params.maxAreaMq));
  if (params.maxKwp) query.set("max_kwp", String(params.maxKwp));
  if (params.limit) query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<Asset[]>(`/assets${suffix}`);
}

export async function getAsset(id: number): Promise<AssetDetail> {
  return request<AssetDetail>(`/assets/${id}`);
}

export async function getScanAssets(scanId: number): Promise<ScanAssetsResponse> {
  return request<ScanAssetsResponse>(`/scans/${scanId}/assets`);
}

export async function updateAssetState(
  id: number,
  state: ReportState,
  reason?: string
): Promise<AssetDetail> {
  return request<AssetDetail>(`/assets/${id}/state`, {
    method: "PATCH",
    body: JSON.stringify({ state, reason }),
  });
}

export async function matchCompany(id: number): Promise<CompanyMatch> {
  return request<CompanyMatch>(`/assets/${id}/match-company`, {
    method: "POST",
  });
}

export async function triggerScan(
  territory: string,
  maxAssets = 1,
  options?: {
    minAreaMq?: number;
    minKwp?: number;
    maxAreaMq?: number;
    maxKwp?: number;
    suitabilityLevels?: string[];
  }
): Promise<ScanResponse> {
  return request<ScanResponse>(`/scan/${territory}`, {
    method: "POST",
    body: JSON.stringify({
      max_assets: maxAssets,
      min_area_mq: options?.minAreaMq,
      min_kwp: options?.minKwp,
      max_area_mq: options?.maxAreaMq,
      max_kwp: options?.maxKwp,
      suitability_levels: options?.suitabilityLevels,
    }),
  });
}

export async function triggerCompanyFirstScan(
  profileSlug: "imel",
  options: {
    province?: string;
    zoneGroup?: string;
    maxPlaces?: number;
    minAreaMq?: number;
    maxAreaMq?: number;
    minKwp?: number;
    maxKwp?: number;
    maxResults?: number;
  }
): Promise<CompanyFirstScanResponse> {
  return request<CompanyFirstScanResponse>(`/company-scan/${profileSlug}`, {
    method: "POST",
    body: JSON.stringify({
      province: options.province,
      zone_group: options.zoneGroup,
      max_places: options.maxPlaces,
      min_area_mq: options.minAreaMq,
      max_area_mq: options.maxAreaMq,
      min_kwp: options.minKwp,
      max_kwp: options.maxKwp,
      max_results: options.maxResults,
    }),
  });
}

export async function triggerOpenApiCompanyScan(options: {
  province: string;
  atecoCode?: string;
  minEmployees?: number;
  maxEmployees?: number;
  minTurnover?: number;
  maxTurnover?: number;
  minAreaMq?: number;
  maxAreaMq?: number;
  minKwp?: number;
  maxKwp?: number;
  limit?: number;
  dryRun?: boolean;
}): Promise<OpenApiCompanyScanResponse> {
  return request<OpenApiCompanyScanResponse>("/company-scan/openapi", {
    method: "POST",
    body: JSON.stringify({
      province: options.province,
      atecoCode: options.atecoCode,
      minEmployees: options.minEmployees,
      maxEmployees: options.maxEmployees,
      minTurnover: options.minTurnover,
      maxTurnover: options.maxTurnover,
      min_area_mq: options.minAreaMq,
      max_area_mq: options.maxAreaMq,
      min_kwp: options.minKwp,
      max_kwp: options.maxKwp,
      limit: options.limit,
      dryRun: options.dryRun ?? true,
      dataEnrichment: false,
    }),
  });
}

export async function listDeliveries(status?: string): Promise<Delivery[]> {
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<Delivery[]>(`/deliveries${suffix}`);
}

export async function getDelivery(slug: string): Promise<Delivery & { asset_count: number }> {
  return request<Delivery & { asset_count: number }>(`/deliveries/${slug}`);
}

export async function createDelivery(data: {
  client_name: string;
  client_contact?: string | null;
  target_provinces: string[];
  criteria: Record<string, unknown>;
  status?: string;
  target_opportunity_count?: number | null;
  notes?: string | null;
}): Promise<Delivery> {
  return request<Delivery>("/deliveries", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getDeliveryAssets(slug: string): Promise<DeliveryAssetsResponse> {
  return request<DeliveryAssetsResponse>(`/deliveries/${slug}/assets`);
}

export async function runDeliveryOpenApiScan(slug: string, _dryRun?: boolean): Promise<DeliveryRunResponse> {
  return request<DeliveryRunResponse>(`/deliveries/${slug}/run-openapi-scan`, {
    method: "POST",
  });
}

export async function includeAssetInDelivery(slug: string, assetId: number): Promise<Delivery & { asset_count: number }> {
  return request<Delivery & { asset_count: number }>(`/deliveries/${slug}/include-asset`, {
    method: "POST",
    body: JSON.stringify({ asset_id: assetId }),
  });
}

export async function excludeAssetFromDelivery(slug: string, assetId: number): Promise<Delivery & { asset_count: number }> {
  return request<Delivery & { asset_count: number }>(`/deliveries/${slug}/exclude-asset/${assetId}`, {
    method: "DELETE",
  });
}
