"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MapCanvas } from "@/components/MapCanvas";
import {
  excludeAssetFromDelivery,
  getAsset,
  getDelivery,
  getDeliveryAssets,
  runDeliveryOpenApiScan,
  satelliteImageUrl,
  updateAssetState,
} from "@/lib/api";
import { pointInPolygon, type LngLatTuple } from "@/lib/geo";
import { opportunityScore, reportState, scoreLabel } from "@/lib/opportunity";
import type {
  Asset,
  AssetDetail,
  Delivery,
  DeliveryProjectConfig,
  PipelineState,
  RankedAsset,
  ReportState,
  Suitability,
} from "@/lib/types";

type DeliveryWorkspaceProps = {
  slug: string;
};

const defaultDeliveryConfig: DeliveryProjectConfig = {
  profile_name: "Delivery",
  client_name: "Delivery",
  target_provinces: "",
  target_opportunity_count: 30,
  min_area_mq: 2000,
  min_kwp: 300,
  max_area_mq: 30000,
  max_kwp: 2500,
  accepted_suitability: ["alta", "media"],
};

function fmtNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("it-IT").format(value);
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClass(status: string): string {
  if (status === "active") return "border-tiloca-green/35 text-tiloca-green";
  if (status === "draft") return "border-tiloca-amber/35 text-tiloca-amber";
  if (status === "delivered") return "border-sky-300/30 text-sky-200";
  return "border-white/15 text-white/45";
}

function rankDeliveryAssets(assets: Asset[]): RankedAsset[] {
  return [...assets]
    .sort((a, b) => (b.estimated_kwp || 0) - (a.estimated_kwp || 0) || b.area_mq - a.area_mq)
    .map((asset, index) => {
      const score = opportunityScore(asset);
      return {
        ...asset,
        rank: index + 1,
        opportunity_score: score,
        score_label: scoreLabel(score),
        score_components: {
          capacity_score: 0,
          roof_score: 0,
          pv_absence_score: 0,
          industrial_score: 0,
        },
        report_state: reportState(asset),
        data_quality: { confidence: "medium", warnings: [], manual_checks: [] },
        recommended_state: "needs_review",
        recommendation_reason: "",
        commercial_fit: {
          profile_name: "Delivery",
          label: "ideal_sme_ci",
          reason: "",
          recommended_action: "prioritize",
        },
      };
    });
}

