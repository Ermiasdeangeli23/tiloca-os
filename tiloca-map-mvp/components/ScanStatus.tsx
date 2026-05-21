"use client";

import type { ScanStatus as Status } from "@/lib/types";

const statusStyle: Record<Status, string> = {
  IDLE: "text-white/45",
  RUNNING: "text-tiloca-amber",
  COMPLETED: "text-tiloca-green",
  FAILED: "text-red-300",
};

export function ScanStatus({ status, message }: { status: Status; message?: string }) {
  return (
    <div className="field-shell px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
          Scan Status
        </span>
        <span className={`font-mono text-[11px] font-semibold ${statusStyle[status]}`}>
          {status}
        </span>
      </div>
      {message ? (
        <div className="mt-2 line-clamp-3 font-mono text-[10px] leading-relaxed text-white/42">
          {message}
        </div>
      ) : null}
    </div>
  );
}
