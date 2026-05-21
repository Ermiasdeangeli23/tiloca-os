from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.scan import (
    CompanyFirstScanCreate,
    CompanyFirstScanRead,
    OpenApiCompanyScanCreate,
    OpenApiCompanyScanRead,
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
