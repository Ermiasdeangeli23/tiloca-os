from datetime import datetime, timezone
from pathlib import Path
import time

from sqlalchemy.orm import Session

from app.core.checks import require_api_keys
from app.core.config import get_settings
from app.models.scan import Scan
from app.models.territory import Territory
from app.services.osm_ingestion import fetch_industrial_buildings
from app.services.persistence import persist_asset_analysis
from app.services.satellite_fetch import fetch_satellite_image, safe_asset_name
from app.services.scoring import estimate_kwp, should_keep_analysis
from app.services.vision_analysis import analyze_roof


def run_scan(
    db: Session,
    territory_slug: str,
    max_assets: int | None = None,
    min_area_mq: int | None = None,
    min_kwp: int | None = None,
    max_area_mq: int | None = None,
    max_kwp: int | None = None,
    suitability_levels: list[str] | None = None,
) -> Scan:
    settings = get_settings()
    require_api_keys()
    territory = db.query(Territory).filter(Territory.slug == territory_slug).first()
    if territory is None:
        raise ValueError(f"Unknown territory: {territory_slug}")

    scan = Scan(
        territory_id=territory.id,
        status="running",
        profile=territory.profile,
        max_assets=max_assets or settings.default_scan_limit,
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)

    try:
        bbox = (
            territory.bbox_lat_min,
            territory.bbox_lon_min,
            territory.bbox_lat_max,
            territory.bbox_lon_max,
        )
        effective_min_area_mq = min_area_mq or territory.min_area_mq
        effective_min_kwp = min_kwp or territory.min_kwp
        effective_max_area_mq = max_area_mq or 0
        effective_max_kwp = max_kwp or 0
        effective_suitability_levels = set(suitability_levels or [])

        buildings = fetch_industrial_buildings(bbox, effective_min_area_mq)
        scan.osm_candidates_count = len(buildings)

        buildings = [
            building
            for building in buildings
            if estimate_kwp(building["area_mq"]) >= effective_min_kwp
            and (not effective_max_area_mq or building["area_mq"] <= effective_max_area_mq)
            and (not effective_max_kwp or estimate_kwp(building["area_mq"]) <= effective_max_kwp)
        ][: scan.max_assets]

        storage_dir = Path(settings.satellite_storage_dir) / territory.slug / f"scan_{scan.id}"
        persisted = 0
        analyzed = 0

        for index, building in enumerate(buildings, start=1):
            display_name = building.get("name") or f"OSM_{building['osm_id']}"
            image_name = f"{index:03d}_{safe_asset_name(display_name)}.jpg"
            image_path = storage_dir / image_name

            if not fetch_satellite_image(building["lat"], building["lon"], image_path):
                continue

            analysis = analyze_roof(image_path)
            analyzed += 1
            if not should_keep_analysis(analysis):
                image_path.unlink(missing_ok=True)
                continue
            if effective_suitability_levels and analysis.get("idoneita") not in effective_suitability_levels:
                image_path.unlink(missing_ok=True)
                continue

            kwp = estimate_kwp(building["area_mq"], analysis.get("tipo_tetto", "piano"))
            if kwp < effective_min_kwp:
                image_path.unlink(missing_ok=True)
                continue
            if effective_max_kwp and kwp > effective_max_kwp:
                image_path.unlink(missing_ok=True)
                continue
            persist_asset_analysis(
                db=db,
                territory=territory,
                scan=scan,
                building=building,
                analysis=analysis,
                estimated_kwp=kwp,
                satellite_image_path=str(image_path),
            )
            persisted += 1
            db.commit()
            time.sleep(1.5)

        scan.analyzed_count = analyzed
        scan.persisted_count = persisted
        scan.status = "completed"
        scan.finished_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(scan)
        return scan
    except Exception as exc:
        scan.status = "failed"
        scan.error = str(exc)[:2000]
        scan.finished_at = datetime.now(timezone.utc)
        db.commit()
        raise
