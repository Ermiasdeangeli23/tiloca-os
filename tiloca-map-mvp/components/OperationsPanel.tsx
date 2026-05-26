"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { MapCanvas } from "@/components/MapCanvas";
import { getAssets, getTerritories, triggerScan } from "@/lib/api";
import { opportunityScore, reportState, scoreLabel } from "@/lib/opportunity";
import type { Asset, RankedAsset, Territory } from "@/lib/types";

function rankAssets(assets: Asset[]): RankedAsset[] {
  return assets.map((asset, index) => ({
    ...asset,
    rank: index + 1,
    opportunity_score: opportunityScore(asset),
    score_label: scoreLabel(opportunityScore(asset)),
    score_components: { capacity_score: 0, roof_score: 0, pv_absence_score: 0, industrial_score: 0 },
    report_state: reportState(asset),
    data_quality: { confidence: "medium", warnings: [], manual_checks: [] },
    recommended_state: "needs_review",
    recommendation_reason: "",
    commercial_fit: { profile_name: "Operations legacy", label: "ideal_sme_ci", reason: "", recommended_action: "prioritize" },
  }));
}

export function OperationsPanel() {
  const [bannerVisible, setBannerVisible] = useState(true);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [territory, setTerritory] = useState("parma");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [scanStatus, setScanStatus] = useState("in attesa");
  const [lastScanId, setLastScanId] = useState<number | null>(null);
  const selectedTerritory = territories.find((item) => item.slug === territory) || null;
  const rankedAssets = useMemo(() => rankAssets(assets), [assets]);

  useEffect(() => {
    getTerritories().then((items) => {
      setTerritories(items);
      if (!items.find((item) => item.slug === territory) && items[0]) setTerritory(items[0].slug);
    });
  }, [territory]);

  useEffect(() => {
    getAssets({ territory, limit: 500 }).then(setAssets).catch(() => setAssets([]));
  }, [territory]);

  const runScan = async () => {
    setScanStatus("in corso");
    try {
      const scan = await triggerScan(territory, 10, { minAreaMq: 2000, minKwp: 300, suitabilityLevels: ["alta", "media"] });
      setLastScanId(scan.id);
      setAssets(await getAssets({ territory, limit: 500 }));
      setScanStatus("completato");
    } catch {
      setScanStatus("fallito");
    }
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#080f1a]">
      {bannerVisible ? (
        <div className="fixed left-[320px] right-6 top-16 z-[70] flex items-center justify-between border border-tiloca-amber/35 bg-tiloca-amber/12 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-tiloca-amber backdrop-blur-md">
          <span>⚠ Console legacy. Il workflow ufficiale è basato su Delivery e Territori. Questa pagina sarà rimossa in una versione futura.</span>
          <button onClick={() => setBannerVisible(false)} className="border border-tiloca-amber/30 px-2 py-1">Chiudi</button>
        </div>
      ) : null}
      <MapCanvas assets={rankedAssets} selectedAssetId={selectedAssetId} selectedTerritory={selectedTerritory} onAssetSelect={setSelectedAssetId} />
      <aside className="console-panel fixed bottom-0 left-0 top-14 z-20 flex w-[300px] flex-col border-r">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="font-display text-lg font-semibold tracking-tight text-white">Operations legacy</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">Uso tecnico avanzato</div>
        </div>
        <div className="space-y-4 p-5">
          <label className="field-shell block px-3 py-2">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">Territorio</span>
            <select value={territory} onChange={(event) => setTerritory(event.target.value)} className="w-full bg-transparent text-sm text-white outline-none">
              {territories.map((item) => <option key={item.slug} value={item.slug} className="bg-[#080f1a]">{item.name}</option>)}
            </select>
          </label>
          <button onClick={runScan} className="w-full border border-tiloca-green/30 bg-tiloca-green/10 px-3 py-3 text-left font-mono text-[11px] uppercase tracking-[0.16em] text-tiloca-green">
            Analizza top 10 candidati
          </button>
          <Link href={`/territories/${territory}`} className="block border border-white/10 bg-white/[0.035] px-3 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-white/60">
            Panoramica territorio →
          </Link>
          <div className="field-shell px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">Scan: {scanStatus}</div>
          {lastScanId ? (
            <Link href={`/operations/scans/${lastScanId}`} className="block border border-tiloca-green/25 bg-tiloca-green/10 px-3 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-tiloca-green">
              Apri revisione scan #{lastScanId}
            </Link>
          ) : null}
          <div className="field-shell px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">Asset API: {assets.length}</div>
        </div>
      </aside>
    </main>
  );
}
