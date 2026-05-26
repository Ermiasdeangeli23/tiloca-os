"use client";

import Link from "next/link";

import type { Delivery } from "@/lib/types";

const statusOrder: Record<string, number> = {
  active: 0,
  draft: 1,
  delivered: 2,
  archived: 3,
};

function fmtDate(value: string): string {
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

function statusLabel(status: string): string {
  if (status === "active") return "attiva";
  if (status === "draft") return "bozza";
  if (status === "delivered") return "consegnata";
  if (status === "archived") return "archiviata";
  return status;
}

export function DeliveryList({ deliveries }: { deliveries: Delivery[] }) {
  const sorted = [...deliveries].sort((a, b) => {
    const statusDelta = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    if (statusDelta !== 0) return statusDelta;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  if (!sorted.length) {
    return (
      <div className="field-shell p-8 text-center font-mono text-xs uppercase tracking-[0.16em] text-white/35">
        Nessuna delivery presente
      </div>
    );
  }

  return (
    <div className="overflow-hidden border border-white/10">
      <div className="grid grid-cols-[1.4fr_1fr_120px_120px_150px] border-b border-white/10 bg-white/[0.035] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/32">
        <div>Cliente</div>
        <div>Province</div>
        <div>Assets</div>
        <div>Status</div>
        <div>Aggiornata</div>
      </div>
      {sorted.map((delivery) => (
        <Link
          key={delivery.slug}
          href={`/deliveries/${delivery.slug}`}
          className="grid grid-cols-[1.4fr_1fr_120px_120px_150px] items-center border-b border-white/5 px-4 py-4 transition hover:bg-white/[0.045]"
        >
          <div>
            <div className="font-display text-sm font-semibold text-white/88">{delivery.client_name}</div>
            <div className="mt-1 font-mono text-[10px] text-white/30">{delivery.slug}</div>
          </div>
          <div className="font-mono text-xs text-white/55">{delivery.target_provinces.join(", ") || "-"}</div>
          <div className="font-mono text-xs text-white/65">{delivery.asset_count ?? 0}</div>
          <div>
            <span className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${statusClass(delivery.status)}`}>
              {statusLabel(delivery.status)}
            </span>
          </div>
          <div className="font-mono text-[10px] text-white/42">{fmtDate(delivery.updated_at)}</div>
        </Link>
      ))}
    </div>
  );
}
