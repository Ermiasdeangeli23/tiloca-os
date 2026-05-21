from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.delivery import Delivery
from app.schemas.delivery import (
    DeliveryAssetInclude,
    DeliveryAssetsRead,
    DeliveryCreate,
    DeliveryDetailRead,
    DeliveryRead,
    DeliveryRunOpenApiScanRead,
    DeliveryUpdate,
)
from app.services.delivery_service import (
    create_delivery,
    delivery_asset_count,
    exclude_asset,
    get_delivery,
    get_delivery_with_assets,
    include_asset,
    list_deliveries,
    run_scan_for_delivery,
    update_delivery,
)

router = APIRouter(prefix="/deliveries", tags=["deliveries"])


@router.get("", response_model=list[DeliveryRead])
def list_delivery_records(
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[Delivery]:
    return list_deliveries(db, status_filter=status)


@router.post("", response_model=DeliveryRead)
def create_delivery_record(
    payload: DeliveryCreate,
    db: Session = Depends(get_db),
) -> Delivery:
    try:
        return create_delivery(
            db=db,
            client_name=payload.client_name,
            client_contact=payload.client_contact,
            target_provinces=payload.target_provinces,
            criteria=payload.criteria,
            status=payload.status,
            target_opportunity_count=payload.target_opportunity_count,
            notes=payload.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{slug}", response_model=DeliveryDetailRead)
def get_delivery_record(slug: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        delivery = get_delivery(db, slug)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _delivery_detail(db, delivery)


@router.patch("/{slug}", response_model=DeliveryDetailRead)
def update_delivery_record(
    slug: str,
    payload: DeliveryUpdate,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        updates = payload.model_dump(exclude_unset=True)
        delivery = update_delivery(db, slug, **updates)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _delivery_detail(db, delivery)


@router.get("/{slug}/assets", response_model=DeliveryAssetsRead)
def get_delivery_assets(slug: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        delivery, assets = get_delivery_with_assets(db, slug)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"delivery": _delivery_detail(db, delivery), "assets": assets}


@router.post("/{slug}/run-openapi-scan", response_model=DeliveryRunOpenApiScanRead)
def run_delivery_openapi_scan(slug: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        result = run_scan_for_delivery(db, slug)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    delivery = result["delivery"]
    return {
        "delivery": _delivery_detail(db, delivery),
        "scan_results": result["scan_results"],
        "new_asset_count": result["new_asset_count"],
        "associated_asset_count": result["associated_asset_count"],
    }


@router.post("/{slug}/include-asset", response_model=DeliveryDetailRead)
def include_delivery_asset(
    slug: str,
    payload: DeliveryAssetInclude,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        include_asset(db, slug, payload.asset_id, payload.included_reason)
        delivery = get_delivery(db, slug)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _delivery_detail(db, delivery)


@router.delete("/{slug}/exclude-asset/{asset_id}", response_model=DeliveryDetailRead)
def exclude_delivery_asset(
    slug: str,
    asset_id: int,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        exclude_asset(db, slug, asset_id)
        delivery = get_delivery(db, slug)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _delivery_detail(db, delivery)


def _delivery_detail(db: Session, delivery: Delivery) -> dict[str, Any]:
    return {
        "id": delivery.id,
        "slug": delivery.slug,
        "client_name": delivery.client_name,
        "client_contact": delivery.client_contact,
        "target_provinces": delivery.target_provinces,
        "criteria": delivery.criteria,
        "status": delivery.status,
        "target_opportunity_count": delivery.target_opportunity_count,
        "notes": delivery.notes,
        "created_at": delivery.created_at,
        "updated_at": delivery.updated_at,
        "delivered_at": delivery.delivered_at,
        "asset_count": delivery_asset_count(db, delivery.id),
    }
