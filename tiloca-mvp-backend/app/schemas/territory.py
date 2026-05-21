from datetime import datetime

from pydantic import BaseModel


class TerritoryRead(BaseModel):
    id: int
    slug: str
    name: str
    profile: str
    min_area_mq: int
    min_kwp: int
    bbox_lat_min: float
    bbox_lon_min: float
    bbox_lat_max: float
    bbox_lon_max: float
    created_at: datetime

    model_config = {"from_attributes": True}
