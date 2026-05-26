"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MapCanvas } from "@/components/MapCanvas";
import { getAssets, getTerritoryOverview, triggerScan } from "@/lib/api";
import { opportunityScore, reportState, scoreLabel } from "@/lib/opportunity";
import type { Asset, RankedAsset, TerritoryOverview as TerritoryOverviewData } from "@/lib/types";

type KwpRange = "all" | "<300" | "300-1000" | "1000-2500" | "2500-5000" | ">5000";
type SuitabilityFloor = "alta" | "media" | "bassa";

const SUITABILITY_OPTIONS = ["alta", "media", "bassa", "non_analizzato"] as const;
const KWP_RANGES: KwpRange[] = ["all", "<300", "300-1000", "1000-2500", "2500-5000", ">5000"];

function fmtNumber(value: number): string {
  return new Intl.NumberFormat("it-IT").format(value);
}

function fmtDate(value: string | null): string {
  if (!value) return "nessuna scansione completata";
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function assetSuitability(asset: Asset): string {
  return asset.suitability || "non_analizzato";
}

function assetAteco(asset: Asset): string {
  const metadata = asset.industrial_metadata || {};
  const value = metadata.ateco ?? metadata.atecoCode ?? metadata.ateco_code ?? metadata.category ?? asset.building_type ?? "unknown";
  return String(value || "unknown");
}

function hasExistingPv(asset: Asset): boolean | null {
  const metadata = asset.industrial_metadata || {};
  const rawValue = metadata.panels_present ?? metadata.has_panels ?? metadata.pv_present;
  if (rawValue === true || rawValue === "true" || rawValue === "yes") return true;
  if (rawValue === false || rawValue === "false" || rawValue === "no") return false;
  return null;
}

function inKwpRange(asset: Asset, range: KwpRange): boolean {
  const kwp = asset.estimated_kwp || 0;
  if (range === "all") return true;
  if (range === "<300") return kwp < 300;
  if (range === "300-1000") return kwp >= 300 && kwp < 1000;
  if (range === "1000-2500") return kwp >= 1000 && kwp < 2500;
  if (range === "2500-5000") return kwp >= 2500 && kwp < 5000;
  return kwp >= 5000;
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
      commercial_fit: {
        profile_name: "Panoramica territorio",
        label: "ideal_sme_ci",
        reason: "",
        recommended_action: "prioritize",
      },
    }));
}

function computeTotals(assets: Asset[]) {
  return {
    buildings_identified: assets.length,
    with_idoneous_roof: assets.filter((asset) => ["alta", "media"].includes(assetSuitability(asset))).length,
    without_existing_pv: assets.filter((asset) => hasExistingPv(asset) !== true).length,
    above_2000mq: assets.filter((asset) => asset.area_mq >= 2000).length,
    total_installable_kwp: assets.filter((asset) => assetSuitability(asset) !== "bassa").reduce((sum, asset) => sum + (asset.estimated_kwp || 0), 0),
  };
}

function computeDistribution(assets: Asset[]) {
  return KWP_RANGES.filter((range) => range !== "all").map((range) => ({
    range,
    count: assets.filter((asset) => inKwpRange(asset, range)).length,
  }));
}

function computeSuitability(assets: Asset[]) {
  return {
    alta: assets.filter((asset) => assetSuitability(asset) === "alta").length,
    media: assets.filter((asset) => assetSuitability(asset) === "media").length,
    bassa: assets.filter((asset) => assetSuitability(asset) === "bassa").length,
    non_analizzato: assets.filter((asset) => !["alta", "media", "bassa"].includes(assetSuitability(asset))).length,
  };
}

function computeAteco(assets: Asset[]) {
  const counts = new Map<string, number>();
  assets.forEach((asset) => counts.set(assetAteco(asset), (counts.get(assetAteco(asset)) || 0) + 1));
  return [...counts.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count).slice(0, 8);
}

