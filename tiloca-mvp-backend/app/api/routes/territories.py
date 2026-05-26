from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.asset_analysis import AssetAnalysis
from app.models.industrial_asset import IndustrialAsset
from app.models.scan import Scan
from app.models.territory import Territory
from app.schemas.territory import TerritoryRead

router = APIRouter(prefix="/territories", tags=["territories"])


@router.get("", response_model=list[TerritoryRead])
def list_territories(db: Session = Depends(get_db)) -> list[Territory]:
    return db.query(Territory).order_by(Territory.slug).all()


@router.get("/{slug}/overview")
def get_territory_overview(slug: str, db: Session = Depends(get_db)) -> dict:
    territory = db.query(Territory).filter(Territory.slug == slug).first()
    if territory is None:
        raise HTTPException(status_code=404, detail="Territory not found")

    latest_analysis_ids = (
        db.query(
            AssetAnalysis.asset_id.label("asset_id"),
            func.max(AssetAnalysis.id).label("analysis_id"),
        )
        .join(IndustrialAsset, IndustrialAsset.id == AssetAnalysis.asset_id)
        .filter(IndustrialAsset.territory_id == territory.id)
        .group_by(AssetAnalysis.asset_id)
        .subquery()
    )

    suitability_value = func.coalesce(AssetAnalysis.suitability, IndustrialAsset.suitability)
    kwp_value = func.coalesce(AssetAnalysis.estimated_kwp, IndustrialAsset.estimated_kwp, 0)

    totals = (
        db.query(
            func.count(IndustrialAsset.id).label("buildings_identified"),
            func.coalesce(
                func.sum(case((suitability_value.in_(["alta", "media"]), 1), else_=0)),
                0,
            ).label("with_idoneous_roof"),
            func.coalesce(
                func.sum(case((suitability_value == "alta", 1), else_=0)),
                0,
            ).label("high_suitability"),
            func.coalesce(
                func.sum(case((or_(AssetAnalysis.has_panels.is_(False), AssetAnalysis.has_panels.is_(None)), 1), else_=0)),
                0,
            ).label("without_existing_pv"),
            func.coalesce(
                func.sum(case((IndustrialAsset.area_mq >= 2000, 1), else_=0)),
                0,
            ).label("above_2000mq"),
            func.coalesce(
                func.sum(case((suitability_value != "bassa", kwp_value), else_=0)),
                0,
            ).label("total_installable_kwp"),
        )
        .select_from(IndustrialAsset)
        .outerjoin(latest_analysis_ids, latest_analysis_ids.c.asset_id == IndustrialAsset.id)
        .outerjoin(AssetAnalysis, AssetAnalysis.id == latest_analysis_ids.c.analysis_id)
        .filter(IndustrialAsset.territory_id == territory.id)
        .one()
    )

    kwp_bucket = case(
        (kwp_value < 300, "<300"),
        (kwp_value < 1000, "300-1000"),
        (kwp_value < 2500, "1000-2500"),
        (kwp_value < 5000, "2500-5000"),
        else_=">5000",
    ).label("range")
    distribution_rows = (
        db.query(kwp_bucket, func.count(IndustrialAsset.id).label("count"))
        .select_from(IndustrialAsset)
        .outerjoin(latest_analysis_ids, latest_analysis_ids.c.asset_id == IndustrialAsset.id)
        .outerjoin(AssetAnalysis, AssetAnalysis.id == latest_analysis_ids.c.analysis_id)
        .filter(IndustrialAsset.territory_id == territory.id)
        .group_by(kwp_bucket)
        .all()
    )
    distribution_map = {row.range: int(row.count) for row in distribution_rows}

    ateco_category = func.coalesce(
        IndustrialAsset.industrial_metadata["ateco"].astext,
        IndustrialAsset.industrial_metadata["atecoCode"].astext,
        IndustrialAsset.industrial_metadata["ateco_code"].astext,
        IndustrialAsset.industrial_metadata["category"].astext,
        IndustrialAsset.building_type,
        "unknown",
    ).label("category")
    by_ateco_rows = (
        db.query(ateco_category, func.count(IndustrialAsset.id).label("count"))
        .filter(IndustrialAsset.territory_id == territory.id)
        .group_by(ateco_category)
        .order_by(func.count(IndustrialAsset.id).desc())
        .limit(8)
        .all()
    )

    suitability_rows = (
        db.query(suitability_value.label("suitability"), func.count(IndustrialAsset.id).label("count"))
        .select_from(IndustrialAsset)
        .outerjoin(latest_analysis_ids, latest_analysis_ids.c.asset_id == IndustrialAsset.id)
        .outerjoin(AssetAnalysis, AssetAnalysis.id == latest_analysis_ids.c.analysis_id)
        .filter(IndustrialAsset.territory_id == territory.id)
        .group_by(suitability_value)
        .all()
    )
    suitability_counts = {"alta": 0, "media": 0, "bassa": 0, "non_analizzato": 0}
    for row in suitability_rows:
        key = row.suitability if row.suitability in {"alta", "media", "bassa"} else "non_analizzato"
        suitability_counts[key] += int(row.count)

    last_scan_date = (
        db.query(func.max(Scan.finished_at))
        .filter(Scan.territory_id == territory.id)
        .scalar()
    )

    return {
        "territory": {"id": territory.id, "slug": territory.slug, "name": territory.name},
        "totals": {
            "buildings_identified": int(totals.buildings_identified or 0),
            "with_idoneous_roof": int(totals.with_idoneous_roof or 0),
            "high_suitability": int(totals.high_suitability or 0),
            "without_existing_pv": int(totals.without_existing_pv or 0),
            "above_2000mq": int(totals.above_2000mq or 0),
            "total_installable_kwp": int(totals.total_installable_kwp or 0),
        },
        "kwp_distribution": [
            {"range": "300-1000", "count": distribution_map.get("300-1000", 0)},
            {"range": "1000-2500", "count": distribution_map.get("1000-2500", 0)},
            {"range": "2500-5000", "count": distribution_map.get("2500-5000", 0)},
            {"range": ">5000", "count": distribution_map.get(">5000", 0)},
            {"range": "<300", "count": distribution_map.get("<300", 0)},
        ],
        "by_ateco": [
            {"category": str(row.category or "unknown"), "count": int(row.count)}
            for row in by_ateco_rows
        ],
        "by_suitability": suitability_counts,
        "last_scan_date": last_scan_date.isoformat() if last_scan_date else None,
    }
