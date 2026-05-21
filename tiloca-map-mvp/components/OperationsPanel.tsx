"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AssetPanel } from "@/components/AssetPanel";
import { LeftControls } from "@/components/LeftControls";
import { MapCanvas } from "@/components/MapCanvas";
import {
  getAsset,
  getAssets,
  getTerritories,
  matchCompany,
  triggerCompanyFirstScan,
  triggerOpenApiCompanyScan,
  triggerScan,
  updateAssetState,
} from "@/lib/api";
import {
  commercialFit,
  dataQuality,
  opportunityScore,
  qualificationRecommendation,
  reportState,
  scoreComponents,
  scoreLabel,
} from "@/lib/opportunity";
import type {
  Asset,
  AssetDetail,
  CompanyFirstScanResponse,
  DeliveryProjectConfig,
  DeliveryQuickFilter,
  OpenApiCompanyScanResponse,
  PipelineState,
  RankedAsset,
  ReportState,
  ScanResponse,
  ScanStatus,
  ShortlistFilter,
  SortMode,
  Suitability,
  Territory,
} from "@/lib/types";

function applyLocalFilters(
  items: Asset[],
  minArea: number,
  minKwp: number,
  maxArea: number,
  maxKwp: number,
  pipelineState: PipelineState,
  shortlistFilter: ShortlistFilter
): Asset[] {
  return items.filter((asset) => {
    if (minArea && asset.area_mq < minArea) return false;
    if (minKwp && (asset.estimated_kwp || 0) < minKwp) return false;
    if (maxArea && asset.area_mq > maxArea) return false;
    if (maxKwp && (asset.estimated_kwp || 0) > maxKwp) return false;
    if (pipelineState && reportState(asset) !== pipelineState) return false;
    if (shortlistFilter !== "all" && reportState(asset) !== shortlistFilter) return false;
    return true;
  });
}

function rankAssets(items: Asset[], sortMode: SortMode, profile: DeliveryProjectConfig): RankedAsset[] {
  const fitPriority = (asset: Asset): number => {
    const fit = commercialFit(asset, profile);
    if (fit.label === "ideal_sme_ci") return 0;
    if (fit.label === "low_confidence_review") return 1;
    if (fit.label === "large_enterprise_review") return 2;
    return 3;
  };

  return [...items]
    .sort((a, b) => {
      const fitDelta = fitPriority(a) - fitPriority(b);
      if (fitDelta !== 0) return fitDelta;
      if (sortMode === "opportunity_score") {
        const scoreDelta = opportunityScore(b) - opportunityScore(a);
        if (scoreDelta !== 0) return scoreDelta;
      }
      const kwpDelta = (b.estimated_kwp || 0) - (a.estimated_kwp || 0);
      if (kwpDelta !== 0) return kwpDelta;
      return b.area_mq - a.area_mq;
    })
    .map((asset, index) => {
      const score = opportunityScore(asset);
      const recommendation = qualificationRecommendation(asset);
      return {
        ...asset,
        rank: index + 1,
        opportunity_score: score,
        score_label: scoreLabel(score),
        score_components: scoreComponents(asset),
        report_state: reportState(asset),
        data_quality: dataQuality(asset),
        recommended_state: recommendation.recommended_state,
        recommendation_reason: recommendation.recommendation_reason,
        commercial_fit: commercialFit(asset, profile),
      };
    });
}

function applyDeliveryFilters(
  items: RankedAsset[],
  config: DeliveryProjectConfig,
  quickFilter: DeliveryQuickFilter
): RankedAsset[] {
  return items.filter((asset) => {
    const estimatedKwp = asset.estimated_kwp || 0;
    const suitability = asset.suitability || "";
    if (asset.area_mq < config.min_area_mq) return false;
    if (estimatedKwp < config.min_kwp) return false;
    if (config.max_area_mq && asset.area_mq > config.max_area_mq) return false;
    if (config.max_kwp && estimatedKwp > config.max_kwp) return false;
    if (!config.accepted_suitability.includes(suitability as "alta" | "media" | "bassa")) return false;

    if (quickFilter === "needs_review") {
      return asset.report_state === "needs_review" || asset.recommended_state === "needs_review";
    }
    if (quickFilter === "qualified") return asset.report_state === "qualified";
    if (quickFilter === "report_ready") return asset.report_state === "report_ready";
    if (quickFilter === "high_confidence") return asset.data_quality.confidence === "high";
    if (quickFilter === "missing_company_address") {
      return (
        asset.data_quality.warnings.includes("missing_company_name") ||
        asset.data_quality.warnings.includes("missing_address")
      );
    }
    if (quickFilter === "suspicious_geometry") {
      return (
        asset.data_quality.warnings.includes("oversized_area") ||
        asset.data_quality.warnings.includes("unusually_high_kwp") ||
        asset.data_quality.warnings.includes("needs_manual_geometry_check")
      );
    }
    return true;
  });
}

