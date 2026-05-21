"use client";

import type {
  CompanyFirstScanResponse,
  DeliveryProgress,
  DeliveryProjectConfig,
  DeliveryQuickFilter,
  OpenApiCompanyScanResponse,
  PipelineState,
  RankedAsset,
  ReportState,
  ScanResponse,
  ScanStatus,
  ShortlistFilter,
  SortMode,
  Suitability,
  Territory,
} from "@/lib/types";
import { ScanStatus as ScanStatusView } from "./ScanStatus";

type LeftControlsProps = {
  territories: Territory[];
  territory: string;
  suitability: Suitability;
  minArea: number;
  minKwp: number;
  maxArea: number;
  maxKwp: number;
  pipelineState: PipelineState;
  shortlistFilter: ShortlistFilter;
  scanSize: number;
  targetOpportunities: number;
  sortMode: SortMode;
  deliveryConfig: DeliveryProjectConfig;
  deliveryProgress: DeliveryProgress;
  deliveryQuickFilter: DeliveryQuickFilter;
  scanStatus: ScanStatus;
  scanMessage?: string;
  apiAssetCount: number;
  visibleAssetCount: number;
  assets: RankedAsset[];
  selectedAssetId: number | null;
  filterSummary: string[];
  noAssetsReason?: string;
  lastScan: ScanResponse | null;
  lastCompanyFirstScan: CompanyFirstScanResponse | null;
  lastOpenApiCompanyScan: OpenApiCompanyScanResponse | null;
  openApiAtecoCode: string;
  openApiMinEmployees: number;
  openApiMaxEmployees: number;
  openApiLimit: number;
  lastRefreshAt: string | null;
  loading: boolean;
  onTerritoryChange: (value: string) => void;
  onSuitabilityChange: (value: Suitability) => void;
  onMinAreaChange: (value: number) => void;
  onMinKwpChange: (value: number) => void;
  onMaxAreaChange: (value: number) => void;
  onMaxKwpChange: (value: number) => void;
  onPipelineStateChange: (value: PipelineState) => void;
  onShortlistFilterChange: (value: ShortlistFilter) => void;
  onScanSizeChange: (value: number) => void;
  onTargetOpportunitiesChange: (value: number) => void;
  onSortModeChange: (value: SortMode) => void;
  onDeliveryConfigChange: (value: DeliveryProjectConfig) => void;
  onDeliveryQuickFilterChange: (value: DeliveryQuickFilter) => void;
  onOpenApiAtecoCodeChange: (value: string) => void;
  onOpenApiMinEmployeesChange: (value: number) => void;
  onOpenApiMaxEmployeesChange: (value: number) => void;
  onOpenApiLimitChange: (value: number) => void;
  onScan: () => void;
  onCompanyFirstScan: () => void;
  onOpenApiCompanyScan: () => void;
  onRefresh: () => void;
  onExportCsv: () => void;
  onExportReportReadyCsv: () => void;
  onStateChange: (assetId: number, state: ReportState) => void;
  onAssetSelect: (id: number) => void;
};

const suitabilityOptions: Array<{ label: string; value: Suitability }> = [
  { label: "All suitability", value: "" },
  { label: "Alta", value: "alta" },
  { label: "Media", value: "media" },
  { label: "Bassa", value: "bassa" },
  { label: "Nulla", value: "nulla" },
  { label: "Errore", value: "errore" },
];

const pipelineOptions: Array<{ label: string; value: PipelineState }> = [
  { label: "All states", value: "" },
  { label: "New", value: "new" },
  { label: "Needs review", value: "needs_review" },
  { label: "Qualified", value: "qualified" },
  { label: "Report ready", value: "report_ready" },
  { label: "Excluded", value: "excluded" },
];

const shortlistOptions: Array<{ label: string; value: ShortlistFilter }> = [
  { label: "All opportunities", value: "all" },
  { label: "Qualified", value: "qualified" },
  { label: "Report-ready", value: "report_ready" },
  { label: "Excluded", value: "excluded" },
];

