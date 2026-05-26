"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { getScanAssets, getTerritories, satelliteImageUrl } from "@/lib/api";
import type { ScanAsset, ScanAssetsResponse, Territory } from "@/lib/types";

type NameFilter = "all" | "named" | "anonymous";

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("it-IT").format(value);
}

function googleMapsUrl(asset: ScanAsset): string {
  return `https://www.google.com/maps?q=${asset.lat},${asset.lon}`;
}

function scanImageUrl(asset: ScanAsset): string | null {
  return satelliteImageUrl(asset.scan_analysis?.satellite_image_path || asset.satellite_image_path);
}

function debugValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

export default function ScanReviewPage() {
  const params = useParams<{ id: string }>();
  const scanId = Number(params.id);
  const [data, setData] = useState<ScanAssetsResponse | null>(null);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [suitability, setSuitability] = useState("all");
  const [nameFilter, setNameFilter] = useState<NameFilter>("all");
  const [minArea, setMinArea] = useState("");
  const [maxArea, setMaxArea] = useState("");

  useEffect(() => {
    if (!Number.isFinite(scanId)) return;
    setError(null);
    Promise.all([getScanAssets(scanId), getTerritories()])
      .then(([scanAssets, territoryList]) => {
        setData(scanAssets);
        setTerritories(territoryList);
      })
      .catch((exc: Error) => setError(exc.message));
  }, [scanId]);

  const territory = territories.find((item) => item.id === data?.scan.territory_id);
  const debugInfo = data?.scan.debug_info || {};
  const filtersUsed = data?.scan.filters_used || {};

  const filteredAssets = useMemo(() => {
    const min = minArea ? Number(minArea) : null;
    const max = maxArea ? Number(maxArea) : null;
    return (data?.assets || []).filter((asset) => {
      const scanSuitability = asset.scan_analysis?.suitability || asset.suitability || "";
      if (suitability !== "all" && scanSuitability !== suitability) return false;
      if (nameFilter === "named" && !asset.name && !asset.company_match?.company_name) return false;
      if (nameFilter === "anonymous" && (asset.name || asset.company_match?.company_name)) return false;
      if (min !== null && asset.area_mq < min) return false;
      if (max !== null && asset.area_mq > max) return false;
      return true;
    });
  }, [data?.assets, maxArea, minArea, nameFilter, suitability]);
  const stats: Array<[string, number]> = [
    ["Analizzati", data?.scan.analyzed_count || 0],
    ["Persistiti", data?.scan.persisted_count || 0],
    ["Rifiutati", data?.scan.rejected_count || 0],
    ["Vision fail", Number(debugInfo.vision_failures_count || 0)],
    ["Asset visibili", filteredAssets.length],
  ];

  return (
    <main className="min-h-screen bg-[#080f1a] px-6 pb-10 pt-20 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <Link href="/operations" className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/45">
              &larr; Operations
            </Link>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Revisione scan #{scanId}</h1>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">
              Territorio: {territory?.name || data?.scan.territory_id || "-"} / stato: {data?.scan.status || "-"}
            </p>
          </div>
          <button
            onClick={() => getScanAssets(scanId).then(setData).catch((exc: Error) => setError(exc.message))}
            className="border border-tiloca-green/30 bg-tiloca-green/10 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-tiloca-green"
          >
            Aggiorna
          </button>
        </div>

        {error ? (
          <div className="mb-5 border border-red-400/30 bg-red-500/10 px-4 py-3 font-mono text-xs text-red-200">
            Errore: {error}
          </div>
        ) : null}

        <section className="mb-5 grid gap-3 md:grid-cols-5">
          {stats.map(([label, value]) => (
            <div key={label} className="border border-tiloca-green/15 bg-[#0a111d]/80 px-4 py-3">
              <div className="font-mono text-2xl text-tiloca-green">{formatNumber(value)}</div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">{label}</div>
            </div>
          ))}
        </section>

        <section className="mb-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="border border-white/10 bg-white/[0.035] p-4">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Filtri usati</div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-xs leading-5 text-white/60">
              {debugValue(filtersUsed)}
            </pre>
          </div>
          <div className="border border-white/10 bg-white/[0.035] p-4">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Debug scan</div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-xs leading-5 text-white/60">
              {debugValue(debugInfo)}
            </pre>
          </div>
        </section>

        <section className="mb-5 flex flex-wrap items-end gap-3 border border-white/10 bg-white/[0.035] p-4">
          <label className="min-w-44">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Idoneita</span>
            <select value={suitability} onChange={(event) => setSuitability(event.target.value)} className="w-full bg-[#080f1a] px-3 py-2 text-sm outline-none">
              <option value="all">Tutte</option>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="bassa">Bassa</option>
              <option value="nulla">Nulla</option>
              <option value="errore">Errore</option>
            </select>
          </label>
          <label className="min-w-44">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Nome</span>
            <select value={nameFilter} onChange={(event) => setNameFilter(event.target.value as NameFilter)} className="w-full bg-[#080f1a] px-3 py-2 text-sm outline-none">
              <option value="all">Tutti</option>
              <option value="named">Con nome</option>
              <option value="anonymous">Anonimi / OSM</option>
            </select>
          </label>
          <label className="w-36">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Min mq</span>
            <input value={minArea} onChange={(event) => setMinArea(event.target.value)} className="w-full bg-[#080f1a] px-3 py-2 text-sm outline-none" inputMode="numeric" />
          </label>
          <label className="w-36">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Max mq</span>
            <input value={maxArea} onChange={(event) => setMaxArea(event.target.value)} className="w-full bg-[#080f1a] px-3 py-2 text-sm outline-none" inputMode="numeric" />
          </label>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredAssets.map((asset) => {
            const analysis = asset.scan_analysis;
            const imageUrl = scanImageUrl(asset);
            const displayName = asset.company_match?.company_name || asset.name || `OSM ${asset.osm_id}`;
            return (
              <article key={`${asset.id}-${analysis?.id || "asset"}`} className="overflow-hidden border border-white/10 bg-[#0a111d]/85">
                <div className="aspect-[16/9] bg-black/40">
                  {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : null}
                </div>
                <div className="space-y-4 p-4">
                  <div>
                    <div className="font-display text-lg font-semibold text-white">{displayName}</div>
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
                      Asset #{asset.id} / {asset.osm_id}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                    <div className="border border-white/10 p-2"><span className="block text-white/35">Area</span>{formatNumber(asset.area_mq)} mq</div>
                    <div className="border border-white/10 p-2"><span className="block text-white/35">kWp</span>{formatNumber(analysis?.estimated_kwp || asset.estimated_kwp)}</div>
                    <div className="border border-white/10 p-2"><span className="block text-white/35">Tetto</span>{analysis?.roof_type || asset.roof_type || "-"}</div>
                    <div className="border border-white/10 p-2"><span className="block text-white/35">Idoneita</span>{analysis?.suitability || asset.suitability || "-"}</div>
                    <div className="border border-white/10 p-2"><span className="block text-white/35">Lat</span>{asset.lat}</div>
                    <div className="border border-white/10 p-2"><span className="block text-white/35">Lon</span>{asset.lon}</div>
                  </div>
                  <div className="border border-white/10 p-3 font-mono text-xs text-white/60">
                    Company match: {asset.company_match ? `${asset.company_match.match_confidence} / ${asset.company_match.source}` : "-"}
                  </div>
                  <a href={googleMapsUrl(asset)} target="_blank" rel="noreferrer" className="block border border-tiloca-green/25 px-3 py-2 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-tiloca-green">
                    Apri in Google Maps
                  </a>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
