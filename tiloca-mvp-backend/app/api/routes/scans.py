from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.models.asset_analysis import AssetAnalysis
from app.models.industrial_asset import IndustrialAsset
from app.models.scan import Scan
from app.schemas.scan import (
    CompanyFirstScanCreate,
    CompanyFirstScanRead,
    OpenApiCompanyScanCreate,
    OpenApiCompanyScanRead,
    ScanAssetsRead,
    ScanCreate,
    ScanRead,
)
from app.core.checks import LocalValidationError
from app.services.company_first_scan import run_company_first_scan
from app.services.openapi_company_scan import run_openapi_company_scan
from app.services.scan_service import run_scan

router = APIRouter(tags=["scans"])


@router.post("/scan/{territory}", response_model=ScanRead)
def scan_territory(
    territory: str,
    payload: ScanCreate | None = None,
    db: Session = Depends(get_db),
):
    try:
        return run_scan(
            db,
            territory,
            max_assets=payload.max_assets if payload else None,
            min_area_mq=payload.min_area_mq if payload else None,
            min_kwp=payload.min_kwp if payload else None,
            max_area_mq=payload.max_area_mq if payload else None,
            max_kwp=payload.max_kwp if payload else None,
            suitability_levels=payload.suitability_levels if payload else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except LocalValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/scans/{scan_id}/assets", response_model=ScanAssetsRead)
def get_scan_assets(scan_id: int, db: Session = Depends(get_db)):
    scan = (
        db.query(Scan)
        .options(joinedload(Scan.territory))
        .filter(Scan.id == scan_id)
        .first()
    )
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found")

    analyses = (
        db.query(AssetAnalysis)
        .options(
            joinedload(AssetAnalysis.asset).joinedload(IndustrialAsset.pipeline_state),
            joinedload(AssetAnalysis.asset).joinedload(IndustrialAsset.company_match),
        )
        .filter(AssetAnalysis.scan_id == scan_id)
        .order_by(AssetAnalysis.estimated_kwp.desc(), AssetAnalysis.id.asc())
        .all()
    )

    vision_failures = [
        {
            "asset_id": analysis.asset_id,
            "osm_id": analysis.asset.osm_id if analysis.asset else None,
            "image_path": analysis.satellite_image_path,
            "vision_status": (analysis.raw_vision or {}).get("vision_status"),
            "vision_error": (analysis.raw_vision or {}).get("vision_error"),
            "parsing_error": (analysis.raw_vision or {}).get("parsing_error"),
            "raw_model_response": (analysis.raw_vision or {}).get("raw_model_response"),
        }
        for analysis in analyses
        if (analysis.raw_vision or {}).get("vision_status") == "error"
    ]
    scan._debug_info = {
        "scan_asset_count": len(analyses),
        "vision_failures_count": len(vision_failures),
        "vision_failures": vision_failures,
        "asset_source": "asset_analysis.scan_id",
    }

    assets = []
    for analysis in analyses:
        asset = analysis.asset
        if asset is None:
            continue
        asset.scan_analysis = analysis
        assets.append(asset)

    return {"scan": scan, "assets": assets}


@router.post("/company-scan/openapi", response_model=OpenApiCompanyScanRead)
def openapi_company_scan(
    payload: OpenApiCompanyScanCreate,
    db: Session = Depends(get_db),
):
    try:
        result = run_openapi_company_scan(
            db=db,
            province=payload.province,
            ateco_code=payload.atecoCode,
            min_employees=payload.minEmployees,
            max_employees=payload.maxEmployees,
            min_turnover=payload.minTurnover,
            max_turnover=payload.maxTurnover,
            activity_status=payload.activityStatus,
            min_area_mq=payload.min_area_mq,
            max_area_mq=payload.max_area_mq,
            min_kwp=payload.min_kwp,
            max_kwp=payload.max_kwp,
            limit=payload.limit,
            dry_run=payload.dryRun,
            data_enrichment=payload.dataEnrichment,
            confirm_production=payload.confirmProduction,
        )
        return result.as_dict()
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/company-scan/{profile_slug}", response_model=CompanyFirstScanRead)
def company_first_scan(
    profile_slug: str,
    payload: CompanyFirstScanCreate | None = None,
    db: Session = Depends(get_db),
):
    request = payload or CompanyFirstScanCreate()
    try:
        result = run_company_first_scan(
            db=db,
            profile_slug=profile_slug,
            province=request.province,
            zone_group=request.zone_group,
            max_places=request.max_places,
            min_area_mq=request.min_area_mq,
            max_area_mq=request.max_area_mq,
            min_kwp=request.min_kwp,
            max_kwp=request.max_kwp,
            max_results=request.max_results,
        )
        return result.as_dict()
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except LocalValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
