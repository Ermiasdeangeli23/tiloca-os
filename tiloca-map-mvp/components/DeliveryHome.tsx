"use client";

import { useCallback, useEffect, useState } from "react";

import { DeliveryList } from "@/components/DeliveryList";
import { NewDeliveryModal } from "@/components/NewDeliveryModal";
import { createDelivery, getDelivery, listDeliveries } from "@/lib/api";
import type { Delivery } from "@/lib/types";

export function DeliveryHome() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadDeliveries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listDeliveries();
      const enriched = await Promise.all(
        list.map(async (delivery) => {
          try {
            return await getDelivery(delivery.slug);
          } catch {
            return delivery;
          }
        })
      );
      setDeliveries(enriched);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Impossibile caricare le delivery");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDeliveries();
  }, [loadDeliveries]);

  const handleCreate = async (payload: {
    client_name: string;
    target_provinces: string[];
    criteria: Record<string, unknown>;
    target_opportunity_count: number;
    notes?: string;
  }) => {
    setCreating(true);
    setError(null);
    try {
      await createDelivery({
        ...payload,
        status: "draft",
        notes: payload.notes || "Creata dalla home delivery Tiloca.",
      });
      setModalOpen(false);
      await loadDeliveries();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Impossibile creare la delivery");
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="h-screen overflow-hidden bg-[#080f1a] pt-14">
      <div className="mx-auto flex h-full max-w-6xl flex-col px-6 py-6">
        <header className="flex items-center justify-between border-b border-white/10 pb-5">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-white">
              Tiloca · Territorial Console
            </h1>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-tiloca-green/75">
              Indice spazio lavoro delivery
            </div>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="border border-tiloca-green/35 bg-tiloca-green/10 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-tiloca-green transition hover:bg-tiloca-green/15"
          >
            + Nuova delivery
          </button>
        </header>

        <section className="thin-scroll flex-1 overflow-y-auto py-6">
          {error ? (
            <div className="mb-4 border border-red-400/30 bg-red-950/45 px-3 py-2 font-mono text-xs text-red-100">
              {error}
            </div>
          ) : null}
          {loading ? (
            <div className="field-shell p-8 font-mono text-xs uppercase tracking-[0.16em] text-white/40">
              Caricamento delivery...
            </div>
          ) : (
            <DeliveryList deliveries={deliveries} />
          )}
        </section>

        <footer className="border-t border-white/10 pt-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
            Gli asset sono collegati alle delivery. Le operazioni globali restano in area legacy.
          </div>
        </footer>
      </div>

      <NewDeliveryModal
        open={modalOpen}
        creating={creating}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreate}
      />
    </main>
  );
}
