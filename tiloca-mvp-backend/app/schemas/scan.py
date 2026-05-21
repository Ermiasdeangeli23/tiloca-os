from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ScanCreate(BaseModel):
    max_assets: int | None = None
    min_area_mq: int | None = None
    min_kwp: int | None = None
    max_area_mq: int | None = None
    max_kwp: int | None = None
    suitability_levels: list[str] | None = None


class CompanyFirstScanCreate(BaseModel):
    province: str | None = None
    zone_group: str | None = None
    max_places: int = 25
    min_area_mq: int = 2000
    max_area_mq: int = 30000
    min_kwp: int = 300
    max_kwp: int = 2500
    max_results: int = 10


class CompanyFirstScanRead(BaseModel):
    profile_slug: str
    province: str
    zone_group: str | None
    max_places: int
    companies_found: int
    after_blacklist_dedup: int
    roofs_analyzed: int
    accepted_opportunities: int
    rejected_opportunities: int
    status: str
    error: str | None = None


class OpenApiCompanyScanCreate(BaseModel):
    province: str
    atecoCode: str | None = None
    minEmployees: int | None = None
    maxEmployees: int | None = None
    minTurnover: int | None = None
    maxTurnover: int | None = None
    activityStatus: str | None = None
    min_area_mq: int = 2000
    max_area_mq: int = 30000
    min_kwp: int = 300
    max_kwp: int = 2500
    limit: int = 10
    dryRun: bool = True
    dataEnrichment: bool = False


class OpenApiCompanyScanRead(BaseModel):
    companies_found: int
    companies_with_coordinates: int
    roofs_analyzed: int
    accepted_opportunities: int
    rejected_opportunities: int
    cost_estimate: Any = None
    status: str
    error: str | None = None
    debug_info: dict | None = None


class ScanRead(BaseModel):
    id: int
    territory_id: int
    status: str
    profile: str
    max_assets: int
    osm_candidates_count: int
    analyzed_count: int
    persisted_count: int
    rejected_count: int
    skipped_count: int
    error: str | None
    started_at: datetime
    finished_at: datetime | None

    model_config = {"from_attributes": True}
