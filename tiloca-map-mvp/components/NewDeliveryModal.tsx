"use client";

import { useState } from "react";

import type { Delivery } from "@/lib/types";

type NewDeliveryModalProps = {
  open: boolean;
  creating: boolean;
  onClose: () => void;
  onCreate: (payload: {
    client_name: string;
    target_provinces: string[];
    criteria: Record<string, unknown>;
    target_opportunity_count: number;
    notes?: string;
  }) => Promise<Delivery | void>;
};

const provinceOptions = [
  { label: "Torino", value: "torino" },
  { label: "Cuneo", value: "cuneo" },
  { label: "Parma", value: "parma" },
  { label: "Brescia", value: "brescia" },
  { label: "Bergamo", value: "bergamo" },
  { label: "Verona", value: "verona" },
];

export function NewDeliveryModal({ open, creating, onClose, onCreate }: NewDeliveryModalProps) {
  const [clientName, setClientName] = useState("");
  const [targetProvinces, setTargetProvinces] = useState<string[]>(["torino", "cuneo"]);
  const [atecoCodes, setAtecoCodes] = useState("25.62");
  const [targetCount, setTargetCount] = useState(30);
  const [minArea, setMinArea] = useState(2000);
  const [maxArea, setMaxArea] = useState(30000);
  const [minKwp, setMinKwp] = useState(300);
  const [maxKwp, setMaxKwp] = useState(2500);
  const [minEmployees, setMinEmployees] = useState(5);
  const [maxEmployees, setMaxEmployees] = useState(80);

  if (!open) return null;

  const toggleProvince = (value: string) => {
    setTargetProvinces((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  };

  const submit = async () => {
    await onCreate({
      client_name: clientName.trim(),
      target_provinces: targetProvinces,
      target_opportunity_count: targetCount,
      criteria: {
        ateco_codes: atecoCodes
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        min_area_mq: minArea,
        max_area_mq: maxArea,
        min_kwp: minKwp,
        max_kwp: maxKwp,
        min_employees: minEmployees,
        max_employees: maxEmployees,
        suitability_floor: "media",
        limit: 2,
        dryRun: true,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#03070d]/75 backdrop-blur-sm">
      <div className="console-panel w-[560px] border p-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <div className="font-display text-lg font-semibold text-white">Nuova delivery</div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
              Contenitore operativo cliente
            </div>
          </div>
          <button onClick={onClose} className="border border-white/10 px-2 py-1 font-mono text-xs text-white/55">
            Chiudi
          </button>
        </div>

        <div className="thin-scroll max-h-[70vh] space-y-4 overflow-y-auto py-5">
          <Field label="Nome cliente">
            <input
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
              className="w-full bg-transparent text-sm text-white outline-none"
              placeholder="IM-EL"
            />
          </Field>

          <div>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/32">
              Province target
            </div>
            <div className="grid grid-cols-3 gap-1">
              {provinceOptions.map((province) => (
                <button
                  key={province.value}
                  onClick={() => toggleProvince(province.value)}
                  className={`border px-2 py-2 font-mono text-[10px] uppercase tracking-[0.12em] ${
                    targetProvinces.includes(province.value)
                      ? "border-tiloca-green/45 bg-tiloca-green/10 text-tiloca-green"
                      : "border-white/10 bg-white/[0.035] text-white/45"
                  }`}
                >
                  {province.label}
                </button>
              ))}
            </div>
          </div>

          <Field label="Codici ATECO">
            <input
              value={atecoCodes}
              onChange={(event) => setAtecoCodes(event.target.value)}
              className="w-full bg-transparent font-mono text-sm text-white outline-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Min area" value={minArea} onChange={setMinArea} />
            <NumberField label="Max area" value={maxArea} onChange={setMaxArea} />
            <NumberField label="Min kWp" value={minKwp} onChange={setMinKwp} />
            <NumberField label="Max kWp" value={maxKwp} onChange={setMaxKwp} />
            <NumberField label="Min addetti" value={minEmployees} onChange={setMinEmployees} />
            <NumberField label="Max addetti" value={maxEmployees} onChange={setMaxEmployees} />
            <NumberField label="Opportunità target" value={targetCount} onChange={setTargetCount} />
          </div>
        </div>

        <button
          onClick={submit}
          disabled={creating || !clientName.trim() || !targetProvinces.length}
          className="w-full border border-tiloca-green/35 bg-tiloca-green/10 px-4 py-3 text-left font-mono text-[11px] uppercase tracking-[0.16em] text-tiloca-green disabled:cursor-not-allowed disabled:opacity-40"
        >
          {creating ? "Creazione delivery..." : "Crea delivery bozza"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field-shell block px-3 py-2">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
        {label}
      </span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        value={value}
        type="number"
        min={0}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className="w-full bg-transparent font-mono text-sm text-white outline-none"
      />
    </Field>
  );
}