const sortOptions: Array<{ label: string; value: SortMode }> = [
  { label: "Priority score", value: "opportunity_score" },
  { label: "Estimated kWp", value: "estimated_kwp" },
  { label: "Roof area", value: "area_mq" },
];

const deliveryQuickFilters: Array<{ label: string; value: DeliveryQuickFilter }> = [
  { label: "All delivery candidates", value: "all" },
  { label: "Needs review", value: "needs_review" },
  { label: "Qualified", value: "qualified" },
  { label: "Report-ready", value: "report_ready" },
  { label: "High confidence only", value: "high_confidence" },
  { label: "Missing company/address", value: "missing_company_address" },
  { label: "Oversized/suspicious geometry", value: "suspicious_geometry" },
];

const targetOptions = [10, 20, 30];

const reportStateLabel: Record<string, string> = {
  new: "new",
  needs_review: "needs review",
  watchlist: "watchlist",
  qualified: "qualified",
  report_ready: "report ready",
  excluded: "excluded",
};

const scanSizes = [1, 5, 10, 20];

function fmtNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("it-IT").format(value);
}

function assetTitle(asset: RankedAsset): string {
  if (
    asset.company_match?.company_name &&
    (asset.company_match.match_confidence === "high" || asset.company_match.match_confidence === "medium")
  ) {
    return asset.company_match.company_name;
  }
  return asset.name || `OSM ${asset.osm_id}`;
}

function suitabilityDot(value: string | null): string {
  if (value === "alta") return "bg-tiloca-green";
  if (value === "media") return "bg-tiloca-amber";
  if (value === "bassa") return "bg-slate-400";
  if (value === "nulla" || value === "errore") return "bg-red-400";
  return "bg-white/35";
}

function needsWarning(asset: RankedAsset): boolean {
  return (
    asset.data_quality.confidence === "low" ||
    asset.recommended_state === "needs_review" ||
    asset.data_quality.warnings.includes("missing_company_name") ||
    asset.data_quality.warnings.includes("missing_address")
  );
}

function assetSource(asset: RankedAsset): string {
  const source = asset.industrial_metadata?.source;
  return typeof source === "string" ? source : "roof_first";
}

