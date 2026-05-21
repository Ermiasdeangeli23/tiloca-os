from geoalchemy2.shape import from_shape
from shapely.geometry import Point, Polygon
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.asset_analysis import AssetAnalysis
from app.models.asset_pipeline_state import AssetPipelineState
from app.models.industrial_asset import IndustrialAsset
from app.models.scan import Scan
from app.models.territory import Territory


def _footprint(coords: list[tuple[float, float]] | None):
    if not coords or len(coords) < 4:
        return None
    return from_shape(Polygon(coords), srid=4326)


def persist_asset_analysis(
    db: Session,
    territory: Territory,
    scan: Scan,
    building: dict,
    analysis: dict,
    estimated_kwp: int,
    satellite_image_path: str,
) -> IndustrialAsset:
    asset = (
        db.query(IndustrialAsset)
        .filter(
            IndustrialAsset.territory_id == territory.id,
            IndustrialAsset.osm_id == building["osm_id"],
        )
        .first()
    )

    point = from_shape(Point(building["lon"], building["lat"]), srid=4326)
    if asset is None:
        asset = IndustrialAsset(
            territory_id=territory.id,
            osm_id=building["osm_id"],
            point=point,
            footprint=_footprint(building.get("footprint_coords")),
        )
        db.add(asset)

    asset.name = building.get("name")
    asset.address = building.get("address")
    asset.building_type = building.get("building_type")
    asset.lat = building["lat"]
    asset.lon = building["lon"]
    asset.area_mq = building["area_mq"]
    asset.estimated_kwp = estimated_kwp
    asset.roof_type = analysis.get("tipo_tetto")
    asset.suitability = analysis.get("idoneita", "errore")
    asset.satellite_image_path = satellite_image_path
    asset.industrial_metadata = building.get("tags", {})
    asset.point = point
    asset.last_seen_at = func.now()

    db.flush()

    db.add(
        AssetAnalysis(
            asset_id=asset.id,
            scan_id=scan.id,
            roof_type=analysis.get("tipo_tetto"),
            roof_quality=analysis.get("qualita_tetto"),
            orientation=analysis.get("orientamento"),
            obstacles=analysis.get("ostacoli"),
            has_panels=bool(analysis.get("ha_pannelli", False)),
            suitability=analysis.get("idoneita", "errore"),
            estimated_kwp=estimated_kwp,
            satellite_image_path=satellite_image_path,
            notes=analysis.get("note"),
            raw_vision=analysis,
        )
    )

    state = (
        db.query(AssetPipelineState)
        .filter(AssetPipelineState.asset_id == asset.id)
        .first()
    )
    if state is None:
        db.add(AssetPipelineState(asset_id=asset.id, state="new", reason="First scan persistence"))

    return asset
