"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MapCanvas } from "@/components/MapCanvas";
import { excludeAssetFromDelivery, getAsset, getDelivery, getDeliveryAssets, getTerritories, runDeliveryOpenApiScan, satelliteImageUrl, updateAssetState } from "@/lib/api";
import { opportunityScore, reportState, scoreLabel } from "@/lib/opportunity";
import type { Asset, AssetDetail, Delivery, PipelineState, RankedAsset, ReportState, Suitability, Territory } from "@/lib/types";

function fmtNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("it-IT").format(value);
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function rankAssets(assets: Asset[]): RankedAsset[] {
  return [...assets]
    .sort((a, b) => (b.estimated_kwp || 0) - (a.estimated_kwp || 0) || b.area_mq - a.area_mq)
    .map((asset, index) => ({
      ...asset,
      rank: index + 1,
      opportunity_score: opportunityScore(asset),
      score_label: scoreLabel(opportunityScore(asset)),
      score_components: { capacity_score: 0, roof_score: 0, pv_absence_score: 0, industrial_score: 0 },
      report_state: reportState(asset),
      data_quality: { confidence: "medium", warnings: [], manual_checks: [] },
      recommended_state: "needs_review",
      recommendation_reason: "",
      commercial_fit: { profile_name: "Delivery", label: "ideal_sme_ci", reason: "", recommended_action: "prioritize" },
    }));
}

function statusLabel(status: string): string {
  if (status === "active") return "attiva";
  if (status === "draft") return "bozza";
  if (status === "delivered") return "consegnata";
  if (status === "archived") return "archiviata";
  return status;
}