export function DeliveryWorkspace({ slug }: DeliveryWorkspaceProps) {
  const [delivery, setDelivery] = useState<(Delivery & { asset_count: number }) | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AssetDetail | null>(null);
  const [province, setProvince] = useState("");
  const [suitability, setSuitability] = useState<Suitability>("");
  const [stateFilter, setStateFilter] = useState<PipelineState>("");
  const [minArea, setMinArea] = useState(0);
  const [minKwp, setMinKwp] = useState(0);
  const [activePolygon, setActivePolygon] = useState<LngLatTuple[] | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scanStatus, setScanStatus] = useState("IDLE");
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detail, assetResponse] = await Promise.all([getDelivery(slug), getDeliveryAssets(slug)]);
      setDelivery(detail);
      setAssets(assetResponse.assets);
      setProvince((current) => current || detail.target_provinces[0] || "");
      setMinArea((current) => current || Number(detail.criteria.min_area_mq || 0));
      setMinKwp((current) => current || Number(detail.criteria.min_kwp || 0));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load delivery");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (!selectedAssetId) {
      setSelectedAsset(null);
      return;
    }
    getAsset(selectedAssetId)
      .then(setSelectedAsset)
      .catch((assetError) => setError(assetError instanceof Error ? assetError.message : "Unable to load asset"));
    setVerified(false);
  }, [selectedAssetId]);

  const visibleAssets = useMemo(() => {
    return rankDeliveryAssets(
      assets.filter((asset) => {
        if (province && delivery?.target_provinces.length && !delivery.target_provinces.includes(province)) return false;
        if (suitability && asset.suitability !== suitability) return false;
        if (stateFilter && reportState(asset) !== stateFilter) return false;
        if (minArea && asset.area_mq < minArea) return false;
        if (minKwp && (asset.estimated_kwp || 0) < minKwp) return false;
        if (activePolygon && !pointInPolygon([asset.lon, asset.lat], activePolygon)) return false;
        return true;
      })
    );
  }, [activePolygon, assets, delivery?.target_provinces, minArea, minKwp, province, stateFilter, suitability]);

  useEffect(() => {
    if (!selectedAssetId || !activePolygon) return;
    const stillVisible = visibleAssets.some((asset) => asset.id === selectedAssetId);
    if (!stillVisible) setSelectedAssetId(null);
  }, [activePolygon, selectedAssetId, visibleAssets]);

  const stats = useMemo(() => {
    const ranked = rankDeliveryAssets(assets);
    return {
      total: ranked.length,
      qualified: ranked.filter((asset) => asset.report_state === "qualified").length,
      reportReady: ranked.filter((asset) => asset.report_state === "report_ready").length,
    };
  }, [assets]);

  const runScan = async () => {
    setScanStatus("RUNNING");
    setError(null);
    try {
      await runDeliveryOpenApiScan(slug, false);
      await loadWorkspace();
      setScanStatus("COMPLETED");
    } catch (scanError) {
      setScanStatus("FAILED");
      setError(scanError instanceof Error ? scanError.message : "Delivery scan failed");
    }
  };

  const changeState = async (assetId: number, state: ReportState) => {
    await updateAssetState(assetId, state, "Delivery workspace update");
    await loadWorkspace();
    const detail = await getAsset(assetId);
    setSelectedAsset(detail);
  };

  const excludeAsset = async (assetId: number) => {
    await excludeAssetFromDelivery(slug, assetId);
    setSelectedAssetId(null);
    setSelectedAsset(null);
    await loadWorkspace();
  };

  const exportCsv = () => {
    const headers = ["rank", "company_name", "address", "lat", "lon", "area_mq", "estimated_kwp", "suitability", "state"];
    const rows = visibleAssets.map((asset) =>
      [
        asset.rank,
        asset.company_match?.company_name || asset.name || `OSM ${asset.osm_id}`,
        asset.company_match?.address || asset.address || "",
        asset.lat,
        asset.lon,
        asset.area_mq,
        asset.estimated_kwp || "",
        asset.suitability || "",
        asset.report_state,
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(",")
    );
    const blob = new Blob([[headers.join(","), ...rows].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tiloca-${slug}-delivery.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const selectedRank = visibleAssets.find((asset) => asset.id === selectedAssetId)?.rank ?? null;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#080f1a]">
      <MapCanvas
        assets={visibleAssets}
        selectedAssetId={selectedAssetId}
        selectedTerritory={null}
        onAssetSelect={setSelectedAssetId}
        onPolygonChange={setActivePolygon}
      />

      <div className="pointer-events-none fixed left-[320px] right-[430px] top-4 z-10 border border-white/10 bg-[#080f1a]/76 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/" className="pointer-events-auto font-mono text-[10px] uppercase tracking-[0.16em] text-white/45 hover:text-tiloca-green">
              ← Home
            </Link>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="font-display text-xl font-semibold text-white">{delivery?.client_name || slug}</h1>
              {delivery ? (
                <span className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${statusClass(delivery.status)}`}>
                  {delivery.status}
                </span>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-6 text-right font-mono">
            <TopStat label="Total opps" value={fmtNumber(stats.total)} />
            <TopStat label="Qualified" value={fmtNumber(stats.qualified)} />
            <TopStat label="Report-ready" value={fmtNumber(stats.reportReady)} />
          </div>
        </div>
      </div>

      <aside className="console-panel fixed bottom-0 left-0 top-0 z-20 flex w-[300px] flex-col border-r">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="font-display text-lg font-semibold tracking-tight text-white">Delivery</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-tiloca-green/80">
            {delivery?.slug || slug}
          </div>
        </div>
        <div className="thin-scroll flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <SelectField label="Province" value={province} onChange={setProvince}>
            {(delivery?.target_provinces || []).map((item) => (
              <option key={item} value={item} className="bg-[#080f1a]">{item}</option>
            ))}
          </SelectField>
          <SelectField label="Suitability" value={suitability} onChange={(value) => setSuitability(value as Suitability)}>
            <option value="" className="bg-[#080f1a]">all</option>
            <option value="alta" className="bg-[#080f1a]">alta</option>
            <option value="media" className="bg-[#080f1a]">media</option>
            <option value="bassa" className="bg-[#080f1a]">bassa</option>
          </SelectField>
          <SelectField label="State" value={stateFilter} onChange={(value) => setStateFilter(value as PipelineState)}>
            <option value="" className="bg-[#080f1a]">all</option>
            <option value="new" className="bg-[#080f1a]">new</option>
            <option value="qualified" className="bg-[#080f1a]">qualified</option>
            <option value="report_ready" className="bg-[#080f1a]">report ready</option>
            <option value="excluded" className="bg-[#080f1a]">excluded</option>
          </SelectField>
          <NumberField label="Min area" value={minArea} onChange={setMinArea} />
          <NumberField label="Min kWp" value={minKwp} onChange={setMinKwp} />
          <button onClick={runScan} disabled={scanStatus === "RUNNING"} className="w-full border border-tiloca-green/30 bg-tiloca-green/10 px-3 py-3 text-left font-mono text-[11px] uppercase tracking-[0.16em] text-tiloca-green disabled:opacity-40">
            Run OpenAPI scan
          </button>
          <button onClick={exportCsv} disabled={!visibleAssets.length} className="w-full border border-white/10 bg-white/[0.055] px-3 py-3 text-left font-mono text-[11px] uppercase tracking-[0.16em] text-white/70 disabled:opacity-40">
            Export delivery CSV
          </button>
          <div className="field-shell px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
            Scan: {scanStatus}
          </div>
          {error ? <div className="border border-red-400/30 bg-red-950/45 p-3 font-mono text-xs text-red-100">{error}</div> : null}
          {loading ? <div className="font-mono text-xs text-white/40">Loading delivery...</div> : null}
        </div>
      </aside>

      <DeliveryAssetPanel
        asset={selectedAsset}
        rank={selectedRank}
        verified={verified}
        onVerifiedChange={setVerified}
        onClose={() => setSelectedAssetId(null)}
        onStateChange={changeState}
        onExclude={excludeAsset}
      />
    </main>
  );
}

function DeliveryAssetPanel({
  asset,
  rank,
  verified,
  onVerifiedChange,
  onClose,
  onStateChange,
  onExclude,
}: {
  asset: AssetDetail | null;
  rank: number | null;
  verified: boolean;
  onVerifiedChange: (value: boolean) => void;
  onClose: () => void;
  onStateChange: (assetId: number, state: ReportState) => void;
  onExclude: (assetId: number) => void;
}) {
  const latest = asset?.analyses?.[0];
  const imageUrl = satelliteImageUrl(latest?.satellite_image_path || asset?.satellite_image_path || null);
  const title = asset?.company_match?.company_name || asset?.name || (asset ? `OSM ${asset.osm_id}` : "No asset");

  return (
    <aside className={`console-panel fixed bottom-0 right-0 top-0 z-30 w-[410px] border-l transition-transform ${asset ? "translate-x-0" : "translate-x-full"}`}>
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">Delivery dossier</div>
          <div className="mt-1 font-display text-sm font-semibold text-white/90">{title}</div>
        </div>
        <button onClick={onClose} className="border border-white/10 px-2 py-1 font-mono text-[11px] text-white/55">CLOSE</button>
      </div>

      {asset ? (
        <div className="thin-scroll h-[calc(100%-64px)] space-y-4 overflow-y-auto p-5">
          {imageUrl ? <img src={imageUrl} alt={title} className="h-64 w-full border border-white/10 object-cover" /> : null}
          <div className="flex gap-2">
            <Badge value={rank ? `#${rank}` : "unranked"} />
            <Badge value={`${fmtNumber(asset.estimated_kwp)} kWp`} accent />
            <Badge value={asset.suitability || "-"} />
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden border border-white/10 bg-white/10">
            <Metric label="Area" value={`${fmtNumber(asset.area_mq)} mq`} />
            <Metric label="State" value={reportState(asset).replace("_", " ")} />
            <Metric label="Roof" value={asset.roof_type || latest?.roof_type || "-"} />
            <Metric label="Latest scan" value={fmtDate(latest?.created_at || asset.last_seen_at)} />
          </div>
          <section className="field-shell p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">Company info</div>
            <div className="mt-3 space-y-2 font-mono text-[10px] text-white/60">
              <Info label="Company" value={asset.company_match?.company_name || asset.name || "-"} />
              <Info label="Address" value={asset.company_match?.address || asset.address || "-"} />
              <Info label="Website" value={asset.company_match?.website || "-"} />
              <Info label="Source" value={asset.company_match?.source || String(asset.industrial_metadata?.source || "-")} />
            </div>
          </section>
          <label className="flex items-center justify-between border border-white/10 bg-white/[0.035] px-3 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/55">
            <span>Verified</span>
            <input type="checkbox" checked={verified} onChange={(event) => onVerifiedChange(event.target.checked)} />
          </label>
          <div className="grid grid-cols-1 gap-2">
            <ActionButton label="Mark qualified" onClick={() => onStateChange(asset.id, "qualified")} />
            <ActionButton label="Mark report-ready" onClick={() => onStateChange(asset.id, "report_ready")} />
            <ActionButton label="Exclude" danger onClick={() => onExclude(asset.id)} />
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="field-shell block px-3 py-2">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full bg-transparent text-sm text-white outline-none">
        {children}
      </select>
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="field-shell block px-3 py-2">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">{label}</span>
      <input value={value} type="number" min={0} onChange={(event) => onChange(Number(event.target.value) || 0)} className="w-full bg-transparent font-mono text-sm text-white outline-none" />
    </label>
  );
}

function TopStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.18em] text-white/32">{label}</div>
      <div className="mt-1 text-[13px] text-tiloca-green">{value}</div>
    </div>
  );
}

function Badge({ value, accent = false }: { value: string; accent?: boolean }) {
  return (
    <span className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${accent ? "border-tiloca-green/40 text-tiloca-green" : "border-white/15 text-white/65"}`}>
      {value}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0b1422] px-3 py-3">
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/30">{label}</div>
      <div className="mt-1 font-mono text-[13px] text-white/85">{value}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-2">
      <span className="uppercase tracking-[0.12em] text-white/30">{label}</span>
      <span className="text-white/72">{value}</span>
    </div>
  );
}

function ActionButton({ label, danger = false, onClick }: { label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`border px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.16em] ${danger ? "border-red-400/30 bg-red-500/10 text-red-300" : "border-tiloca-green/30 bg-tiloca-green/10 text-tiloca-green"}`}>
      {label}
    </button>
  );
}
