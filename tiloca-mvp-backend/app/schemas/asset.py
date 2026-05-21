from datetime import datetime

from pydantic import BaseModel


class AssetAnalysisRead(BaseModel):
    id: int
    scan_id: int
    roof_type: str | None
    roof_quality: str | None
    orientation: str | None
    obstacles: str | None
    has_panels: bool
    suitability: str
    estimated_kwp: int
    satellite_image_path: str | None
    notes: str | None
    raw_vision: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AssetPipelineStateRead(BaseModel):
    state: str
    reason: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}


class AssetPipelineStateUpdate(BaseModel):
    state: str
    reason: str | None = None


class CompanyMatchRead(BaseModel):
    id: int
    asset_id: int
    company_name: str | None
    address: str | None
    website: str | None
    category: str | None
    source: str
    distance_meters: float | None
    match_confidence: str
    match_score: int
    match_reason: str | None
    raw_payload: dict | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AssetListRead(BaseModel):
    id: int
    territory_id: int
    osm_id: str
    name: str | None
    address: str | None
    building_type: str | None
    lat: float
    lon: float
    area_mq: int
    estimated_kwp: int | None
    roof_type: str | None
    suitability: str | None
    satellite_image_path: str | None
    industrial_metadata: dict | None = None
    first_seen_at: datetime
    last_seen_at: datetime
    pipeline_state: AssetPipelineStateRead | None = None
    company_match: CompanyMatchRead | None = None

    model_config = {"from_attributes": True}


class AssetDetailRead(AssetListRead):
    pipeline_state: AssetPipelineStateRead | None
    analyses: list[AssetAnalysisRead]