export function TerritoryOverview({ slug }: { slug: string }) {
  const [overview, setOverview] = useState<TerritoryOverviewData | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [selectedSuitability, setSelectedSuitability] = useState<string[]>(["alta", "media", "bassa", "non_analizzato"]);
  const [selectedKwpRange, setSelectedKwpRange] = useState<KwpRange>("all");
  const [selectedAteco, setSelectedAteco] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanRunning, setScanRunning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanMinArea, setScanMinArea] = useState(2000);
  const [scanMinKwp, setScanMinKwp] = useState(300);
  const [scanMaxKwp, setScanMaxKwp] = useState(2500);
  const [scanLimit, setScanLimit] = useState(30);
  const [scanSuitabilityFloor, setScanSuitabilityFloor] = useState<SuitabilityFloor>("media");
  const [scanAtecoCodes, setScanAtecoCodes] = useState("");
  const [scanDryRun, setScanDryRun] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewData, assetData] = await Promise.all([getTerritoryOverview(slug), getAssets({ territory: slug, limit: 500 })]);
      setOverview(overviewData);
      setAssets(assetData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Impossibile caricare la panoramica territorio");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const allAteco = useMemo(() => computeAteco(assets), [assets]);
  const filteredAssets = useMemo(() => assets.filter((asset) => {
    if (!selectedSuitability.includes(assetSuitability(asset))) return false;
    if (!inKwpRange(asset, selectedKwpRange)) return false;
    if (selectedAteco.length && !selectedAteco.includes(assetAteco(asset))) return false;
    return true;
  }), [assets, selectedAteco, selectedKwpRange, selectedSuitability]);
  const rankedAssets = useMemo(() => rankAssets(filteredAssets), [filteredAssets]);
  const totals = useMemo(() => computeTotals(filteredAssets), [filteredAssets]);
  const distribution = useMemo(() => computeDistribution(filteredAssets), [filteredAssets]);
  const bySuitability = useMemo(() => computeSuitability(filteredAssets), [filteredAssets]);
  const byAteco = useMemo(() => computeAteco(filteredAssets), [filteredAssets]);
  const territoryName = overview?.territory.name || slug;
  const scanSuitabilityLevels = useMemo(() => {
    if (scanSuitabilityFloor === "alta") return ["alta"];
    if (scanSuitabilityFloor === "media") return ["alta", "media"];
    return ["alta", "media", "bassa"];
  }, [scanSuitabilityFloor]);

  const toggleSuitability = (value: string) => {
    setSelectedSuitability((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  };

  const toggleAteco = (value: string) => {
    setSelectedAteco((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  };

  const runNewScan = async () => {
    setScanRunning(true);
    setScanMessage(null);
    try {
      if (scanDryRun) {
        setScanMessage("Dry run configurato. Disattiva dry run per eseguire la scansione e aggiornare il database.");
        return;
      }
      await triggerScan(slug, scanLimit, {
        minAreaMq: scanMinArea,
        minKwp: scanMinKwp,
        maxKwp: scanMaxKwp,
        suitabilityLevels: scanSuitabilityLevels,
      });
      await loadData();
      setScanModalOpen(false);
    } catch (scanError) {
      setScanMessage(scanError instanceof Error ? scanError.message : "Scansione non completata");
    } finally {
      setScanRunning(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0A0E0A] px-6 py-20 text-white">
      <header className="mb-6 flex items-start justify-between border-b border-[rgba(52,211,153,0.15)] pb-5">
        <div>
          <Link href="/" className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/45 hover:text-[#34d399]">← Home</Link>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">{territoryName}</h1>
          <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[#34d399]/75">
            Panoramica territorio · Ultima scansione {fmtDate(overview?.last_scan_date || null)}
          </div>
        </div>
        <button onClick={() => setScanModalOpen(true)} className="border border-[#34d399]/30 bg-[#34d399]/10 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-[#34d399]">
          Nuova scansione
        </button>
      </header>

      {error ? <div className="mb-4 border border-red-400/30 bg-red-950/45 px-3 py-2 font-mono text-xs text-red-100">{error}</div> : null}

      <section className="mb-5 border border-[#34d399]/20 bg-[#080F1A]/80 px-4 py-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#34d399]">ⓘ Contesto dati</div>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/68">
              {overview?.last_scan_date
                ? `Dati basati su scansione del ${fmtDate(overview.last_scan_date)}. ${fmtNumber(assets.length)} asset analizzati nel database Tiloca. Per una panoramica completa della provincia, esegui una nuova scansione.`
                : "Nessuna scansione ancora effettuata per questo territorio."}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={() => setScanModalOpen(true)} className="border border-[#34d399]/30 bg-[#34d399]/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#34d399]">
              {overview?.last_scan_date ? "Nuova scansione" : "Avvia prima scansione"}
            </button>
            <button onClick={() => { setSelectedSuitability(["alta", "media", "bassa", "non_analizzato"]); setSelectedKwpRange("all"); setSelectedAteco([]); }} className="border border-white/10 bg-white/[0.035] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/55">
              Tutti gli asset →
            </button>
          </div>
        </div>
      </section>

      <section className="mb-5 border border-[rgba(52,211,153,0.15)] bg-[#080F1A]/80 px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#34d399]">Filtri territorio</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">Mostrati {fmtNumber(filteredAssets.length)} / {fmtNumber(assets.length)} asset</div>
        </div>
        <div className="grid grid-cols-[1.1fr_1fr_1.3fr] gap-5">
          <FilterBlock label="Idoneità">{SUITABILITY_OPTIONS.map((item) => <Chip key={item} active={selectedSuitability.includes(item)} onClick={() => toggleSuitability(item)}>{item.replace("_", " ")}</Chip>)}</FilterBlock>
          <FilterBlock label="Range kWp">{KWP_RANGES.map((range) => <Chip key={range} active={selectedKwpRange === range} onClick={() => setSelectedKwpRange(range)}>{range}</Chip>)}</FilterBlock>
          <FilterBlock label="ATECO / categoria">{allAteco.map((item) => <Chip key={item.category} active={selectedAteco.includes(item.category)} onClick={() => toggleAteco(item.category)}>{item.category}</Chip>)}</FilterBlock>
        </div>
      </section>

      <section className="mb-6 grid grid-cols-5 gap-3">
        <BigNumber label="Edifici identificati" value={totals.buildings_identified} />
        <BigNumber label="Tetti idonei" value={totals.with_idoneous_roof} accent />
        <BigNumber label="No-FV" value={totals.without_existing_pv} />
        <BigNumber label="Superficie > 2000 mq" value={totals.above_2000mq} />
        <BigNumber label="MWp totali" value={(totals.total_installable_kwp / 1000).toFixed(1)} accent />
      </section>

      <section className="mb-6 border border-[rgba(52,211,153,0.15)] bg-[#080F1A]/80 p-3">
        <div className="mb-3 flex items-center justify-between px-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#34d399]/80">Mappa asset live · layer territoriale clusterizzato</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">{fmtNumber(rankedAssets.length)} asset visibili in mappa</div>
        </div>
        <div className="relative h-[52vh] overflow-hidden border border-white/10 bg-[#080F1A]">
          <MapCanvas assets={rankedAssets} selectedAssetId={selectedAssetId} selectedTerritory={null} onAssetSelect={setSelectedAssetId} layout="full" />
        </div>
      </section>

      <section className="grid grid-cols-[1.2fr_1fr_0.9fr] gap-4">
        <Panel title="Distribuzione kWp"><SvgBarChart rows={distribution} /></Panel>
        <Panel title="Top ATECO / categorie"><AtecoList rows={byAteco} /></Panel>
        <Panel title="Mix idoneità"><SuitabilityPie data={bySuitability} /></Panel>
      </section>

      {loading ? <div className="fixed bottom-6 left-6 border border-[rgba(52,211,153,0.15)] bg-[#080F1A]/90 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">Caricamento panoramica territorio...</div> : null}

      <ScanModal
        open={scanModalOpen}
        territoryName={territoryName}
        minArea={scanMinArea}
        minKwp={scanMinKwp}
        maxKwp={scanMaxKwp}
        limit={scanLimit}
        suitabilityFloor={scanSuitabilityFloor}
        atecoCodes={scanAtecoCodes}
        dryRun={scanDryRun}
        running={scanRunning}
        message={scanMessage}
        onMinAreaChange={setScanMinArea}
        onMinKwpChange={setScanMinKwp}
        onMaxKwpChange={setScanMaxKwp}
        onLimitChange={setScanLimit}
        onSuitabilityFloorChange={setScanSuitabilityFloor}
        onAtecoCodesChange={setScanAtecoCodes}
        onDryRunChange={setScanDryRun}
        onClose={() => setScanModalOpen(false)}
        onSubmit={runNewScan}
      />
    </main>
  );
}

function BigNumber({ label, value, accent = false }: { label: string; value: number | string; accent?: boolean }) {
  return <div className="border border-[rgba(52,211,153,0.15)] bg-[#080F1A]/80 px-4 py-4"><div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">{label}</div><div className={`mt-3 font-mono text-3xl ${accent ? "text-[#34d399]" : "text-white/88"}`}>{typeof value === "number" ? fmtNumber(value) : value}</div></div>;
}

function FilterBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">{label}</div><div className="flex flex-wrap gap-1.5">{children}</div></div>;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] ${active ? "border-[#34d399]/40 bg-[#34d399]/12 text-[#34d399]" : "border-white/10 bg-white/[0.035] text-white/50"}`}>{children}</button>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="min-h-[280px] border border-[rgba(52,211,153,0.15)] bg-[#080F1A]/80 p-4"><div className="mb-5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#34d399]/80">{title}</div>{children}</div>;
}

function SvgBarChart({ rows }: { rows: Array<{ range: string; count: number }> }) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  const chartWidth = 560;
  const left = 86;
  const maxBarWidth = chartWidth - left - 52;
  return (
    <svg viewBox={`0 0 ${chartWidth} 232`} className="h-[232px] w-full overflow-visible">
      {rows.map((row, index) => {
        const y = 18 + index * 36;
        const width = Math.max((row.count / max) * maxBarWidth, row.count ? 8 : 0);
        return <g key={row.range}><text x="0" y={y + 13} fill="rgba(255,255,255,0.58)" fontFamily="IBM Plex Mono, monospace" fontSize="11">{row.range}</text><rect x={left} y={y} width={maxBarWidth} height="18" fill="rgba(255,255,255,0.045)" /><rect x={left} y={y} width={width} height="18" fill="#34d399" /><text x={left + width + 8} y={y + 13} fill="rgba(255,255,255,0.82)" fontFamily="IBM Plex Mono, monospace" fontSize="11">{fmtNumber(row.count)}</text></g>;
      })}
    </svg>
  );
}

function AtecoList({ rows }: { rows: Array<{ category: string; count: number }> }) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  return <div className="space-y-3">{rows.map((row) => <div key={row.category}><div className="mb-1 grid grid-cols-[1fr_42px] gap-3 font-mono text-[10px] uppercase tracking-[0.12em] text-white/58"><span className="truncate">{row.category}</span><span className="text-right text-white/78">{fmtNumber(row.count)}</span></div><div className="h-2 bg-white/[0.045]"><div className="h-full bg-[#34d399]/80" style={{ width: `${Math.max((row.count / max) * 100, row.count ? 5 : 0)}%` }} /></div></div>)}{!rows.length ? <div className="font-mono text-xs uppercase tracking-[0.14em] text-white/35">Nessuna categoria nel filtro corrente.</div> : null}</div>;
}

function SuitabilityPie({ data }: { data: { alta: number; media: number; bassa: number; non_analizzato: number } }) {
  const total = data.alta + data.media + data.bassa + data.non_analizzato;
  const segments = [
    { key: "alta", label: "alta", value: data.alta, color: "#34d399" },
    { key: "media", label: "media", value: data.media, color: "#fbbf24" },
    { key: "bassa", label: "bassa", value: data.bassa, color: "#ef4444" },
    { key: "non_analizzato", label: "non analizzato", value: data.non_analizzato, color: "#6b7280" },
  ];
  let cumulative = 0;
  return <div className="flex items-center gap-6"><svg viewBox="0 0 120 120" className="h-40 w-40 -rotate-90"><circle cx="60" cy="60" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="24" />{segments.map((segment) => { const share = total ? (segment.value / total) * 100 : 0; const dashOffset = -cumulative; cumulative += share; return <circle key={segment.key} cx="60" cy="60" r="42" fill="none" stroke={segment.color} strokeWidth="24" pathLength={100} strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={dashOffset} />; })}<circle cx="60" cy="60" r="27" fill="#080F1A" /><text x="60" y="65" textAnchor="middle" transform="rotate(90 60 60)" fill="rgba(255,255,255,0.88)" fontFamily="IBM Plex Mono, monospace" fontSize="18">{fmtNumber(total)}</text></svg><div className="flex-1 space-y-3">{segments.map((segment) => <LegendLine key={segment.key} color={segment.color} label={segment.label} value={segment.value} />)}</div></div>;
}

function LegendLine({ color, label, value }: { color: string; label: string; value: number }) {
  return <div className="flex items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-[0.13em] text-white/58"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{label}</span><span className="text-white/82">{fmtNumber(value)}</span></div>;
}

function ScanModal(props: {
  open: boolean;
  territoryName: string;
  minArea: number;
  minKwp: number;
  maxKwp: number;
  limit: number;
  suitabilityFloor: SuitabilityFloor;
  atecoCodes: string;
  dryRun: boolean;
  running: boolean;
  message: string | null;
  onMinAreaChange: (value: number) => void;
  onMinKwpChange: (value: number) => void;
  onMaxKwpChange: (value: number) => void;
  onLimitChange: (value: number) => void;
  onSuitabilityFloorChange: (value: SuitabilityFloor) => void;
  onAtecoCodesChange: (value: string) => void;
  onDryRunChange: (value: boolean) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#03070d]/76 backdrop-blur-sm">
      <div className="console-panel w-[520px] border p-5">
        <div className="mb-4 border-b border-white/10 pb-4">
          <div className="font-display text-lg font-semibold text-white">Nuova scansione su {props.territoryName}</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Configura soglie operative</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="Min area mq" value={props.minArea} onChange={props.onMinAreaChange} />
          <NumberInput label="Min kWp" value={props.minKwp} onChange={props.onMinKwpChange} />
          <NumberInput label="Max kWp" value={props.maxKwp} onChange={props.onMaxKwpChange} />
          <NumberInput label="Limit" value={props.limit} onChange={props.onLimitChange} />
          <label className="field-shell block px-3 py-2"><span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">Suitability floor</span><select value={props.suitabilityFloor} onChange={(event) => props.onSuitabilityFloorChange(event.target.value as SuitabilityFloor)} className="w-full bg-transparent font-mono text-sm text-white outline-none"><option className="bg-[#080f1a]" value="alta">alta</option><option className="bg-[#080f1a]" value="media">media</option><option className="bg-[#080f1a]" value="bassa">bassa</option></select></label>
          <label className="field-shell block px-3 py-2"><span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">ATECO codes</span><input value={props.atecoCodes} onChange={(event) => props.onAtecoCodesChange(event.target.value)} className="w-full bg-transparent font-mono text-sm text-white outline-none" placeholder="25.62, 10.89" /></label>
        </div>
        <label className="mt-3 flex items-start gap-3 border border-white/10 bg-white/[0.035] px-3 py-3">
          <input type="checkbox" checked={props.dryRun} onChange={(event) => props.onDryRunChange(event.target.checked)} />
          <span className="text-xs leading-relaxed text-white/58"><b className="text-white/75">Dry run</b>: ricarica OpenAPI per scan in produzione. Disattivalo per scrivere nuovi asset nel database.</span>
        </label>
        {props.message ? <div className="mt-3 border border-tiloca-amber/25 bg-tiloca-amber/10 px-3 py-2 font-mono text-[10px] text-tiloca-amber">{props.message}</div> : null}
        <div className="mt-5 flex gap-2">
          <button onClick={props.onSubmit} disabled={props.running} className="flex-1 border border-tiloca-green/35 bg-tiloca-green/10 px-4 py-3 text-left font-mono text-[11px] uppercase tracking-[0.16em] text-tiloca-green disabled:opacity-40">{props.running ? "Scansione in corso..." : "Avvia scansione"}</button>
          <button onClick={props.onClose} className="border border-white/10 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-white/55">Annulla</button>
        </div>
      </div>
    </div>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="field-shell block px-3 py-2"><span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">{label}</span><input value={value} type="number" min={0} onChange={(event) => onChange(Number(event.target.value) || 0)} className="w-full bg-transparent font-mono text-sm text-white outline-none" /></label>;
}
