from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.asset import AssetListRead


class DeliveryCreate(BaseModel):
    client_name: str
    client_contact: str | None = None
    target_provinces: list[str] = Field(default_factory=list)
    criteria: dict[str, Any] = Field(default_factory=dict)
    status: str = "draft"
    target_opportunity_count: int | None = None
    notes: str | None = None


class DeliveryUpdate(BaseModel):
    client_name: str | None = None
    client_contact: str | None = None
    target_provinces: list[str] | None = None
    criteria: dict[str, Any] | None = None
    status: str | None = None
    target_opportunity_count: int | None = None
    notes: str | None = None


class DeliveryRead(BaseModel):
    id: int
    slug: str
    client_name: str
    client_contact: str | None
    target_provinces: list[str]
    criteria: dict[str, Any]
    status: str
    target_opportunity_count: int | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    delivered_at: datetime | None

    model_config = {"from_attributes": True}


class DeliveryDetailRead(DeliveryRead):
    asset_count: int


class DeliveryAssetInclude(BaseModel):
    asset_id: int
    included_reason: str = "manual_add"


class DeliveryRunOpenApiScanRead(BaseModel):
    delivery: DeliveryDetailRead
    scan_results: list[dict[str, Any]]
    new_asset_count: int
    associated_asset_count: int


class DeliveryAssetsRead(BaseModel):
    delivery: DeliveryDetailRead
    assets: list[AssetListRead]