export function DeliveryWorkspace({ slug }: { slug: string }) {
  const [delivery, setDelivery] = useState<(Delivery & { asset_count: number }) | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AssetDetail | null>(null);
  const [province, setProvince] = useState("");
  const [suitability, setSuitability] = useState<Suitability>("");
  const [stateFilter, setStateFilter] = useState<PipelineState>("");
  const [minArea, setMinArea] = useState(0);
  const [minKwp, setMinKwp] = useState(0);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scanStatus, setScanStatus] = useState("in attesa");
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detail, assetResponse, territoryResponse] = await Promise.all([getDelivery(slug), getDeliveryAssets(slug), getTerritories()]);
      setDelivery(detail);
      setAssets(assetResponse.assets);
      setTerritories(territoryResponse);
      setProvince((current) => current || detail.target_provinces[0] || "");
      setMinArea((current) => current || Number(detail.criteria.min_area_mq || 0));
      setMinKwp((current) => current || Number(detail.criteria.min_kwp || 0));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Impossibile caricare la delivery");
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
      .catch((assetError) => setError(assetError instanceof Error ? assetError.message : "Impossibile caricare asset"));
    setVerified(false);
  }, [selectedAssetId]);

  const territoryById = useMemo(() => {
    return new Map(territories.map((territory) => [territory.id, territory]));
  }, [territories]);

  const selectedTerritory = useMemo(() => {
    return territories.find((territory) => territory.slug === province) || null;
  }, [province, territories]);

  const visibleAssets = useMemo(() => {
    return rankAssets(
      assets.filter((asset) => {
        const assetTerritory = territoryById.get(asset.territory_id);
        if (province && assetTerritory?.slug !== province) return false;
        if (suitability && asset.suitability !== suitability) return false;
        if (stateFilter && reportState(asset) !== stateFilter) return false;
        if (minArea && asset.area_mq < minArea) return false;
        if (minKwp && (asset.estimated_kwp || 0) < minKwp) return false;
        return true;
      })
    );
  }, [assets, minArea, minKwp, province, stateFilter, suitability, territoryById]);

  const stats = useMemo(() => ({
    total: visibleAssets.length,
    qualified: visibleAssets.filter((asset) => reportState(asset) === "qualified").length,
    reportReady: visibleAssets.filter((asset) => reportState(asset) === "report_ready").length,
  }), [visibleAssets]);

  useEffect(() => {
    if (!selectedAssetId) return;
    if (!visibleAssets.some((asset) => asset.id === selectedAssetId)) {
      setSelectedAssetId(null);
      setSelectedAsset(null);
    }
  }, [selectedAssetId, visibleAssets]);

  const runScan = async () => {
    setScanStatus("in corso");
    try {
      await runDeliveryOpenApiScan(slug, false);
      await loadWorkspace();
      setScanStatus("completato");
    } catch (scanError) {
      setScanStatus("fallito");
      setError(scanError instanceof Error ? scanError.message : "Scan delivery non riuscito");
    }
  };

  const changeState = async (assetId: number, state: ReportState) => {
    await updateAssetState(assetId, state, "Aggiornamento workspace delivery");
    await loadWorkspace();
    setSelectedAsset(await getAsset(assetId));
  };

  const excludeAsset = async (assetId: number) => {
    await excludeAssetFromDelivery(slug, assetId);
    setSelectedAssetId(null);
    setSelectedAsset(null);
    await loadWorkspace();
  };

  const selectedRank = visibleAssets.find((asset) => asset.id === selectedAssetId)?.rank ?? null;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#080f1a]">
      <MapCanvas assets={visibleAssets} selectedAssetId={selectedAssetId} selectedTerritory={selectedTerritory} onAssetSelect={setSelectedAssetId} />
      <div className="pointer-events-none fixed left-[320px] right-[430px] top-16 z-10 border border-white/10 bg-[#080f1a]/76 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/" className="pointer-events-auto font-mono text-[10px] uppercase tracking-[0.16em] text-white/45 hover:text-tiloca-green">← Home</Link>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="font-display text-xl font-semibold text-white">{delivery?.client_name || slug}</h1>
              <span className="border border-tiloca-green/25 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-tiloca-green">{delivery ? statusLabel(delivery.status) : "-"}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-6 text-right font-mono">
            <TopStat label="Opportunità totali" value={fmtNumber(stats.total)} />
            <TopStat label="Qualificate" value={fmtNumber(stats.qualified)} />
            <TopStat label="Pronte per report" value={fmtNumber(stats.reportReady)} />
          </div>
        </div>
      </div>

      <aside className="console-panel fixed bottom-0 left-0 top-14 z-20 flex w-[300px] flex-col border-r">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="font-display text-lg font-semibold tracking-tight text-white">Delivery</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-tiloca-green/80">{delivery?.slug || slug}</div>
        </div>
        <div className="thin-scroll flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <SelectField label="Provincia" value={province} onChange={setProvince}>
            {(delivery?.target_provinces || []).map((item) => <option key={item} value={item} className="bg-[#080f1a]">{item}</option>)}
          </SelectField>
          <SelectField label="Idoneità" value={suitability} onChange={(value) => setSuitability(value as Suitability)}>
            <option value="" className="bg-[#080f1a]">tutte</option>
            <option value="alta" className="bg-[#080f1a]">alta</option>
            <option value="media" className="bg-[#080f1a]">media</option>
            <option value="bassa" className="bg-[#080f1a]">bassa</option>
          </SelectField>
          <SelectField label="Stato" value={stateFilter} onChange={(value) => setStateFilter(value as PipelineState)}>
            <option value="" className="bg-[#080f1a]">tutti</option>
            <option value="new" className="bg-[#080f1a]">nuovo</option>
            <option value="qualified" className="bg-[#080f1a]">qualificata</option>
            <option value="report_ready" className="bg-[#080f1a]">pronta per report</option>
            <option value="excluded" className="bg-[#080f1a]">esclusa</option>
          </SelectField>
          <NumberField label="Area minima" value={minArea} onChange={setMinArea} />
          <NumberField label="kWp minimi" value={minKwp} onChange={setMinKwp} />
          <button onClick={runScan} disabled={scanStatus === "in corso"} className="w-full border border-tiloca-green/30 bg-tiloca-green/10 px-3 py-3 text-left font-mono text-[11px] uppercase tracking-[0.16em] text-tiloca-green disabled:opacity-40">Esegui scan OpenAPI</button>
          <div className="field-shell px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">Scan: {scanStatus}</div>
          {error ? <div className="border border-red-400/30 bg-red-950/45 p-3 font-mono text-xs text-red-100">{error}</div> : null}
          {loading ? <div className="font-mono text-xs text-white/40">Caricamento delivery...</div> : null}
        </div>
      </aside>
      <DeliveryAssetPanel asset={selectedAsset} rank={selectedRank} verified={verified} onVerifiedChange={setVerified} onClose={() => setSelectedAssetId(null)} onStateChange={changeState} onExclude={excludeAsset} />
    </main>
  );
}