function reviewQueueRank(items: RankedAsset[]): RankedAsset[] {
  const priority = (asset: RankedAsset): number => {
    if (asset.report_state === "needs_review" || asset.recommended_state === "needs_review") return 0;
    if (asset.report_state === "qualified" || asset.recommended_state === "qualified") return 1;
    if (asset.data_quality.confidence === "low") return 2;
    if (asset.report_state === "report_ready") return 3;
    if (asset.report_state === "excluded") return 5;
    return 4;
  };

  return [...items].sort((a, b) => {
    const priorityDelta = priority(a) - priority(b);
    if (priorityDelta !== 0) return priorityDelta;
    return b.opportunity_score - a.opportunity_score;
  });
}

function fmtNumber(value: number): string {
  return new Intl.NumberFormat("it-IT").format(value);
}

function sumBy(items: RankedAsset[], getValue: (asset: RankedAsset) => number): number {
  return items.reduce((total, asset) => total + getValue(asset), 0);
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function googleMapsUrl(asset: Asset): string {
  return `https://www.google.com/maps?q=${asset.lat},${asset.lon}`;
}

function matchedCompanyName(asset: Asset): string {
  return asset.company_match?.company_name || "";
}

function matchedCompanyAddress(asset: Asset): string {
  return asset.company_match?.address || "";
}

function assetMetadataValue(asset: Asset, key: string): string {
  const value = asset.industrial_metadata?.[key];
  return value === null || value === undefined ? "" : String(value);
}

function assetSource(asset: Asset): string {
  return assetMetadataValue(asset, "source") || "roof_first";
}

export function OperationsPanel() {
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [territory, setTerritory] = useState("parma");
  const [suitability, setSuitability] = useState<Suitability>("");
  const [minArea, setMinArea] = useState(0);
  const [minKwp, setMinKwp] = useState(300);
  const [maxArea, setMaxArea] = useState(30000);
  const [maxKwp, setMaxKwp] = useState(2500);
  const [pipelineState, setPipelineState] = useState<PipelineState>("");
  const [shortlistFilter, setShortlistFilter] = useState<ShortlistFilter>("all");
  const [scanSize, setScanSize] = useState(10);
  const [targetOpportunities, setTargetOpportunities] = useState(30);
  const [sortMode, setSortMode] = useState<SortMode>("opportunity_score");
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryProjectConfig>({
    profile_name: "IM-EL / Riccardo",
    client_name: "IM-EL / Riccardo",
    target_provinces: "Torino, Cuneo",
    target_opportunity_count: 30,
    min_area_mq: 2000,
    min_kwp: 300,
    max_area_mq: 30000,
    max_kwp: 2500,
    accepted_suitability: ["alta", "media"],
  });
  const [deliveryQuickFilter, setDeliveryQuickFilter] = useState<DeliveryQuickFilter>("all");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AssetDetail | null>(null);
  const [assetLoading, setAssetLoading] = useState(false);
  const [assetError, setAssetError] = useState<string | undefined>();
  const [companyMatchLoading, setCompanyMatchLoading] = useState(false);
  const [companyMatchError, setCompanyMatchError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus>("IDLE");
  const [scanMessage, setScanMessage] = useState<string | undefined>();
  const [lastScan, setLastScan] = useState<ScanResponse | null>(null);
  const [lastCompanyFirstScan, setLastCompanyFirstScan] = useState<CompanyFirstScanResponse | null>(null);
  const [lastOpenApiCompanyScan, setLastOpenApiCompanyScan] = useState<OpenApiCompanyScanResponse | null>(null);
  const [openApiAtecoCode, setOpenApiAtecoCode] = useState("");
  const [openApiMinEmployees, setOpenApiMinEmployees] = useState(5);
  const [openApiMaxEmployees, setOpenApiMaxEmployees] = useState(80);
  const [openApiLimit, setOpenApiLimit] = useState(10);
  const [lastApiAssetCount, setLastApiAssetCount] = useState(0);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);

  const selectedTerritory = useMemo(
    () => territories.find((item) => item.slug === territory) || null,
    [territories, territory]
  );

  const rankedAssets = useMemo<RankedAsset[]>(() => {
    return rankAssets(
      applyLocalFilters(assets, minArea, minKwp, maxArea, maxKwp, pipelineState, shortlistFilter),
      sortMode,
      deliveryConfig
    );
  }, [assets, minArea, minKwp, maxArea, maxKwp, pipelineState, shortlistFilter, sortMode, deliveryConfig]);

  const visibleAssets = useMemo<RankedAsset[]>(() => {
    return applyDeliveryFilters(rankedAssets, deliveryConfig, deliveryQuickFilter).map((asset, index) => ({
      ...asset,
      rank: index + 1,
    }));
  }, [deliveryConfig, deliveryQuickFilter, rankedAssets]);

  const reviewQueueAssets = useMemo(() => reviewQueueRank(visibleAssets), [visibleAssets]);

  const qualifiedCount = useMemo(() => {
    return visibleAssets.filter(
      (asset) => asset.report_state !== "excluded" && asset.opportunity_score >= 52
    ).length;
  }, [visibleAssets]);

  const selectedAssetRank = useMemo(() => {
    return visibleAssets.find((asset) => asset.id === selectedAssetId)?.rank ?? null;
  }, [selectedAssetId, visibleAssets]);

  const filterSummary = useMemo(() => {
    const filters = [`territory=${territory || "all"}`];
    if (suitability) filters.push(`suitability=${suitability}`);
    if (minArea) filters.push(`min_area>=${minArea}`);
    if (minKwp) filters.push(`min_kwp>=${minKwp}`);
    if (maxArea) filters.push(`max_area<=${maxArea}`);
    if (maxKwp) filters.push(`max_kwp<=${maxKwp}`);
    if (pipelineState) filters.push(`state=${pipelineState}`);
    if (shortlistFilter !== "all") filters.push(`shortlist=${shortlistFilter}`);
    filters.push(`client=${deliveryConfig.client_name}`);
    filters.push(`delivery=${deliveryQuickFilter}`);
    filters.push(`min_kwp>=${deliveryConfig.min_kwp}`);
    filters.push(`max_kwp<=${deliveryConfig.max_kwp}`);
    return filters;
  }, [territory, suitability, minArea, minKwp, maxArea, maxKwp, pipelineState, shortlistFilter, deliveryConfig, deliveryQuickFilter]);

  const deliveryProgress = useMemo(() => {
    const qualified = visibleAssets.filter((asset) => asset.report_state === "qualified").length;
    const reportReady = visibleAssets.filter((asset) => asset.report_state === "report_ready").length;
    const needsReview = visibleAssets.filter(
      (asset) => asset.report_state === "needs_review" || asset.recommended_state === "needs_review"
    ).length;
    const excluded = rankedAssets.filter((asset) => asset.report_state === "excluded").length;
    return {
      target: deliveryConfig.target_opportunity_count,
      qualified,
      report_ready: reportReady,
      needs_review: needsReview,
      excluded,
      remaining: Math.max(0, deliveryConfig.target_opportunity_count - reportReady),
    };
  }, [deliveryConfig.target_opportunity_count, rankedAssets, visibleAssets]);

  const visibleTelemetry = useMemo(() => {
    const totalKwp = sumBy(visibleAssets, (asset) => asset.estimated_kwp || 0);
    const totalArea = sumBy(visibleAssets, (asset) => asset.area_mq);
    const highSuitabilityCount = visibleAssets.filter((asset) => asset.suitability === "alta").length;
    return {
      totalKwp,
      totalMwp: totalKwp / 1000,
      totalArea,
      highSuitabilityCount,
      averageKwp: visibleAssets.length ? Math.round(totalKwp / visibleAssets.length) : 0,
    };
  }, [visibleAssets]);

  const noAssetsReason = useMemo(() => {
    if (loading || visibleAssets.length) return undefined;
    if (!assets.length) {
      return `API returned ${lastApiAssetCount} assets for current territory/suitability. Analyze more candidate roofs or change territory.`;
    }
    return `No assets match current filters: ${filterSummary.join(" / ")}. Lower minimum area/kWp, relax delivery filters, or analyze more candidate roofs.`;
  }, [assets.length, filterSummary, lastApiAssetCount, loading, visibleAssets.length]);

  const loadTerritories = useCallback(async () => {
    const data = await getTerritories();
    setTerritories(data);
    if (!data.find((item) => item.slug === territory) && data[0]) {
      setTerritory(data[0].slug);
    }
  }, [territory]);

  const loadAssets = useCallback(async (): Promise<Asset[]> => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getAssets({
        territory,
        suitability,
        minAreaMq: minArea,
        minKwp,
        maxAreaMq: maxArea,
        maxKwp,
        limit: 500,
      });
      setAssets(data);
      setLastApiAssetCount(data.length);
      setLastRefreshAt(new Date().toLocaleTimeString("it-IT"));
      return data;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load assets");
      throw error;
    } finally {
      setLoading(false);
    }
  }, [territory, suitability, minArea, minKwp, maxArea, maxKwp]);

  useEffect(() => {
    loadTerritories().catch((error) => {
      setLoadError(error instanceof Error ? error.message : "Unable to load territories");
    });
  }, [loadTerritories]);

  useEffect(() => {
    loadAssets().catch(() => undefined);
  }, [loadAssets]);

  useEffect(() => {
    if (!selectedAssetId) {
      setSelectedAsset(null);
      return;
    }

    setAssetLoading(true);
    setAssetError(undefined);
    getAsset(selectedAssetId)
      .then(setSelectedAsset)
      .catch((error) => {
        setAssetError(error instanceof Error ? error.message : "Unable to load asset");
      })
      .finally(() => setAssetLoading(false));
  }, [selectedAssetId]);

  const handleScan = useCallback(async () => {
    if (!territory) return;
    setScanStatus("RUNNING");
    setScanMessage(`Analyzing top ${scanSize} candidate roofs in ${territory}`);
    try {
      const result = await triggerScan(territory, scanSize, {
        minAreaMq: deliveryConfig.min_area_mq || minArea,
        minKwp: deliveryConfig.min_kwp || minKwp,
        maxAreaMq: deliveryConfig.max_area_mq || maxArea,
        maxKwp: deliveryConfig.max_kwp || maxKwp,
        suitabilityLevels: deliveryConfig.accepted_suitability,
      });
      setLastScan(result);
      const refreshedAssets = await loadAssets();
      const visibleAfterRefresh = rankAssets(
        applyLocalFilters(refreshedAssets, minArea, minKwp, maxArea, maxKwp, pipelineState, shortlistFilter),
        sortMode,
        deliveryConfig
      );
      if (visibleAfterRefresh.length && !selectedAssetId) {
        setSelectedAssetId(visibleAfterRefresh[0].id);
      }

      setScanStatus(result.status === "completed" ? "COMPLETED" : "FAILED");
      setScanMessage(
        `Territory candidates: ${result.osm_candidates_count} / Candidate roofs analyzed: ${result.analyzed_count} / Accepted / updated assets: ${result.persisted_count} / Visible after filters: ${visibleAfterRefresh.length}`
      );
    } catch (error) {
      setScanStatus("FAILED");
      setScanMessage(error instanceof Error ? error.message : "Scan failed");
    }
  }, [territory, scanSize, loadAssets, minArea, minKwp, maxArea, maxKwp, pipelineState, shortlistFilter, selectedAssetId, sortMode, deliveryConfig]);

  const handleCompanyFirstScan = useCallback(async () => {
    if (!territory) return;
    setScanStatus("RUNNING");
    setScanMessage(`Company-first scan in ${territory}: Google Places companies -> satellite roof validation`);
    try {
      const result = await triggerCompanyFirstScan("imel", {
        province: territory,
        maxPlaces: Math.min(scanSize * 5, 100),
        maxResults: scanSize,
        minAreaMq: deliveryConfig.min_area_mq || minArea,
        maxAreaMq: deliveryConfig.max_area_mq || maxArea,
        minKwp: deliveryConfig.min_kwp || minKwp,
        maxKwp: deliveryConfig.max_kwp || maxKwp,
      });
      setLastCompanyFirstScan(result);
      const refreshedAssets = await loadAssets();
      const visibleAfterRefresh = rankAssets(
        applyLocalFilters(refreshedAssets, minArea, minKwp, maxArea, maxKwp, pipelineState, shortlistFilter),
        sortMode,
        deliveryConfig
      );
      if (visibleAfterRefresh.length && !selectedAssetId) {
        setSelectedAssetId(visibleAfterRefresh[0].id);
      }
      setScanStatus(result.status === "completed" ? "COMPLETED" : "FAILED");
      setScanMessage(
        `Companies found: ${result.companies_found} / After blacklist-dedup: ${result.after_blacklist_dedup} / Roofs analyzed: ${result.roofs_analyzed} / Accepted opportunities: ${result.accepted_opportunities}`
      );
    } catch (error) {
      setScanStatus("FAILED");
      setScanMessage(error instanceof Error ? error.message : "Company-first scan failed");
    }
  }, [
    territory,
    scanSize,
    deliveryConfig,
    minArea,
    maxArea,
    minKwp,
    maxKwp,
    loadAssets,
    pipelineState,
    shortlistFilter,
    selectedAssetId,
    sortMode,
  ]);

  const handleOpenApiCompanyScan = useCallback(async () => {
    if (!territory) return;
    setScanStatus("RUNNING");
    setScanMessage(`OpenAPI company-led scan in ${territory}: companies -> nearby roof validation`);
    try {
      const result = await triggerOpenApiCompanyScan({
        province: territory,
        atecoCode: openApiAtecoCode.trim() || undefined,
        minEmployees: openApiMinEmployees || undefined,
        maxEmployees: openApiMaxEmployees || undefined,
        minAreaMq: deliveryConfig.min_area_mq || minArea,
        maxAreaMq: deliveryConfig.max_area_mq || maxArea,
        minKwp: deliveryConfig.min_kwp || minKwp,
        maxKwp: deliveryConfig.max_kwp || maxKwp,
        limit: openApiLimit,
        dryRun: false,
      });
      setLastOpenApiCompanyScan(result);
      await loadAssets();
      setScanStatus(result.status === "completed" ? "COMPLETED" : result.status === "dry_run" ? "COMPLETED" : "FAILED");
      setScanMessage(
        `OpenAPI companies: ${result.companies_found} / With coordinates: ${result.companies_with_coordinates} / Roofs analyzed: ${result.roofs_analyzed} / Accepted opportunities: ${result.accepted_opportunities}`
      );
    } catch (error) {
      setScanStatus("FAILED");
      setScanMessage(error instanceof Error ? error.message : "OpenAPI company scan failed");
    }
  }, [
    territory,
    openApiAtecoCode,
    openApiMinEmployees,
    openApiMaxEmployees,
    deliveryConfig,
    minArea,
    maxArea,
    minKwp,
    maxKwp,
    openApiLimit,
    loadAssets,
  ]);

  const handleStateChange = useCallback(
    async (assetId: number, state: ReportState) => {
      setAssetLoading(true);
      setAssetError(undefined);
      try {
        const updated = await updateAssetState(assetId, state, "Operator shortlist update");
        setSelectedAsset(updated);
        await loadAssets();
      } catch (error) {
        setAssetError(error instanceof Error ? error.message : "Unable to update asset state");
      } finally {
        setAssetLoading(false);
      }
    },
    [loadAssets]
  );

  const handleExportCsv = useCallback(async () => {
    const exportAssets =
      visibleAssets.some((asset) => asset.report_state === "report_ready")
        ? visibleAssets.filter((asset) => asset.report_state === "report_ready")
        : visibleAssets;

    const details = await Promise.all(exportAssets.map((asset) => getAsset(asset.id)));
    const detailsById = new Map(details.map((asset) => [asset.id, asset]));

    const headers = [
      "rank",
      "opportunity_score",
      "score_label",
      "data_quality_confidence",
        "data_quality_warnings",
        "recommendation",
        "recommendation_reason",
        "profile_name",
        "source",
        "commercial_fit_label",
        "commercial_fit_reason",
        "max_area_filter",
        "max_kwp_filter",
        "matched_company_name",
        "company_name",
        "matched_company_address",
        "company_address",
        "matched_company_website",
        "company_website",
        "phone",
        "place_id",
        "vat_or_tax_code",
        "ateco",
        "employees",
        "turnover",
        "pec",
        "company_match_confidence",
        "company_match_score",
        "company_match_source",
        "company_match_reason",
        "osm_id",
        "osm_name",
        "osm_address",
        "name_or_osm_id",
      "territory",
      "address",
      "lat",
      "lon",
      "area_mq",
      "estimated_kwp",
      "roof_type",
      "roof_quality",
      "obstacles",
      "panels_detected",
      "suitability",
      "report_state",
      "notes",
      "google_maps_url",
    ];

    const rows = exportAssets.map((asset) => {
      const detail = detailsById.get(asset.id);
      const latest = detail?.analyses?.[0];
      return [
        asset.rank,
        asset.opportunity_score,
        asset.score_label,
        asset.data_quality.confidence,
        asset.data_quality.warnings.join("|"),
        asset.recommended_state,
        asset.recommendation_reason,
        asset.commercial_fit.profile_name,
        assetSource(asset),
        asset.commercial_fit.label,
        asset.commercial_fit.reason,
        deliveryConfig.max_area_mq,
        deliveryConfig.max_kwp,
        matchedCompanyName(asset),
        matchedCompanyName(asset) || asset.name || assetMetadataValue(asset, "company_name"),
        matchedCompanyAddress(asset),
        matchedCompanyAddress(asset) || asset.address || assetMetadataValue(asset, "address"),
        asset.company_match?.website || "",
        asset.company_match?.website || assetMetadataValue(asset, "website"),
        assetMetadataValue(asset, "phone"),
        assetMetadataValue(asset, "place_id"),
        assetMetadataValue(asset, "vat_or_tax_code"),
        assetMetadataValue(asset, "ateco"),
        assetMetadataValue(asset, "employees"),
        assetMetadataValue(asset, "turnover"),
        assetMetadataValue(asset, "pec"),
        asset.company_match?.match_confidence || "none",
        asset.company_match?.match_score ?? 0,
        asset.company_match?.source || "",
        asset.company_match?.match_reason || "",
        asset.osm_id,
        asset.name || "",
        asset.address || "",
        matchedCompanyName(asset) || asset.name || `OSM ${asset.osm_id}`,
        territory,
        detail?.address || asset.address || "",
        asset.lat,
        asset.lon,
        asset.area_mq,
        asset.estimated_kwp || "",
        asset.roof_type || latest?.roof_type || "",
        latest?.roof_quality || "",
        latest?.obstacles || "",
        latest?.has_panels ? "yes" : "no",
        asset.suitability || latest?.suitability || "",
        asset.report_state,
        latest?.notes || "",
        googleMapsUrl(asset),
      ].map(csvEscape).join(",");
    });

    const csv = [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tiloca-${territory || "territory"}-shortlist.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [deliveryConfig, territory, visibleAssets]);

  const handleExportReportReadyCsv = useCallback(async () => {
    const exportAssets = visibleAssets.filter((asset) => asset.report_state === "report_ready");
    const details = await Promise.all(exportAssets.map((asset) => getAsset(asset.id)));
    const detailsById = new Map(details.map((asset) => [asset.id, asset]));

    const headers = [
      "rank",
      "opportunity_score",
      "data_quality_confidence",
      "data_quality_warnings",
      "recommendation",
      "profile_name",
      "source",
      "commercial_fit_label",
      "commercial_fit_reason",
      "max_area_filter",
      "max_kwp_filter",
      "matched_company_name",
      "company_name",
      "matched_company_address",
      "company_address",
      "matched_company_website",
      "company_website",
      "phone",
      "place_id",
      "vat_or_tax_code",
      "ateco",
      "employees",
      "turnover",
      "pec",
      "company_match_confidence",
      "company_match_score",
      "company_match_source",
      "company_match_reason",
      "osm_id",
      "osm_name",
      "osm_address",
      "name_or_osm_id",
      "province_or_territory",
      "address",
      "lat",
      "lon",
      "area_mq",
      "estimated_kwp",
      "roof_type",
      "roof_quality",
      "obstacles",
      "panels_detected",
      "suitability",
      "notes",
      "google_maps_url",
    ];

    const rows = exportAssets.map((asset) => {
      const detail = detailsById.get(asset.id);
      const latest = detail?.analyses?.[0];
      return [
        asset.rank,
        asset.opportunity_score,
        asset.data_quality.confidence,
        asset.data_quality.warnings.join("|"),
        asset.recommended_state,
        asset.commercial_fit.profile_name,
        assetSource(asset),
        asset.commercial_fit.label,
        asset.commercial_fit.reason,
        deliveryConfig.max_area_mq,
        deliveryConfig.max_kwp,
        matchedCompanyName(asset),
        matchedCompanyName(asset) || asset.name || assetMetadataValue(asset, "company_name"),
        matchedCompanyAddress(asset),
        matchedCompanyAddress(asset) || asset.address || assetMetadataValue(asset, "address"),
        asset.company_match?.website || "",
        asset.company_match?.website || assetMetadataValue(asset, "website"),
        assetMetadataValue(asset, "phone"),
        assetMetadataValue(asset, "place_id"),
        assetMetadataValue(asset, "vat_or_tax_code"),
        assetMetadataValue(asset, "ateco"),
        assetMetadataValue(asset, "employees"),
        assetMetadataValue(asset, "turnover"),
        assetMetadataValue(asset, "pec"),
        asset.company_match?.match_confidence || "none",
        asset.company_match?.match_score ?? 0,
        asset.company_match?.source || "",
        asset.company_match?.match_reason || "",
        asset.osm_id,
        asset.name || "",
        asset.address || "",
        matchedCompanyName(asset) || asset.name || `OSM ${asset.osm_id}`,
        territory,
        detail?.address || asset.address || "",
        asset.lat,
        asset.lon,
        asset.area_mq,
        asset.estimated_kwp || "",
        asset.roof_type || latest?.roof_type || "",
        latest?.roof_quality || "",
        latest?.obstacles || "",
        latest?.has_panels ? "yes" : "no",
        asset.suitability || latest?.suitability || "",
        latest?.notes || "",
        googleMapsUrl(asset),
      ].map(csvEscape).join(",");
    });

    const csv = [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tiloca-${deliveryConfig.client_name || "client"}-report-ready.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [deliveryConfig, territory, visibleAssets]);

  const handleCompanyMatch = useCallback(
    async (assetId: number) => {
      setCompanyMatchLoading(true);
      setCompanyMatchError(undefined);
      try {
        const match = await matchCompany(assetId);
        if (match.match_confidence === "none") {
          await updateAssetState(assetId, "needs_review", "No reliable company match found");
        }
        const updated = await getAsset(assetId);
        setSelectedAsset(updated);
        await loadAssets();
      } catch (error) {
        setCompanyMatchError(error instanceof Error ? error.message : "Unable to match company");
      } finally {
        setCompanyMatchLoading(false);
      }
    },
    [loadAssets]
  );

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#080f1a]">
      <MapCanvas
        assets={visibleAssets}
        selectedAssetId={selectedAssetId}
        selectedTerritory={selectedTerritory}
        onAssetSelect={setSelectedAssetId}
      />

      <TopTelemetry
        territory={territory}
        apiAssetCount={lastApiAssetCount}
        visibleAssetCount={visibleAssets.length}
        qualifiedCount={qualifiedCount}
        targetOpportunities={deliveryConfig.target_opportunity_count}
        lastScan={lastScan}
        visibleMwp={visibleTelemetry.totalMwp}
        loading={loading}
      />

      <BottomTelemetry
        totalArea={visibleTelemetry.totalArea}
        highSuitabilityCount={visibleTelemetry.highSuitabilityCount}
        averageKwp={visibleTelemetry.averageKwp}
        lastRefreshAt={lastRefreshAt}
      />

      {loadError ? (
        <div className="fixed left-[320px] top-24 z-10 max-w-md border border-red-400/30 bg-red-950/70 px-3 py-2 font-mono text-xs text-red-100">
          {loadError}
        </div>
      ) : null}

      <LeftControls
        territories={territories}
        territory={territory}
        suitability={suitability}
        minArea={minArea}
        minKwp={minKwp}
        maxArea={maxArea}
        maxKwp={maxKwp}
        pipelineState={pipelineState}
        shortlistFilter={shortlistFilter}
        scanSize={scanSize}
        targetOpportunities={targetOpportunities}
        sortMode={sortMode}
        deliveryConfig={deliveryConfig}
        deliveryProgress={deliveryProgress}
        deliveryQuickFilter={deliveryQuickFilter}
        scanStatus={scanStatus}
        scanMessage={scanMessage}
        apiAssetCount={lastApiAssetCount}
        visibleAssetCount={visibleAssets.length}
        assets={reviewQueueAssets}
        selectedAssetId={selectedAssetId}
        filterSummary={filterSummary}
        noAssetsReason={noAssetsReason}
        lastScan={lastScan}
        lastCompanyFirstScan={lastCompanyFirstScan}
        lastOpenApiCompanyScan={lastOpenApiCompanyScan}
        openApiAtecoCode={openApiAtecoCode}
        openApiMinEmployees={openApiMinEmployees}
        openApiMaxEmployees={openApiMaxEmployees}
        openApiLimit={openApiLimit}
        lastRefreshAt={lastRefreshAt}
        loading={loading}
        onTerritoryChange={(value) => {
          setTerritory(value);
          setSelectedAssetId(null);
          setSelectedAsset(null);
        }}
        onSuitabilityChange={(value) => {
          setSuitability(value);
          setSelectedAssetId(null);
          setSelectedAsset(null);
        }}
        onMinAreaChange={setMinArea}
        onMinKwpChange={setMinKwp}
        onMaxAreaChange={setMaxArea}
        onMaxKwpChange={setMaxKwp}
        onPipelineStateChange={setPipelineState}
        onShortlistFilterChange={setShortlistFilter}
        onScanSizeChange={setScanSize}
        onTargetOpportunitiesChange={setTargetOpportunities}
        onSortModeChange={setSortMode}
        onDeliveryConfigChange={(config) => {
          setDeliveryConfig(config);
          setTargetOpportunities(config.target_opportunity_count);
          setMinKwp(config.min_kwp);
          setMaxArea(config.max_area_mq);
          setMaxKwp(config.max_kwp);
        }}
        onDeliveryQuickFilterChange={setDeliveryQuickFilter}
        onOpenApiAtecoCodeChange={setOpenApiAtecoCode}
        onOpenApiMinEmployeesChange={setOpenApiMinEmployees}
        onOpenApiMaxEmployeesChange={setOpenApiMaxEmployees}
        onOpenApiLimitChange={setOpenApiLimit}
        onScan={handleScan}
        onCompanyFirstScan={handleCompanyFirstScan}
        onOpenApiCompanyScan={handleOpenApiCompanyScan}
        onRefresh={loadAssets}
        onExportCsv={handleExportCsv}
        onExportReportReadyCsv={handleExportReportReadyCsv}
        onStateChange={handleStateChange}
        onAssetSelect={setSelectedAssetId}
      />

      <AssetPanel
        asset={selectedAsset}
        rank={selectedAssetRank}
        loading={assetLoading}
        error={assetError}
        companyMatchLoading={companyMatchLoading}
        companyMatchError={companyMatchError}
        deliveryConfig={deliveryConfig}
        onCompanyMatch={handleCompanyMatch}
        onStateChange={handleStateChange}
        onClose={() => {
          setSelectedAssetId(null);
          setSelectedAsset(null);
          setAssetError(undefined);
          setCompanyMatchError(undefined);
        }}
      />
    </main>
  );
}

function TopTelemetry({
  territory,
  apiAssetCount,
  visibleAssetCount,
  qualifiedCount,
  targetOpportunities,
  lastScan,
  visibleMwp,
  loading,
}: {
  territory: string;
  apiAssetCount: number;
  visibleAssetCount: number;
  qualifiedCount: number;
  targetOpportunities: number;
  lastScan: ScanResponse | null;
  visibleMwp: number;
  loading: boolean;
}) {
  return (
    <div className="pointer-events-none fixed left-[320px] right-[430px] top-4 z-10 border border-white/10 bg-[#080f1a]/76 px-4 py-3 backdrop-blur-md">
      <div className="grid grid-cols-6 gap-4">
        <TelemetryMetric label="Territory" value={territory || "all"} />
        <TelemetryMetric label="API Assets" value={fmtNumber(apiAssetCount)} />
        <TelemetryMetric label="Visible Opps" value={fmtNumber(visibleAssetCount)} accent />
        <TelemetryMetric label="Shortlist" value={`${qualifiedCount} / ${targetOpportunities}`} accent />
        <TelemetryMetric label="Scan Flow" value={`${lastScan?.osm_candidates_count ?? "-"} / ${lastScan?.analyzed_count ?? "-"} / ${lastScan?.persisted_count ?? "-"}`} />
        <TelemetryMetric label="Visible MWp" value={visibleMwp ? visibleMwp.toFixed(2) : "-"} />
      </div>
      {loading ? (
        <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-tiloca-amber">
          Refreshing opportunity layer. Assets may include previous scans stored in the Tiloca database.
        </div>
      ) : null}
    </div>
  );
}

function BottomTelemetry({
  totalArea,
  highSuitabilityCount,
  averageKwp,
  lastRefreshAt,
}: {
  totalArea: number;
  highSuitabilityCount: number;
  averageKwp: number;
  lastRefreshAt: string | null;
}) {
  return (
    <div className="pointer-events-none fixed bottom-4 left-[320px] right-[430px] z-10 border border-white/10 bg-[#080f1a]/72 px-4 py-2 backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
        <span>Total roof area: <b className="font-semibold text-white/72">{fmtNumber(totalArea)} mq</b></span>
        <span>Alta suitability: <b className="font-semibold text-tiloca-green">{fmtNumber(highSuitabilityCount)}</b></span>
        <span>Avg capacity: <b className="font-semibold text-white/72">{averageKwp ? `${fmtNumber(averageKwp)} kWp` : "-"}</b></span>
        <span>Latest refresh: <b className="font-semibold text-white/72">{lastRefreshAt || "-"}</b></span>
      </div>
    </div>
  );
}

function TelemetryMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/32">{label}</div>
      <div className={`mt-1 font-mono text-[13px] ${accent ? "text-tiloca-green" : "text-white/76"}`}>{value}</div>
    </div>
  );
}
