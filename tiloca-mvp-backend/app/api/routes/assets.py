from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.database import get_db
from app.models.asset_pipeline_state import AssetPipelineState
from app.models.industrial_asset import IndustrialAsset
from app.models.territory import Territory
from app.schemas.asset import AssetDetailRead, AssetListRead, AssetPipelineStateUpdate, CompanyMatchRead
from app.services.company_matching import match_company_for_asset

router = APIRouter(prefix="/assets", tags=["assets"])

ALLOWED_OPERATIONAL_STATES = {
    "new",
    "needs_review",
    "qualified",
    "report_ready",
    "excluded",
}


@router.get("", response_model=list[AssetListRead])
def list_assets(
    territory: str | None = None,
    suitability: str | None = None,
    min_area_mq: int | None = Query(default=None, ge=0),
    min_kwp: int | None = Query(default=None, ge=0),
    max_area_mq: int | None = Query(default=None, ge=0),
    max_kwp: int | None = Query(default=None, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[IndustrialAsset]:
    query = db.query(IndustrialAsset).options(
        joinedload(IndustrialAsset.pipeline_state),
        joinedload(IndustrialAsset.company_match),
    )
    if territory:
        query = query.join(Territory).filter(Territory.slug == territory)
    if suitability:
        query = query.filter(IndustrialAsset.suitability == suitability)
    if min_area_mq is not None:
        query = query.filter(IndustrialAsset.area_mq >= min_area_mq)
    if min_kwp is not None:
        query = query.filter(IndustrialAsset.estimated_kwp >= min_kwp)
    if max_area_mq is not None:
        query = query.filter(IndustrialAsset.area_mq <= max_area_mq)
    if max_kwp is not None:
        query = query.filter(IndustrialAsset.estimated_kwp <= max_kwp)
    return query.order_by(IndustrialAsset.area_mq.desc()).limit(limit).all()


@router.get("/{asset_id}", response_model=AssetDetailRead)
def get_asset(asset_id: int, db: Session = Depends(get_db)) -> IndustrialAsset:
    asset = (
        db.query(IndustrialAsset)
        .options(
            selectinload(IndustrialAsset.analyses),
            joinedload(IndustrialAsset.pipeline_state),
            joinedload(IndustrialAsset.company_match),
        )
        .filter(IndustrialAsset.id == asset_id)
        .first()
    )
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    asset.analyses.sort(key=lambda analysis: analysis.created_at, reverse=True)
    return asset


@router.patch("/{asset_id}/state", response_model=AssetDetailRead)
def update_asset_state(
    asset_id: int,
    payload: AssetPipelineStateUpdate,
    db: Session = Depends(get_db),
) -> IndustrialAsset:
    if payload.state not in ALLOWED_OPERATIONAL_STATES:
        raise HTTPException(status_code=400, detail="Invalid operational asset state")

    asset = (
        db.query(IndustrialAsset)
        .options(
            selectinload(IndustrialAsset.analyses),
            joinedload(IndustrialAsset.pipeline_state),
            joinedload(IndustrialAsset.company_match),
        )
        .filter(IndustrialAsset.id == asset_id)
        .first()
    )
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")

    state = asset.pipeline_state
    if state is None:
        state = AssetPipelineState(asset_id=asset.id)
        db.add(state)

    state.state = payload.state
    state.reason = payload.reason or "Operator shortlist update"
    db.commit()
    db.refresh(asset)
    asset.analyses.sort(key=lambda analysis: analysis.created_at, reverse=True)
    return asset


@router.post("/{asset_id}/match-company", response_model=CompanyMatchRead)
def match_asset_company(
    asset_id: int,
    db: Session = Depends(get_db),
):
    try:
        return match_company_for_asset(db, asset_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
