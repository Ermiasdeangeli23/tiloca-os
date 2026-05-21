import type {
  Asset,
  AssetDetail,
  CommercialFit,
  DataQuality,
  DataQualityWarning,
  DeliveryProjectConfig,
  OpportunityScoreComponents,
  RecommendedState,
  ReportState,
} from "./types";

type ScorableAsset = Asset | AssetDetail;

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function latestAnalysis(asset: ScorableAsset) {
  return "analyses" in asset ? asset.analyses?.[0] : undefined;
}

function hasMeaningfulMetadata(asset: ScorableAsset): boolean {
  const metadata = asset.industrial_metadata || {};
  if (asset.company_match?.match_confidence === "high") return true;
  return Object.values(metadata).some(
    (value) => value !== null && value !== undefined && String(value).trim() !== ""
  );
}

function hasCompanyName(asset: ScorableAsset): boolean {
  if (asset.company_match?.match_confidence === "high" && asset.company_match.company_name) return true;
  return Boolean(asset.name && asset.name.trim());
}

function hasAddress(asset: ScorableAsset): boolean {
  if (asset.company_match?.match_confidence === "high" && asset.company_match.address) return true;
  return Boolean(asset.address && asset.address.trim());
}

export function reportState(asset: ScorableAsset): ReportState {
  const state = asset.pipeline_state?.state;
  if (state === "excluded") return "excluded";
  if (state === "ready_for_report") return "report_ready";
  if (state === "report_ready") return "report_ready";
  if (state === "validated") return "qualified";
  if (state === "qualified") return "qualified";
  if (state === "watchlist") return "needs_review";
  if (state === "needs_review") return "needs_review";
  return "new";
}

export function scoreComponents(asset: ScorableAsset): OpportunityScoreComponents {
  const analysis = latestAnalysis(asset);
  const capacity = asset.estimated_kwp || analysis?.estimated_kwp || 0;
  const suitability = asset.suitability || analysis?.suitability;
  const roofQuality = analysis?.roof_quality || "";
  const obstacles = analysis?.obstacles || "";
  const hasMetadata = hasCompanyName(asset) || hasAddress(asset) || hasMeaningfulMetadata(asset);

  const capacity_score = clamp(Math.round((Math.min(capacity, 12000) / 12000) * 100));
  let roof_score = suitability === "alta" ? 92 : suitability === "media" ? 66 : suitability === "bassa" ? 38 : 20;
  if (roofQuality.toLowerCase().includes("buon") || roofQuality.toLowerCase().includes("good")) roof_score += 6;
  if (obstacles && !obstacles.toLowerCase().includes("ness") && !obstacles.toLowerCase().includes("none")) roof_score -= 12;

  const pv_absence_score = analysis?.has_panels ? 15 : 95;
  let industrial_score = asset.building_type?.includes("industrial") ? 72 : 50;
  if (hasMetadata) industrial_score += 18;
  if (asset.company_match?.match_confidence === "high") industrial_score += 14;
  if (asset.company_match?.match_confidence === "medium") industrial_score += 3;

  return {
    capacity_score,
    roof_score: clamp(roof_score),
    pv_absence_score,
    industrial_score: clamp(industrial_score),
  };
}

export function dataQuality(asset: ScorableAsset): DataQuality {
  const analysis = latestAnalysis(asset);
  const capacity = asset.estimated_kwp || analysis?.estimated_kwp || 0;
  const warnings: DataQualityWarning[] = [];
  const manual_checks: string[] = [];
  const missingName = !hasCompanyName(asset);
  const missingAddress = !hasAddress(asset);
  const oversizedArea = asset.area_mq > 100000;
  const unusuallyHighKwp = capacity > 15000;
  const genericOsmAsset = missingName && Boolean(asset.osm_id);
  const lowMetadataConfidence =
    !hasMeaningfulMetadata(asset) && (missingName || missingAddress || !asset.building_type);

  if (oversizedArea) warnings.push("oversized_area");
  if (missingName) warnings.push("missing_company_name");
  if (missingAddress) warnings.push("missing_address");
  if (genericOsmAsset) warnings.push("generic_osm_asset");
  if (unusuallyHighKwp) warnings.push("unusually_high_kwp");
  if (oversizedArea || unusuallyHighKwp) warnings.push("needs_manual_geometry_check");
  if (lowMetadataConfidence) warnings.push("low_metadata_confidence");

  if (asset.company_match?.match_confidence === "high") {
    const removable = new Set<DataQualityWarning>();
    if (asset.company_match.company_name) {
      removable.add("missing_company_name");
      removable.add("generic_osm_asset");
    }
    if (asset.company_match.address) {
      removable.add("missing_address");
    }
    if (asset.company_match.company_name && asset.company_match.address) {
      removable.add("low_metadata_confidence");
    }
    for (let index = warnings.length - 1; index >= 0; index -= 1) {
      if (removable.has(warnings[index])) warnings.splice(index, 1);
    }
  }

  if (oversizedArea || unusuallyHighKwp) {
    manual_checks.push("Verify roof geometry and split any industrial-complex polygon before delivery.");
  }
  if (missingName || genericOsmAsset) {
    manual_checks.push("Identify the company or asset name from an external source.");
  }
  if (missingAddress) {
    manual_checks.push("Verify the address before including the asset in a client report.");
  }
  if (lowMetadataConfidence) {
    manual_checks.push("Enrich industrial metadata before marking report-ready.");
  }

  const confidence =
    warnings.includes("needs_manual_geometry_check") ||
    warnings.includes("low_metadata_confidence") ||
    warnings.length >= 3
      ? "low"
      : warnings.length
        ? "medium"
        : "high";

  return {
    confidence,
    warnings,
    manual_checks,
  };
}