function DeliveryAssetPanel({ asset, rank, verified, onVerifiedChange, onClose, onStateChange, onExclude }: { asset: AssetDetail | null; rank: number | null; verified: boolean; onVerifiedChange: (value: boolean) => void; onClose: () => void; onStateChange: (assetId: number, state: ReportState) => void; onExclude: (assetId: number) => void }) {
  const latest = asset?.analyses?.[0];
  const imageUrl = satelliteImageUrl(latest?.satellite_image_path || asset?.satellite_image_path || null);
  const title = asset?.company_match?.company_name || asset?.name || (asset ? `OSM ${asset.osm_id}` : "Nessun asset");
  return <aside className={`console-panel fixed bottom-0 right-0 top-14 z-30 w-[410px] border-l transition-transform ${asset ? "translate-x-0" : "translate-x-full"}`}><div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">Dossier delivery</div><div className="mt-1 font-display text-sm font-semibold text-white/90">{title}</div></div><button onClick={onClose} className="border border-white/10 px-2 py-1 font-mono text-[11px] text-white/55">Chiudi</button></div>{asset ? <div className="thin-scroll h-[calc(100%-64px)] space-y-4 overflow-y-auto p-5">{imageUrl ? <img src={imageUrl} alt={title} className="h-64 w-full border border-white/10 object-cover" /> : null}<div className="flex gap-2"><Badge value={rank ? `#${rank}` : "senza rank"} /><Badge value={`${fmtNumber(asset.estimated_kwp)} kWp`} accent /><Badge value={asset.suitability || "-"} /></div><div className="grid grid-cols-2 gap-px overflow-hidden border border-white/10 bg-white/10"><Metric label="Area" value={`${fmtNumber(asset.area_mq)} mq`} /><Metric label="Stato" value={reportState(asset).replace("_", " ")} /><Metric label="Tetto" value={asset.roof_type || latest?.roof_type || "-"} /><Metric label="Ultima scansione" value={fmtDate(latest?.created_at || asset.last_seen_at)} /></div><section className="field-shell p-3"><div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">Info azienda</div><div className="mt-3 space-y-2 font-mono text-[10px] text-white/60"><Info label="Azienda" value={asset.company_match?.company_name || asset.name || "-"} /><Info label="Indirizzo" value={asset.company_match?.address || asset.address || "-"} /><Info label="Website" value={asset.company_match?.website || "-"} /><Info label="Fonte" value={asset.company_match?.source || String(asset.industrial_metadata?.source || "-")} /></div></section><label className="flex items-center justify-between border border-white/10 bg-white/[0.035] px-3 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/55"><span>Verificata</span><input type="checkbox" checked={verified} onChange={(event) => onVerifiedChange(event.target.checked)} /></label><div className="grid grid-cols-1 gap-2"><ActionButton label="Marca qualificata" onClick={() => onStateChange(asset.id, "qualified")} /><ActionButton label="Marca pronta per report" onClick={() => onStateChange(asset.id, "report_ready")} /><ActionButton label="Escludi" danger onClick={() => onExclude(asset.id)} /></div></div> : null}</aside>;
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label className="field-shell block px-3 py-2"><span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full bg-transparent text-sm text-white outline-none">{children}</select></label>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="field-shell block px-3 py-2"><span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">{label}</span><input value={value} type="number" min={0} onChange={(event) => onChange(Number(event.target.value) || 0)} className="w-full bg-transparent font-mono text-sm text-white outline-none" /></label>;
}

function TopStat({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[9px] uppercase tracking-[0.18em] text-white/32">{label}</div><div className="mt-1 text-[13px] text-tiloca-green">{value}</div></div>;
}

function Badge({ value, accent = false }: { value: string; accent?: boolean }) {
  return <span className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${accent ? "border-tiloca-green/40 text-tiloca-green" : "border-white/15 text-white/65"}`}>{value}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="bg-[#0b1422] px-3 py-3"><div className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/30">{label}</div><div className="mt-1 font-mono text-[13px] text-white/85">{value}</div></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[100px_1fr] gap-2"><span className="uppercase tracking-[0.12em] text-white/30">{label}</span><span className="text-white/72">{value}</span></div>;
}

function ActionButton({ label, danger = false, onClick }: { label: string; danger?: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`border px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.16em] ${danger ? "border-red-400/30 bg-red-500/10 text-red-300" : "border-tiloca-green/30 bg-tiloca-green/10 text-tiloca-green"}`}>{label}</button>;
}