export function LeftControls({
  territories,
  territory,
  suitability,
  minArea,
  minKwp,
  maxArea,
  maxKwp,
  pipelineState,
  shortlistFilter,
  scanSize,
  targetOpportunities,
  sortMode,
  deliveryConfig,
  deliveryProgress,
  deliveryQuickFilter,
  scanStatus,
  scanMessage,
  apiAssetCount,
  visibleAssetCount,
  assets,
  selectedAssetId,
  filterSummary,
  noAssetsReason,
  lastScan,
  lastCompanyFirstScan,
  lastOpenApiCompanyScan,
  openApiAtecoCode,
  openApiMinEmployees,
  openApiMaxEmployees,
  openApiLimit,
  lastRefreshAt,
  loading,
  onTerritoryChange,
  onSuitabilityChange,
  onMinAreaChange,
  onMinKwpChange,
  onMaxAreaChange,
  onMaxKwpChange,
  onPipelineStateChange,
  onShortlistFilterChange,
  onScanSizeChange,
  onTargetOpportunitiesChange,
  onSortModeChange,
  onDeliveryConfigChange,
  onDeliveryQuickFilterChange,
  onOpenApiAtecoCodeChange,
  onOpenApiMinEmployeesChange,
  onOpenApiMaxEmployeesChange,
  onOpenApiLimitChange,
  onScan,
  onCompanyFirstScan,
  onOpenApiCompanyScan,
  onRefresh,
  onExportCsv,
  onExportReportReadyCsv,
  onStateChange,
  onAssetSelect,
}: LeftControlsProps) {
  const qualifiedCount = assets.filter(
    (asset) => asset.report_state !== "excluded" && asset.opportunity_score >= 52
  ).length;

  const updateConfig = (patch: Partial<DeliveryProjectConfig>) => {
    onDeliveryConfigChange({ ...deliveryConfig, ...patch });
  };

  const toggleAcceptedSuitability = (value: "alta" | "media" | "bassa") => {
    const current = deliveryConfig.accepted_suitability;
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    updateConfig({ accepted_suitability: next.length ? next : [value] });
  };

  return (
    <aside className="console-panel fixed bottom-0 left-0 top-0 z-20 flex w-[300px] flex-col border-r">
      <div className="border-b border-white/10 px-5 py-5">
        <div className="font-display text-lg font-semibold tracking-tight text-white">
          Tiloca
        </div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-tiloca-green/80">
          Territorial Console
        </div>
      </div>

      <div className="thin-scroll flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <section className="space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
            Client Delivery Mode
          </div>
          <div className="field-shell px-3 py-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/32">
              Delivery profile
            </div>
            <div className="mt-1 font-mono text-xs text-tiloca-green">
              {deliveryConfig.profile_name}
            </div>
          </div>
          <label className="field-shell block px-3 py-2">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
              Client
            </span>
            <input
              value={deliveryConfig.client_name}
              onChange={(event) => updateConfig({ client_name: event.target.value })}
              className="w-full bg-transparent text-sm text-white outline-none"
            />
          </label>
          <label className="field-shell block px-3 py-2">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
              Target provinces
            </span>
            <input
              value={deliveryConfig.target_provinces}
              onChange={(event) => updateConfig({ target_provinces: event.target.value })}
              className="w-full bg-transparent text-sm text-white outline-none"
            />
          </label>
          <div className="grid grid-cols-3 gap-1">
            {targetOptions.map((target) => (
              <button
                key={target}
                onClick={() => {
                  onTargetOpportunitiesChange(target);
                  updateConfig({ target_opportunity_count: target });
                }}
                className={`border px-2 py-2 font-mono text-[11px] transition ${
                  deliveryConfig.target_opportunity_count === target
                    ? "border-tiloca-green/50 bg-tiloca-green/12 text-tiloca-green"
                    : "border-white/10 bg-white/[0.04] text-white/55 hover:border-white/20"
                }`}
              >
                {target}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="field-shell block px-3 py-2">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
                Min area
              </span>
              <input
                value={deliveryConfig.min_area_mq}
                min={0}
                step={500}
                type="number"
                onChange={(event) => updateConfig({ min_area_mq: Number(event.target.value) || 0 })}
                className="w-full bg-transparent font-mono text-sm text-white outline-none"
              />
            </label>
            <label className="field-shell block px-3 py-2">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
                Min kWp
              </span>
              <input
                value={deliveryConfig.min_kwp}
                min={0}
                step={50}
                type="number"
                onChange={(event) => updateConfig({ min_kwp: Number(event.target.value) || 0 })}
                className="w-full bg-transparent font-mono text-sm text-white outline-none"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="field-shell block px-3 py-2">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
                Max area
              </span>
              <input
                value={deliveryConfig.max_area_mq}
                min={0}
                step={1000}
                type="number"
                onChange={(event) => {
                  const value = Number(event.target.value) || 0;
                  onMaxAreaChange(value);
                  updateConfig({ max_area_mq: value });
                }}
                className="w-full bg-transparent font-mono text-sm text-white outline-none"
              />
            </label>
            <label className="field-shell block px-3 py-2">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
                Max kWp
              </span>
              <input
                value={deliveryConfig.max_kwp}
                min={0}
                step={100}
                type="number"
                onChange={(event) => {
                  const value = Number(event.target.value) || 0;
                  onMaxKwpChange(value);
                  updateConfig({ max_kwp: value });
                }}
                className="w-full bg-transparent font-mono text-sm text-white outline-none"
              />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {(["alta", "media", "bassa"] as const).map((item) => (
              <button
                key={item}
                onClick={() => toggleAcceptedSuitability(item)}
                className={`border px-2 py-2 font-mono text-[10px] uppercase tracking-[0.12em] transition ${
                  deliveryConfig.accepted_suitability.includes(item)
                    ? "border-tiloca-green/50 bg-tiloca-green/12 text-tiloca-green"
                    : "border-white/10 bg-white/[0.04] text-white/45 hover:border-white/20"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
            Production Progress
          </div>
          <div className="field-shell space-y-2 px-3 py-2">
            <DebugRow label="Report-ready" value={`${fmtNumber(deliveryProgress.report_ready)} / ${fmtNumber(deliveryProgress.target)}`} />
            <DebugRow label="Qualified" value={fmtNumber(deliveryProgress.qualified)} />
            <DebugRow label="Needs review" value={fmtNumber(deliveryProgress.needs_review)} />
            <DebugRow label="Excluded" value={fmtNumber(deliveryProgress.excluded)} />
            <DebugRow label="Remaining" value={fmtNumber(deliveryProgress.remaining)} />
          </div>
        </section>

        <section className="space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
            Delivery Filters
          </div>
          <div className="grid grid-cols-1 gap-1">
            {deliveryQuickFilters.map((item) => (
              <button
                key={item.value}
                onClick={() => onDeliveryQuickFilterChange(item.value)}
                className={`border px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.12em] transition ${
                  deliveryQuickFilter === item.value
                    ? "border-tiloca-green/45 bg-tiloca-green/10 text-tiloca-green"
                    : "border-white/10 bg-white/[0.035] text-white/50 hover:border-white/20"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
            Territory
          </div>
          <label className="field-shell block px-3 py-2">
            <select
              value={territory}
              onChange={(event) => onTerritoryChange(event.target.value)}
              className="w-full bg-transparent text-sm text-white outline-none"
            >
              {territories.map((item) => (
                <option key={item.slug} value={item.slug} className="bg-[#080f1a]">
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="field-shell px-3 py-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/32">
              Qualified opportunities
            </div>
            <div className="mt-1 font-mono text-sm text-tiloca-green">
              {qualifiedCount} / {deliveryConfig.target_opportunity_count || targetOpportunities}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
            Candidates to analyze
          </div>
          <div className="grid grid-cols-4 gap-1">
            {scanSizes.map((size) => (
              <button
                key={size}
                onClick={() => onScanSizeChange(size)}
                className={`border px-2 py-2 font-mono text-[11px] transition ${
                  scanSize === size
                    ? "border-tiloca-green/50 bg-tiloca-green/12 text-tiloca-green"
                    : "border-white/10 bg-white/[0.04] text-white/55 hover:border-white/20"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
          <p className="font-mono text-[10px] leading-relaxed text-white/35">
            This selects candidate roofs to analyze, not final opportunities returned.
          </p>
        </section>

        <section className="space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
            Shortlist Mode
          </div>
          <label className="field-shell block px-3 py-2">
            <select
              value={sortMode}
              onChange={(event) => onSortModeChange(event.target.value as SortMode)}
              className="w-full bg-transparent text-sm text-white outline-none"
            >
              {sortOptions.map((item) => (
                <option key={item.value} value={item.value} className="bg-[#080f1a]">
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field-shell block px-3 py-2">
            <select
              value={shortlistFilter}
              onChange={(event) => onShortlistFilterChange(event.target.value as ShortlistFilter)}
              className="w-full bg-transparent text-sm text-white outline-none"
            >
              {shortlistOptions.map((item) => (
                <option key={item.value} value={item.value} className="bg-[#080f1a]">
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
            Filters
          </div>
          <label className="field-shell block px-3 py-2">
            <select
              value={suitability}
              onChange={(event) => onSuitabilityChange(event.target.value as Suitability)}
              className="w-full bg-transparent text-sm text-white outline-none"
            >
              {suitabilityOptions.map((item) => (
                <option key={item.label} value={item.value} className="bg-[#080f1a]">
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field-shell block px-3 py-2">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
              Minimum area
            </span>
            <input
              value={minArea}
              min={0}
              step={500}
              type="number"
              onChange={(event) => onMinAreaChange(Number(event.target.value) || 0)}
              className="w-full bg-transparent font-mono text-sm text-white outline-none"
            />
          </label>
          <label className="field-shell block px-3 py-2">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
              Minimum kWp
            </span>
            <input
              value={minKwp}
              min={0}
              step={50}
              type="number"
              onChange={(event) => {
                const value = Number(event.target.value) || 0;
                onMinKwpChange(value);
                updateConfig({ min_kwp: value });
              }}
              className="w-full bg-transparent font-mono text-sm text-white outline-none"
            />
          </label>
          <label className="field-shell block px-3 py-2">
            <select
              value={pipelineState}
              onChange={(event) => onPipelineStateChange(event.target.value as PipelineState)}
              className="w-full bg-transparent text-sm text-white outline-none"
            >
              {pipelineOptions.map((item) => (
                <option key={item.label} value={item.value} className="bg-[#080f1a]">
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
            Operations
          </div>
          <button
            onClick={onScan}
            disabled={scanStatus === "RUNNING" || !territory}
            className="w-full border border-tiloca-green/30 bg-tiloca-green/10 px-3 py-3 text-left font-mono text-[11px] uppercase tracking-[0.16em] text-tiloca-green transition hover:bg-tiloca-green/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Analyze top {scanSize} candidate roofs
          </button>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="w-full border border-white/10 bg-white/[0.055] px-3 py-3 text-left font-mono text-[11px] uppercase tracking-[0.16em] text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Refresh Assets
          </button>
          <button
            onClick={onCompanyFirstScan}
            disabled={scanStatus === "RUNNING" || !territory}
            className="w-full border border-tiloca-amber/30 bg-tiloca-amber/10 px-3 py-3 text-left font-mono text-[11px] uppercase tracking-[0.16em] text-tiloca-amber transition hover:bg-tiloca-amber/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Company-first scan
          </button>
          <div className="field-shell space-y-2 px-3 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
              OpenAPI company scan
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-white/28">
                  Province
                </span>
                <input
                  value={territory}
                  readOnly
                  className="w-full border border-white/10 bg-white/[0.035] px-2 py-1.5 font-mono text-[11px] text-white/60 outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-white/28">
                  ATECO
                </span>
                <input
                  value={openApiAtecoCode}
                  onChange={(event) => onOpenApiAtecoCodeChange(event.target.value)}
                  placeholder="25.62"
                  className="w-full border border-white/10 bg-white/[0.035] px-2 py-1.5 font-mono text-[11px] text-white outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-white/28">
                  Min employees
                </span>
                <input
                  value={openApiMinEmployees}
                  min={0}
                  type="number"
                  onChange={(event) => onOpenApiMinEmployeesChange(Number(event.target.value) || 0)}
                  className="w-full border border-white/10 bg-white/[0.035] px-2 py-1.5 font-mono text-[11px] text-white outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-white/28">
                  Max employees
                </span>
                <input
                  value={openApiMaxEmployees}
                  min={0}
                  type="number"
                  onChange={(event) => onOpenApiMaxEmployeesChange(Number(event.target.value) || 0)}
                  className="w-full border border-white/10 bg-white/[0.035] px-2 py-1.5 font-mono text-[11px] text-white outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-white/28">
                  Min area
                </span>
                <input
                  value={minArea || deliveryConfig.min_area_mq}
                  readOnly
                  className="w-full border border-white/10 bg-white/[0.035] px-2 py-1.5 font-mono text-[11px] text-white/60 outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-white/28">
                  Max area
                </span>
                <input
                  value={maxArea}
                  readOnly
                  className="w-full border border-white/10 bg-white/[0.035] px-2 py-1.5 font-mono text-[11px] text-white/60 outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-white/28">
                  Min kWp
                </span>
                <input
                  value={minKwp}
                  readOnly
                  className="w-full border border-white/10 bg-white/[0.035] px-2 py-1.5 font-mono text-[11px] text-white/60 outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-white/28">
                  Max kWp
                </span>
                <input
                  value={maxKwp}
                  readOnly
                  className="w-full border border-white/10 bg-white/[0.035] px-2 py-1.5 font-mono text-[11px] text-white/60 outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-white/28">
                  Limit
                </span>
                <input
                  value={openApiLimit}
                  min={1}
                  max={50}
                  type="number"
                  onChange={(event) => onOpenApiLimitChange(Math.min(Number(event.target.value) || 1, 50))}
                  className="w-full border border-white/10 bg-white/[0.035] px-2 py-1.5 font-mono text-[11px] text-white outline-none"
                />
              </label>
            </div>
            <button
              onClick={onOpenApiCompanyScan}
              disabled={scanStatus === "RUNNING" || !territory}
              className="w-full border border-tiloca-green/25 bg-tiloca-green/10 px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.16em] text-tiloca-green transition hover:bg-tiloca-green/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              OpenAPI company scan
            </button>
            <p className="font-mono text-[9px] leading-relaxed text-white/32">
              Dry-run is off for this operator action; no FullEnrich or decision-maker enrichment.
            </p>
          </div>
          <button
            onClick={onExportCsv}
            disabled={!visibleAssetCount}
            className="w-full border border-white/10 bg-white/[0.055] px-3 py-3 text-left font-mono text-[11px] uppercase tracking-[0.16em] text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Export CSV
          </button>
          <button
            onClick={onExportReportReadyCsv}
            disabled={!deliveryProgress.report_ready}
            className="w-full border border-tiloca-green/25 bg-tiloca-green/10 px-3 py-3 text-left font-mono text-[11px] uppercase tracking-[0.16em] text-tiloca-green transition hover:bg-tiloca-green/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Export report-ready CSV
          </button>
          <ScanStatusView status={scanStatus} message={scanMessage} />
          {lastScan ? (
            <div className="field-shell space-y-2 px-3 py-2">
              <DebugRow label="Territory candidates" value={fmtNumber(lastScan.osm_candidates_count)} />
              <DebugRow label="Candidate roofs analyzed" value={fmtNumber(lastScan.analyzed_count)} />
              <DebugRow label="Accepted / updated assets" value={fmtNumber(lastScan.persisted_count)} />
              <DebugRow label="Rejected / skipped" value={`${fmtNumber(lastScan.rejected_count)} / ${fmtNumber(lastScan.skipped_count)}`} />
              <DebugRow label="Visible after filters" value={fmtNumber(visibleAssetCount)} />
            </div>
          ) : null}
          {lastCompanyFirstScan ? (
            <div className="field-shell space-y-2 px-3 py-2">
              <DebugRow label="Companies found" value={fmtNumber(lastCompanyFirstScan.companies_found)} />
              <DebugRow label="After blacklist/dedup" value={fmtNumber(lastCompanyFirstScan.after_blacklist_dedup)} />
              <DebugRow label="Roofs analyzed" value={fmtNumber(lastCompanyFirstScan.roofs_analyzed)} />
              <DebugRow label="Accepted opportunities" value={fmtNumber(lastCompanyFirstScan.accepted_opportunities)} />
            </div>
          ) : null}
          {lastOpenApiCompanyScan ? (
            <div className="field-shell space-y-2 px-3 py-2">
              <DebugRow label="OpenAPI companies" value={fmtNumber(lastOpenApiCompanyScan.companies_found)} />
              <DebugRow label="With coordinates" value={fmtNumber(lastOpenApiCompanyScan.companies_with_coordinates)} />
              <DebugRow label="Roofs analyzed" value={fmtNumber(lastOpenApiCompanyScan.roofs_analyzed)} />
              <DebugRow label="Accepted opportunities" value={fmtNumber(lastOpenApiCompanyScan.accepted_opportunities)} />
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
            Operational Visibility
          </div>
          <div className="field-shell space-y-2 px-3 py-2">
            <DebugRow label="API returned" value={fmtNumber(apiAssetCount)} />
            <DebugRow label="Visible opportunities" value={fmtNumber(visibleAssetCount)} />
            <DebugRow label="Last refresh" value={lastRefreshAt || "-"} />
            <div className="border-t border-white/10 pt-2 font-mono text-[10px] leading-relaxed text-white/38">
              {filterSummary.join(" / ")}
            </div>
            <div className="border-t border-white/10 pt-2 font-mono text-[10px] leading-relaxed text-white/35">
              Assets may include previous scans stored in the Tiloca database.
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
              Review Queue
            </div>
            <div className="font-mono text-[10px] text-white/35">score / kWp</div>
          </div>
          {noAssetsReason ? (
            <div className="field-shell p-3 font-mono text-[10px] leading-relaxed text-white/45">
              {noAssetsReason}
            </div>
          ) : (
            <div className="max-h-80 space-y-1 overflow-y-auto thin-scroll pr-1">
              {assets.slice(0, 40).map((asset) => (
                <div
                  key={asset.id}
                  className={`w-full border px-3 py-2 transition ${
                    selectedAssetId === asset.id
                      ? "border-tiloca-green/45 bg-tiloca-green/10"
                      : "border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.06]"
                  }`}
                >
                  <button onClick={() => onAssetSelect(asset.id)} className="w-full text-left">
                    <div className="flex items-center gap-2">
                      <span className="w-6 flex-none font-mono text-[11px] text-tiloca-green">
                        #{asset.rank}
                      </span>
                      <span className={`h-2 w-2 flex-none rounded-full ${suitabilityDot(asset.suitability)}`} />
                      <span className="truncate text-xs text-white/78">{assetTitle(asset)}</span>
                      {needsWarning(asset) ? (
                        <span className="ml-auto flex-none border border-tiloca-amber/30 bg-tiloca-amber/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-tiloca-amber">
                          check
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 pl-8 font-mono text-[10px] text-white/42">
                      <span className="text-tiloca-green">{asset.opportunity_score}/100 {asset.score_label}</span>
                      <span>{asset.estimated_kwp ? `${fmtNumber(asset.estimated_kwp)} kWp` : "kWp -"}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 pl-8 font-mono text-[10px] text-white/32">
                      <span>{fmtNumber(asset.area_mq)} mq</span>
                      <span>{reportStateLabel[asset.report_state]}</span>
                    </div>
                  <div className="mt-1 flex items-center justify-between gap-2 pl-8 font-mono text-[9px] uppercase tracking-[0.1em] text-white/28">
                    <span>data {asset.data_quality.confidence}</span>
                    <span>
                      match {asset.company_match?.match_confidence || "none"} / {asset.recommended_state.replaceAll("_", " ")}
                    </span>
                  </div>
                  <div className="mt-1 pl-8 font-mono text-[9px] uppercase tracking-[0.1em] text-tiloca-amber/75">
                    {asset.commercial_fit.label.replaceAll("_", " ")}
                  </div>
                  <div className="mt-1 pl-8 font-mono text-[9px] uppercase tracking-[0.1em] text-white/25">
                    source: {assetSource(asset).replaceAll("_", " ")}
                  </div>
                  </button>
                  <div className="mt-2 grid grid-cols-3 gap-1 pl-8">
                    <QueueAction label="Qualified" onClick={() => onStateChange(asset.id, "qualified")} />
                    <QueueAction label="Ready" onClick={() => onStateChange(asset.id, "report_ready")} />
                    <QueueAction label="Exclude" danger onClick={() => onStateChange(asset.id, "excluded")} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {assets.length > 40 ? (
            <div className="font-mono text-[10px] text-white/30">
              Showing first 40 ranked assets.
            </div>
          ) : null}
        </section>
      </div>

      <div className="border-t border-white/10 px-5 py-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
              Visible Opportunities
            </div>
            <div className="mt-1 font-display text-2xl font-semibold text-white">
              {visibleAssetCount}
            </div>
          </div>
          <div className="mb-1 h-2 w-2 rounded-full bg-tiloca-green" />
        </div>
      </div>
    </aside>
  );
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 font-mono text-[10px]">
      <span className="uppercase tracking-[0.14em] text-white/32">{label}</span>
      <span className="text-white/68">{value}</span>
    </div>
  );
}

function QueueAction({
  label,
  danger = false,
  onClick,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`border px-1.5 py-1 font-mono text-[8px] uppercase tracking-[0.1em] transition ${
        danger
          ? "border-red-400/25 bg-red-500/10 text-red-300 hover:bg-red-500/15"
          : "border-white/10 bg-white/[0.035] text-white/45 hover:border-tiloca-green/35 hover:text-tiloca-green"
      }`}
    >
      {label}
    </button>
  );
}
