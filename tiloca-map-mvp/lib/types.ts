export type ScanStatus = "IDLE" | "RUNNING" | "COMPLETED" | "FAILED";

export type Suitability = "" | "alta" | "media" | "bassa" | "nulla" | "errore";

export type ReportState = "new" | "needs_review" | "qualified" | "report_ready" | "excluded";
export type PipelineState = "" | ReportState;
export type ShortlistFilter = "all" | "qualified" | "report_ready" | "excluded";
export type SortMode = "opportunity_score" | "estimated_kwp" | "area_mq";
export type DeliveryQuickFilter =
  | "all"
  | "needs_review"
  | "qualified"
  | "report_ready"
  | "high_confidence"
  | "missing_company_address"
  | "suspicious_geometry";
export type DataQualityConfidence = "high" | "medium" | "low";
export type DataQualityWarning =
  | "oversized_area"
  | "missing_company_name"
  | "missing_address"
  | "generic_osm_asset"
  | "unusually_high_kwp"
  | "needs_manual_geometry_check"
  | "low_metadata_confidence";
export type RecommendedState =
  | "needs_review"
  | "qualified"
  | "report_ready_candidate"
  | "excluded_candidate";
export type CommercialFitLabel =
  | "ideal_sme_ci"
  | "large_enterprise_review"
  | "low_confidence_review"
  | "not_profile_fit";
export type CommercialAction =
  | "prioritize"
  | "verify_manually"
  | "exclude_from_imel_package"
  | "maybe_useful_for_larger_epc";

export type Territory = {
  id: number;
  slug: string;
  name: string;
  profile: string;
  min_area_mq: number;
  min_kwp: number;
  bbox_lat_min: number;
  bbox_lon_min: number;
  bbox_lat_max: number;
  bbox_lon_max: number;
  created_at: string;
};

export type AssetPipelineState = {
  state: string;
  reason: string | null;
  updated_at: string;
};

export type CompanyMatch = {
  id: number;
  asset_id: number;
  company_name: string | null;
  address: string | null;
  website: string | null;
  category: string | null;
  source: string;
  distance_meters: number | null;
  match_confidence: "high" | "medium" | "low" | "none";
  match_score: number;
  match_reason: string | null;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type AssetAnalysis = {
  id: number;
  scan_id: number;
  roof_type: string | null;
  roof_quality: string | null;
  orientation: string | null;
  obstacles: string | null;
  has_panels: boolean;
  suitability: string;
  estimated_kwp: number;
  satellite_image_path: string | null;
  notes: string | null;
  raw_vision: Record<string, unknown> | null;
  created_at: string;
};

export type Asset = {
  id: number;
  territory_id: number;
  osm_id: string;
  name: string | null;
  address: string | null;
  building_type: string | null;
  lat: number;
  lon: number;
  area_mq: number;
  estimated_kwp: number | null;
  roof_type: string | null;
  suitability: string | null;
  satellite_image_path: string | null;
  industrial_metadata?: Record<string, unknown> | null;
  first_seen_at: string;
  last_seen_at: string;
  pipeline_state: AssetPipelineState | null;
  company_match: CompanyMatch | null;
};

export type RankedAsset = Asset & {
  rank: number;
  opportunity_score: number;
  score_label: "high" | "medium" | "low";
  score_components: OpportunityScoreComponents;
  report_state: ReportState;
  data_quality: DataQuality;
  recommended_state: RecommendedState;
  recommendation_reason: string;
  commercial_fit: CommercialFit;
};

export type OpportunityScoreComponents = {
  capacity_score: number;
  roof_score: number;
  pv_absence_score: number;
  industrial_score: number;
};

export type DataQuality = {
  confidence: DataQualityConfidence;
  warnings: DataQualityWarning[];
  manual_checks: string[];
};

export type CommercialFit = {
  profile_name: string;
  label: CommercialFitLabel;
  reason: string;
  recommended_action: CommercialAction;
};

export type DeliveryProjectConfig = {
  profile_name: string;
  client_name: string;
  target_provinces: string;
  target_opportunity_count: number;
  min_area_mq: number;
  min_kwp: number;
  max_area_mq: number;
  max_kwp: number;
  accepted_suitability: Array<"alta" | "media" | "bassa">;
};

export type DeliveryProgress = {
  target: number;
  qualified: number;
  report_ready: number;
  needs_review: number;
  excluded: number;
  remaining: number;
};

export type AssetDetail = Asset & {
  analyses: AssetAnalysis[];
  industrial_metadata?: Record<string, unknown> | null;
};

export type ScanResponse = {
  id: number;
  territory_id: number;
  status: string;
  profile: string;
  max_assets: number;
  osm_candidates_count: number;
  analyzed_count: number;
  persisted_count: number;
  rejected_count: number;
  skipped_count: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

export type CompanyFirstScanResponse = {
  profile_slug: string;
  province: string;
  zone_group: string | null;
  max_places: number;
  companies_found: number;
  after_blacklist_dedup: number;
  roofs_analyzed: number;
  accepted_opportunities: number;
  rejected_opportunities: number;
  status: string;
  error: string | null;
};

export type OpenApiCompanyScanResponse = {
  companies_found: number;
  companies_with_coordinates: number;
  roofs_analyzed: number;
  accepted_opportunities: number;
  rejected_opportunities: number;
  cost_estimate: unknown | null;
  status: string;
  error: string | null;
};

export type DeliveryStatus = "draft" | "active" | "delivered" | "archived";

export type Delivery = {
  id: number;
  slug: string;
  client_name: string;
  client_contact: string | null;
  target_provinces: string[];
  criteria: Record<string, unknown>;
  status: DeliveryStatus;
  target_opportunity_count: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  delivered_at: string | null;
  asset_count?: number;
};

export type DeliveryAssetsResponse = {
  delivery: Delivery & { asset_count: number };
  assets: Asset[];
};

export type DeliveryRunResponse = {
  delivery: Delivery & { asset_count: number };
  scan_results: Array<Record<string, unknown>>;
  new_asset_count: number;
  associated_asset_count: number;
};
