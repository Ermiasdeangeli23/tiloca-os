"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getTerritories } from "@/lib/api";
import type { Territory } from "@/lib/types";

export function TerritoriesList() {
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTerritories()
      .then(setTerritories)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Impossibile caricare i territori"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="h-screen overflow-hidden bg-[#080f1a] pt-14">
      <div className="mx-auto flex h-full max-w-6xl flex-col px-6 py-6">
        <header className="border-b border-white/10 pb-5">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-white">Territori</h1>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-tiloca-green/75">
            Panoramica pipeline a livello provinciale
          </div>
        </header>

        <section className="thin-scroll flex-1 overflow-y-auto py-6">
          {error ? (
            <div className="mb-4 border border-red-400/30 bg-red-950/45 px-3 py-2 font-mono text-xs text-red-100">
              {error}
            </div>
          ) : null}
          {loading ? (
            <div className="field-shell p-8 font-mono text-xs uppercase tracking-[0.16em] text-white/40">
              Caricamento territori...
            </div>
          ) : (
            <div className="overflow-hidden border border-white/10">
              <div className="grid grid-cols-[1fr_1fr_120px_120px] border-b border-white/10 bg-white/[0.035] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/32">
                <div>Territorio</div>
                <div>Profilo</div>
                <div>Min MQ</div>
                <div>Min kWp</div>
              </div>
              {territories.map((territory) => (
                <Link
                  key={territory.slug}
                  href={`/territories/${territory.slug}`}
                  className="grid grid-cols-[1fr_1fr_120px_120px] items-center border-b border-white/5 px-4 py-4 transition hover:bg-white/[0.045]"
                >
                  <div>
                    <div className="font-display text-sm font-semibold text-white/88">{territory.name}</div>
                    <div className="mt-1 font-mono text-[10px] text-white/30">{territory.slug}</div>
                  </div>
                  <div className="font-mono text-xs text-white/55">{territory.profile}</div>
                  <div className="font-mono text-xs text-white/65">{territory.min_area_mq}</div>
                  <div className="font-mono text-xs text-white/65">{territory.min_kwp}</div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
