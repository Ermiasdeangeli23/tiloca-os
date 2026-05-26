"use client";

import { useEffect, useState } from "react";

import { satelliteImageUrl } from "@/lib/api";
import {
  commercialFit,
  dataQuality,
  opportunityScore,
  qualificationRecommendation,
  reportState,
  scoreComponents,
  scoreLabel,
} from "@/lib/opportunity";
import type { AssetDetail, DataQualityWarning, DeliveryProjectConfig, ReportState } from "@/lib/types";

function fmtNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("it-IT").format(value);
}

function fmtCapacity(value: number | null | undefined): string {
  if (!value) return "-";
  if (value >= 1000) return `${(value / 1000).toFixed(2)} MWp`;
  return `${fmtNumber(value)} kWp`;
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function label(value: string | null | undefined): string {
  return value || "-";
}

function suitabilityClass(value: string | null | undefined): string {
  if (value === "alta") return "border-tiloca-green/40 text-tiloca-green";
  if (value === "media") return "border-tiloca-amber/40 text-tiloca-amber";
  if (value === "bassa") return "border-slate-400/30 text-slate-300";
  if (value === "nulla" || value === "errore") return "border-red-400/30 text-red-300";
  return "border-white/15 text-white/55";
}

function metadataEntries(asset: AssetDetail): Array<[string, string]> {
  const metadata = asset.industrial_metadata || {};
  return Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
    .slice(0, 12)
    .map(([key, value]) => [key, String(value)]);
}

const warningLabels: Record<DataQualityWarning, string> = {
  oversized_area: "Area sovradimensionata",
  missing_company_name: "Nome azienda mancante",
  missing_address: "Indirizzo mancante",
  generic_osm_asset: "Asset OSM generico",
  unusually_high_kwp: "kWp insolitamente alto",
  needs_manual_geometry_check: "Verifica geometria",
  low_metadata_confidence: "Metadati poco affidabili",
};

function confidenceClass(value: string): string {
  if (value === "high") return "border-tiloca-green/40 text-tiloca-green";
  if (value === "medium") return "border-tiloca-amber/40 text-tiloca-amber";
  return "border-red-400/35 text-red-300";
}

type AssetPanelProps = {
  asset: AssetDetail | null;
  rank: number | null;
  loading: boolean;
  error?: string;
  companyMatchLoading?: boolean;
  companyMatchError?: string;
  deliveryConfig: DeliveryProjectConfig;
  onCompanyMatch: (assetId: number) => void;
  onStateChange: (assetId: number, state: ReportState) => void;
  onClose: () => void;
};

export function AssetPanel({
  asset,
  rank,
  loading,
  error,
  companyMatchLoading = false,
  companyMatchError,
  deliveryConfig,
  onCompanyMatch,
  onStateChange,
  onClose,
}: AssetPanelProps) {
  const [verification, setVerification] = useState<Record<string, boolean>>({});
  const latestAnalysis = asset?.analyses?.[0];
  const imageUrl = satelliteImageUrl(
    latestAnalysis?.satellite_image_path || asset?.satellite_image_path || null
  );
  const entries = asset ? metadataEntries(asset) : [];
  const suitability = asset?.suitability || latestAnalysis?.suitability;
  const capacity = asset?.estimated_kwp || latestAnalysis?.estimated_kwp || null;
  const score = asset ? opportunityScore(asset) : 0;
  const components = asset ? scoreComponents(asset) : null;
  const readiness = asset ? reportState(asset) : "new";
  const scoreTier = scoreLabel(score);
  const quality = asset ? dataQuality(asset) : null;
  const recommendation = asset ? qualificationRecommendation(asset) : null;
  const companyMatch = asset?.company_match;
  const fit = asset ? commercialFit(asset, deliveryConfig) : null;

  useEffect(() => {
    setVerification({});
  }, [asset?.id]);

  const toggleVerification = (key: string) => {
    setVerification((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <aside
      className={`console-panel fixed bottom-0 right-0 top-0 z-30 w-[410px] border-l transition-transform duration-200 ${
        asset || loading || error ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
              Dossier intelligence
            </div>
            <div className="mt-1 font-display text-sm font-semibold text-white/90">
              {asset ? asset.name || `OSM ${asset.osm_id}` : loading ? "Caricamento asset" : "Nessun asset"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="border border-white/10 px-2 py-1 font-mono text-[11px] text-white/55 transition hover:border-white/20 hover:text-white"
          >
            Chiudi
          </button>
        </div>

        <div className="thin-scroll flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-5 font-mono text-xs text-white/50">Caricamento dossier asset...</div>
          ) : null}

          {error ? (
            <div className="m-5 border border-red-400/30 bg-red-950/40 p-3 font-mono text-xs text-red-100">
              {error}
            </div>
          ) : null}

          {asset ? (
            <div className="space-y-5 p-5">
              <div className="overflow-hidden border border-white/10 bg-white/[0.035]">
                <div className="relative">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={asset.name || `OSM ${asset.osm_id}`}
                      className="h-72 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-56 items-center justify-center bg-slate-950 font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">
                      Immagine satellite non disponibile
                    </div>
                  )}
                  <div className="absolute left-3 top-3 flex items-center gap-2">
                    <Badge value={rank ? `#${rank}` : "senza rank"} />
                    <Badge value={fmtCapacity(capacity)} accent />
                    <Badge value={`${score}/100 ${scoreTier}`} accent />
                  </div>
                </div>
              </div>

              <section className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
                    Coordinate
                  </div>
                  <div className="font-mono text-[11px] text-white/60">
                    {asset.lat.toFixed(6)}, {asset.lon.toFixed(6)}
                  </div>
                </div>
                <div className="font-mono text-[10px] text-white/30">OSM {asset.osm_id}</div>
              </section>

              <section className="grid grid-cols-2 gap-px overflow-hidden border border-white/10 bg-white/10">
                <Metric label="Rank" value={rank ? `#${rank}` : "-"} valueClass="text-tiloca-green" />
                <Metric label="Score opportunità" value={`${score}/100`} valueClass="text-tiloca-green" />
                <Metric label="Capacità" value={fmtCapacity(capacity)} />
                <Metric label="Area" value={`${fmtNumber(asset.area_mq)} mq`} />
                <Metric label="kWp stimati" value={fmtNumber(capacity)} />
                <Metric label="Tipo tetto" value={label(asset.roof_type || latestAnalysis?.roof_type)} />
                <Metric
                  label="Idoneità"
                  value={label(suitability)}
                  valueClass={suitabilityClass(suitability)}
                />
                <Metric label="Stato report" value={readiness.replace("_", " ")} />
                <Metric label="Ultima scansione" value={fmtDate(latestAnalysis?.created_at || asset.last_seen_at)} />
                <Metric
                  label="Qualità dati"
                  value={quality?.confidence || "-"}
                  valueClass={quality ? confidenceClass(quality.confidence) : undefined}
                />
                <Metric
                  label="Raccomandazione"
                  value={recommendation?.recommended_state.replaceAll("_", " ") || "-"}
                />
                <Metric
                  label="Fit commerciale"
                  value={fit?.label.replaceAll("_", " ") || "-"}
                  valueClass={fit?.label === "ideal_sme_ci" ? "text-tiloca-green" : "text-tiloca-amber"}
                />
              </section>

              <DossierBlock title="A. Idoneità tecnica tetto">
                <div className="grid grid-cols-2 gap-2 font-mono text-[10px] text-white/55">
                  <span>Area</span>
                  <span className="text-right text-white/75">{fmtNumber(asset.area_mq)} mq</span>
                  <span>Capacità stimata</span>
                  <span className="text-right text-white/75">{fmtCapacity(capacity)}</span>
                  <span>Tipo tetto</span>
                  <span className="text-right text-white/75">{label(asset.roof_type || latestAnalysis?.roof_type)}</span>
                  <span>Qualità tetto</span>
                  <span className="text-right text-white/75">{label(latestAnalysis?.roof_quality)}</span>
                  <span>Ostacoli</span>
                  <span className="text-right text-white/75">{label(latestAnalysis?.obstacles)}</span>
                  <span>FV presente</span>
                  <span className="text-right text-white/75">{latestAnalysis?.has_panels ? "sì" : "no"}</span>
                </div>
              </DossierBlock>

              <DossierBlock title="Componenti score opportunità">
                <div className="grid grid-cols-2 gap-2 font-mono text-[10px] text-white/55">
                  <span>Score capacità</span>
                  <span className="text-right text-white/75">{components?.capacity_score ?? "-"}/100</span>
                  <span>Score tetto</span>
                  <span className="text-right text-white/75">{components?.roof_score ?? "-"}/100</span>
                  <span>Score assenza FV</span>
                  <span className="text-right text-white/75">{components?.pv_absence_score ?? "-"}/100</span>
                  <span>Score industriale</span>
                  <span className="text-right text-white/75">{components?.industrial_score ?? "-"}/100</span>
                </div>
              </DossierBlock>

              <DossierBlock title="Qualità dati">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 font-mono text-[10px] text-white/55">
                    <span>Confidenza</span>
                    <span className={`text-right ${quality ? confidenceClass(quality.confidence) : "text-white/75"}`}>
                      {quality?.confidence || "-"}
                    </span>
                    <span>Raccomandazione</span>
                    <span className="text-right text-white/75">
                      {recommendation?.recommended_state.replaceAll("_", " ") || "-"}
                    </span>
                  </div>

                  <div>
                    <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/30">
                      Avvisi
                    </div>
                    {quality?.warnings.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {quality.warnings.map((warning) => (
                          <span
                            key={warning}
                            className="border border-tiloca-amber/25 bg-tiloca-amber/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-tiloca-amber"
                          >
                            {warningLabels[warning]}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-tiloca-green/80">
                        Nessun avviso qualità dati
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/30">
                      Verifiche manuali necessarie
                    </div>
                    {quality?.manual_checks.length ? (
                      <ul className="space-y-1.5 font-mono text-[10px] leading-relaxed text-white/58">
                        {quality.manual_checks.map((check) => (
                          <li key={check}>- {check}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/38">
                        Nessuna verifica manuale extra segnalata
                      </div>
                    )}
                  </div>

                  <p className="border-t border-white/10 pt-3 text-xs leading-relaxed text-white/62">
                    {recommendation?.recommendation_reason}
                  </p>
                </div>
              </DossierBlock>

              <DossierBlock title="Fit commerciale">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 font-mono text-[10px] text-white/55">
                    <span>Profilo</span>
                    <span className="text-right text-white/75">{fit?.profile_name || "-"}</span>
                    <span>Etichetta fit</span>
                    <span className="text-right text-white/75">{fit?.label.replaceAll("_", " ") || "-"}</span>
                    <span>Azione</span>
                    <span className="text-right text-white/75">
                      {fit?.recommended_action.replaceAll("_", " ") || "-"}
                    </span>
                    <span>Max profilo</span>
                    <span className="text-right text-white/75">
                      {fmtNumber(deliveryConfig.max_area_mq)} mq / {fmtNumber(deliveryConfig.max_kwp)} kWp
                    </span>
                  </div>
                  <p className="border-t border-white/10 pt-3 text-xs leading-relaxed text-white/62">
                    {fit?.reason}
                  </p>
                </div>
              </DossierBlock>

              {latestAnalysis?.notes ? (
                <DossierBlock title="Note">
                  <p className="text-sm leading-relaxed text-white/72">{latestAnalysis.notes}</p>
                </DossierBlock>
              ) : null}

              <DossierBlock title="B. Contesto industriale">
                <div className="grid grid-cols-2 gap-2 font-mono text-[10px] text-white/55">
                  <span>Azienda / asset</span>
                  <span className="text-right text-white/75">{asset.name || `OSM ${asset.osm_id}`}</span>
                  <span>Tipo edificio</span>
                  <span className="text-right text-white/75">{label(asset.building_type)}</span>
                  <span>Indirizzo</span>
                  <span className="text-right text-white/75">{label(asset.address)}</span>
                  <span>Metadati</span>
                  <span className="text-right text-white/75">{entries.length ? "disponibili" : "mancanti"}</span>
                </div>
              </DossierBlock>

              <DossierBlock title="Company match">
                <div className="space-y-3">
                  {companyMatch && companyMatch.match_confidence !== "none" ? (
                    <div className="grid grid-cols-2 gap-2 font-mono text-[10px] text-white/55">
                      <span>Azienda</span>
                      <span className="text-right text-white/78">{label(companyMatch.company_name)}</span>
                      <span>Indirizzo</span>
                      <span className="text-right text-white/78">{label(companyMatch.address)}</span>
                      <span>Website</span>
                      <span className="truncate text-right text-white/78">{label(companyMatch.website)}</span>
                      <span>Categoria</span>
                      <span className="text-right text-white/78">{label(companyMatch.category)}</span>
                      <span>Fonte</span>
                      <span className="text-right text-white/78">{companyMatch.source}</span>
                      <span>Confidenza</span>
                      <span className={`text-right ${confidenceClass(companyMatch.match_confidence)}`}>
                        {companyMatch.match_confidence} / {companyMatch.match_score}
                      </span>
                      <span>Distanza</span>
                      <span className="text-right text-white/78">
                        {companyMatch.distance_meters !== null ? `${Math.round(companyMatch.distance_meters)} m` : "-"}
                      </span>
                    </div>
                  ) : (
                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
                      Nessun company match affidabile trovato
                    </div>
                  )}

                  {companyMatch?.match_reason ? (
                    <p className="border-t border-white/10 pt-3 text-xs leading-relaxed text-white/62">
                      {companyMatch.match_reason}
                    </p>
                  ) : null}

                  {companyMatchError ? (
                    <div className="border border-red-400/30 bg-red-950/35 p-2 font-mono text-[10px] text-red-100">
                      {companyMatchError}
                    </div>
                  ) : null}

                  <button
                    onClick={() => onCompanyMatch(asset.id)}
                    disabled={companyMatchLoading}
                    className="w-full border border-tiloca-green/30 bg-tiloca-green/10 px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.16em] text-tiloca-green transition hover:bg-tiloca-green/15 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {companyMatchLoading ? "Ricerca company match..." : "Trova company match"}
                  </button>
                </div>
              </DossierBlock>

              <DossierBlock title="Ultima scansione">
                <div className="grid grid-cols-2 gap-2 font-mono text-[10px] text-white/55">
                  <span>Scan ID</span>
                  <span className="text-right text-white/75">{latestAnalysis?.scan_id ?? "-"}</span>
                  <span>Pannelli rilevati</span>
                  <span className="text-right text-white/75">{latestAnalysis?.has_panels ? "sì" : "no"}</span>
                  <span>Qualità tetto</span>
                  <span className="text-right text-white/75">{label(latestAnalysis?.roof_quality)}</span>
                  <span>Orientamento</span>
                  <span className="text-right text-white/75">{label(latestAnalysis?.orientation)}</span>
                  <span>Ostacoli</span>
                  <span className="text-right text-white/75">{label(latestAnalysis?.obstacles)}</span>
                </div>
              </DossierBlock>

              <DossierBlock title="C. Prossima azione">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 font-mono text-[10px] text-white/55">
                    <span>Stato</span>
                    <span className="text-right text-white/75">{readiness.replace("_", " ")}</span>
                    <span>Azione suggerita</span>
                    <span className="text-right text-white/75">
                      {recommendation?.recommended_state
                        ? recommendation.recommended_state.replaceAll("_", " ")
                        : readiness === "report_ready"
                        ? "includi nel report"
                        : readiness === "excluded"
                          ? "mantieni escluso"
                          : score >= 75
                            ? "valida per report"
                            : "verifica manualmente"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <StateButton
                      label="Marca qualificata"
                      active={readiness === "qualified"}
                      onClick={() => onStateChange(asset.id, "qualified")}
                    />
                    <StateButton
                      label="Marca pronta per report"
                      active={readiness === "report_ready"}
                      onClick={() => onStateChange(asset.id, "report_ready")}
                    />
                    <StateButton
                      label="Escludi"
                      danger
                      active={readiness === "excluded"}
                      onClick={() => onStateChange(asset.id, "excluded")}
                    />
                  </div>
                  <p className="font-mono text-[10px] leading-relaxed text-white/35">
                    Lo stato shortlist è salvato nel database Tiloca per revisione interna.
                  </p>
                </div>
              </DossierBlock>

              <DossierBlock title="Checklist verifica manuale">
                <div className="space-y-1.5">
                  {[
                    ["company", "nome azienda verificato"],
                    ["address", "indirizzo verificato"],
                    ["geometry", "geometria tetto plausibile"],
                    ["pv_absence", "assenza FV confermata"],
                    ["industrial_activity", "attività industriale plausibile"],
                    ["client_report", "pronto per report cliente"],
                  ].map(([key, text]) => (
                    <button
                      key={key}
                      onClick={() => toggleVerification(key)}
                      className={`flex w-full items-center justify-between border px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.12em] transition ${
                        verification[key]
                          ? "border-tiloca-green/35 bg-tiloca-green/10 text-tiloca-green"
                          : "border-white/10 bg-white/[0.035] text-white/48 hover:border-white/20"
                      }`}
                    >
                      <span>{text}</span>
                      <span>{verification[key] ? "fatto" : "aperto"}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-3 font-mono text-[10px] leading-relaxed text-white/32">
                  La checklist è locale per questa sessione; lo stato report resta il controllo persistente.
                </p>
              </DossierBlock>

              {asset.address ? (
                <DossierBlock title="Indirizzo">
                  <p className="text-sm leading-relaxed text-white/70">{asset.address}</p>
                </DossierBlock>
              ) : null}

              <DossierBlock title="Metadati industriali">
                {entries.length ? (
                  <div className="overflow-hidden border border-white/10">
                    {entries.map(([key, value]) => (
                      <div
                        key={key}
                        className="grid grid-cols-[130px_1fr] border-b border-white/5 bg-white/[0.035] last:border-b-0"
                      >
                        <div className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-white/30">
                          {key}
                        </div>
                        <div className="px-3 py-2 text-xs text-white/68">{value}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
                    Nessun metadato salvato
                  </div>
                )}
              </DossierBlock>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function StateButton({
  label,
  active,
  danger = false,
  onClick,
}: {
  label: string;
  active: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full border px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.16em] transition ${
        active
          ? danger
            ? "border-red-400/40 bg-red-500/12 text-red-300"
            : "border-tiloca-green/40 bg-tiloca-green/12 text-tiloca-green"
          : "border-white/10 bg-white/[0.04] text-white/58 hover:border-white/20 hover:text-white/78"
      }`}
    >
      {label}
    </button>
  );
}

function Badge({ value, accent = false }: { value: string; accent?: boolean }) {
  return (
    <span
      className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] backdrop-blur-md ${
        accent
          ? "border-tiloca-green/40 bg-tiloca-green/15 text-tiloca-green"
          : "border-white/20 bg-[#080f1a]/72 text-white/80"
      }`}
    >
      {value}
    </span>
  );
}

function DossierBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="field-shell p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
        {title}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Metric({
  label,
  value,
  valueClass = "text-white/85",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-[#0b1422] px-3 py-3">
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/30">
        {label}
      </div>
      <div className={`mt-1 font-mono text-[13px] ${valueClass}`}>{value}</div>
    </div>
  );
}