export function opportunityScore(asset: ScorableAsset): number {
  const components = scoreComponents(asset);
  const quality = dataQuality(asset);
  const baseScore =
    components.capacity_score * 0.25 +
    components.roof_score * 0.35 +
    components.pv_absence_score * 0.15 +
    components.industrial_score * 0.25;
  const penalty = Math.min(
    42,
    quality.warnings.reduce((total, warning) => {
      const penaltyByWarning: Record<DataQualityWarning, number> = {
        oversized_area: 14,
        missing_company_name: 8,
        missing_address: 6,
        generic_osm_asset: 8,
        unusually_high_kwp: 12,
        needs_manual_geometry_check: 10,
        low_metadata_confidence: 8,
      };
      return total + penaltyByWarning[warning];
    }, 0)
  );
  return Math.round(clamp(baseScore - penalty));
}

export function scoreLabel(score: number): "high" | "medium" | "low" {
  if (score >= 75) return "high";
  if (score >= 52) return "medium";
  return "low";
}

export function qualificationRecommendation(asset: ScorableAsset): {
  recommended_state: RecommendedState;
  recommendation_reason: string;
} {
  const score = opportunityScore(asset);
  const quality = dataQuality(asset);
  const analysis = latestAnalysis(asset);
  const suitability = asset.suitability || analysis?.suitability;

  if (suitability === "nulla" || suitability === "errore" || score < 35) {
    return {
      recommended_state: "excluded_candidate",
      recommendation_reason:
        "Low technical fit or unreliable analysis result. Exclude unless manual review finds a specific reason to recover it.",
    };
  }

  if (quality.confidence === "low") {
    return {
      recommended_state: "needs_review",
      recommendation_reason:
        "Capacity or surface may be interesting, but metadata or geometry confidence is low. Manual verification is required before client delivery.",
    };
  }

  if (score >= 78 && quality.confidence === "high" && (suitability === "alta" || suitability === "media")) {
    return {
      recommended_state: "report_ready_candidate",
      recommendation_reason:
        "Strong score with clean data quality. Candidate can move toward report-ready after final operator validation.",
    };
  }

  if (score >= 58) {
    return {
      recommended_state: "qualified",
      recommendation_reason:
        "Technically relevant asset with acceptable data quality. Keep in the qualified shortlist and validate details before export.",
    };
  }

  return {
    recommended_state: "needs_review",
    recommendation_reason:
      "Potential opportunity, but score or data completeness is not strong enough for direct delivery.",
  };
}

export function commercialFit(asset: ScorableAsset, profile: DeliveryProjectConfig): CommercialFit {
  const kwp = asset.estimated_kwp || latestAnalysis(asset)?.estimated_kwp || 0;
  const quality = dataQuality(asset);
  const reasons: string[] = [];
  const overArea = profile.max_area_mq > 0 && asset.area_mq > profile.max_area_mq;
  const overKwp = profile.max_kwp > 0 && kwp > profile.max_kwp;
  const underArea = asset.area_mq < profile.min_area_mq;
  const underKwp = kwp < profile.min_kwp;
  const generic = quality.warnings.includes("generic_osm_asset");
  const missingCompany = quality.warnings.includes("missing_company_name");
  const confidence = asset.company_match?.match_confidence || "none";

  if (underArea) reasons.push(`below ${profile.min_area_mq} mq minimum`);
  if (underKwp) reasons.push(`below ${profile.min_kwp} kWp minimum`);
  if (overArea) reasons.push(`above ${profile.max_area_mq} mq profile max`);
  if (overKwp) reasons.push(`above ${profile.max_kwp} kWp profile max`);
  if (generic) reasons.push("generic OSM-only asset");
  if (missingCompany) reasons.push("company name missing");
  if (quality.confidence === "low") reasons.push("low data confidence");
  if (confidence === "high" || confidence === "medium") reasons.push(`${confidence} company match`);

  if (underArea || underKwp) {
    return {
      profile_name: profile.profile_name,
      label: "not_profile_fit",
      reason: reasons.join(", ") || "Outside IM-EL delivery thresholds",
      recommended_action: "exclude_from_imel_package",
    };
  }

  if (overArea || overKwp) {
    return {
      profile_name: profile.profile_name,
      label: "large_enterprise_review",
      reason: reasons.join(", ") || "Larger than the IM-EL regional C&I profile",
      recommended_action: "maybe_useful_for_larger_epc",
    };
  }

  if (quality.confidence === "low" || generic || missingCompany) {
    return {
      profile_name: profile.profile_name,
      label: "low_confidence_review",
      reason: reasons.join(", ") || "Commercial identity needs manual verification",
      recommended_action: "verify_manually",
    };
  }

  return {
    profile_name: profile.profile_name,
    label: "ideal_sme_ci",
    reason: reasons.join(", ") || `${kwp} kWp within manageable SME/C&I range`,
    recommended_action: "prioritize",
  };
}
