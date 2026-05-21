from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import and_, func, not_, select
from sqlalchemy.orm import Session, joinedload

from app.models.delivery import DELIVERY_ASSET_REASONS, DELIVERY_STATUSES, Delivery, DeliveryAsset
from app.models.industrial_asset import IndustrialAsset
from app.models.territory import Territory
from app.services.openapi_company_scan import run_openapi_company_scan


def create_delivery(
    db: Session,
    client_name: str,
    client_contact: str | None = None,
    target_provinces: list[str] | None = None,
    criteria: dict[str, Any] | None = None,
    status: str = "draft",
    target_opportunity_count: int | None = None,
    notes: str | None = None,
) -> Delivery:
    if status not in DELIVERY_STATUSES:
        raise ValueError("Invalid delivery status")
    slug = _unique_slug(db, _slugify(client_name))
    delivery = Delivery(
        slug=slug,
        client_name=client_name,
        client_contact=client_contact,
        target_provinces=target_provinces or [],
        criteria=criteria or {},
        status=status,
        target_opportunity_count=target_opportunity_count,
        notes=notes,
        delivered_at=datetime.now(timezone.utc) if status == "delivered" else None,
    )
    db.add(delivery)
    db.commit()
    db.refresh(delivery)
    return delivery


def list_deliveries(db: Session, status_filter: str | None = None) -> list[Delivery]:
    query = db.query(Delivery)
    if status_filter:
        query = query.filter(Delivery.status == status_filter)
    return query.order_by(Delivery.created_at.desc()).all()


def get_delivery(db: Session, slug: str) -> Delivery:
    delivery = db.query(Delivery).filter(Delivery.slug == slug).first()
    if delivery is None:
        raise ValueError(f"Delivery not found: {slug}")
    return delivery


def update_delivery(
    db: Session,
    slug: str,
    **updates: Any,
) -> Delivery:
    delivery = get_delivery(db, slug)
    if "status" in updates and updates["status"] is not None:
        if updates["status"] not in DELIVERY_STATUSES:
            raise ValueError("Invalid delivery status")
        delivery.status = updates["status"]
        delivery.delivered_at = datetime.now(timezone.utc) if delivery.status == "delivered" else delivery.delivered_at
    for field in (
        "client_name",
        "client_contact",
        "target_provinces",
        "criteria",
        "target_opportunity_count",
        "notes",
    ):
        if field in updates and updates[field] is not None:
            setattr(delivery, field, updates[field])
    db.commit()
    db.refresh(delivery)
    return delivery


def get_delivery_with_assets(db: Session, slug: str) -> tuple[Delivery, list[IndustrialAsset]]:
    delivery = get_delivery(db, slug)
    assets = (
        db.query(IndustrialAsset)
        .join(DeliveryAsset, DeliveryAsset.asset_id == IndustrialAsset.id)
        .options(
            joinedload(IndustrialAsset.pipeline_state),
            joinedload(IndustrialAsset.company_match),
        )
        .filter(DeliveryAsset.delivery_id == delivery.id)
        .order_by(DeliveryAsset.included_at.desc())
        .all()
    )
    return delivery, assets


def delivery_asset_count(db: Session, delivery_id: int) -> int:
    return (
        db.query(func.count(DeliveryAsset.asset_id))
        .filter(DeliveryAsset.delivery_id == delivery_id)
        .scalar()
        or 0
    )


def include_asset(
    db: Session,
    slug: str,
    asset_id: int,
    included_reason: str = "manual_add",
) -> DeliveryAsset:
    if included_reason not in DELIVERY_ASSET_REASONS:
        raise ValueError("Invalid delivery asset include reason")
    delivery = get_delivery(db, slug)
    asset = db.query(IndustrialAsset).filter(IndustrialAsset.id == asset_id).first()
    if asset is None:
        raise ValueError(f"Asset not found: {asset_id}")
    link = (
        db.query(DeliveryAsset)
        .filter(DeliveryAsset.delivery_id == delivery.id, DeliveryAsset.asset_id == asset.id)
        .first()
    )
    if link is None:
        link = DeliveryAsset(delivery_id=delivery.id, asset_id=asset.id, included_reason=included_reason)
        db.add(link)
        db.commit()
        db.refresh(link)
    return link


def exclude_asset(db: Session, slug: str, asset_id: int) -> None:
    delivery = get_delivery(db, slug)
    link = (
        db.query(DeliveryAsset)
        .filter(DeliveryAsset.delivery_id == delivery.id, DeliveryAsset.asset_id == asset_id)
        .first()
    )
    if link is not None:
        db.delete(link)
        db.commit()


def run_scan_for_delivery(db: Session, slug: str) -> dict[str, Any]:
    delivery = get_delivery(db, slug)
    criteria = delivery.criteria or {}
    provinces = delivery.target_provinces or []
    if not provinces:
        raise ValueError("Delivery has no target_provinces")

    scan_results: list[dict[str, Any]] = []
    associated_ids: set[int] = set()
    new_links = 0
    for province in provinces:
        result = run_openapi_company_scan(
            db=db,
            province=province,
            ateco_code=_first_or_value(criteria.get("ateco_codes") or criteria.get("atecoCode")),
            min_employees=criteria.get("min_employees") or criteria.get("minEmployees"),
            max_employees=criteria.get("max_employees") or criteria.get("maxEmployees"),
            min_turnover=criteria.get("min_turnover") or criteria.get("minTurnover"),
            max_turnover=criteria.get("max_turnover") or criteria.get("maxTurnover"),
            activity_status=criteria.get("activity_status") or criteria.get("activityStatus"),
            min_area_mq=criteria.get("min_area_mq", 2000),
            max_area_mq=criteria.get("max_area_mq", 30000),
            min_kwp=criteria.get("min_kwp", 300),
            max_kwp=criteria.get("max_kwp", 2500),
            limit=criteria.get("limit", 10),
            dry_run=criteria.get("dryRun", criteria.get("dry_run", True)),
            data_enrichment=criteria.get("dataEnrichment", criteria.get("data_enrichment", False)),
        )
        scan_results.append(result.as_dict())
        for asset_id in result.asset_ids or []:
            existing_link = (
                db.query(DeliveryAsset)
                .filter(DeliveryAsset.delivery_id == delivery.id, DeliveryAsset.asset_id == asset_id)
                .first()
            )
            link = include_asset(db, slug, asset_id, included_reason="scan_result")
            associated_ids.add(link.asset_id)
            if existing_link is None:
                new_links += 1

    return {
        "delivery": delivery,
        "scan_results": scan_results,
        "new_asset_count": new_links,
        "associated_asset_count": len(associated_ids),
    }


def suggest_carry_over_assets(db: Session, slug: str) -> list[IndustrialAsset]:
    delivery = get_delivery(db, slug)
    criteria = delivery.criteria or {}
    provinces = delivery.target_provinces or []
    query = (
        db.query(IndustrialAsset)
        .join(Territory, Territory.id == IndustrialAsset.territory_id)
        .options(
            joinedload(IndustrialAsset.pipeline_state),
            joinedload(IndustrialAsset.company_match),
        )
        .filter(Territory.slug.in_(provinces))
        .filter(
            not_(
                select(DeliveryAsset.asset_id)
                .where(
                    and_(
                        DeliveryAsset.delivery_id == delivery.id,
                        DeliveryAsset.asset_id == IndustrialAsset.id,
                    )
                )
                .exists()
            )
        )
    )
    if criteria.get("min_area_mq"):
        query = query.filter(IndustrialAsset.area_mq >= criteria["min_area_mq"])
    if criteria.get("max_area_mq"):
        query = query.filter(IndustrialAsset.area_mq <= criteria["max_area_mq"])
    if criteria.get("min_kwp"):
        query = query.filter(IndustrialAsset.estimated_kwp >= criteria["min_kwp"])
    if criteria.get("max_kwp"):
        query = query.filter(IndustrialAsset.estimated_kwp <= criteria["max_kwp"])
    if criteria.get("suitability_floor"):
        allowed = _suitability_floor_values(criteria["suitability_floor"])
        query = query.filter(IndustrialAsset.suitability.in_(allowed))
    return query.order_by(IndustrialAsset.estimated_kwp.desc().nullslast()).limit(100).all()


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "delivery"


def _unique_slug(db: Session, base_slug: str) -> str:
    slug = base_slug
    counter = 2
    while db.query(Delivery).filter(Delivery.slug == slug).first() is not None:
        slug = f"{base_slug}-{counter}"
        counter += 1
    return slug


def _first_or_value(value: Any) -> Any:
    if isinstance(value, list):
        return value[0] if value else None
    return value


def _suitability_floor_values(floor: str) -> list[str]:
    order = ["nulla", "bassa", "media", "alta"]
    if floor not in order:
        return ["alta", "media"]
    return order[order.index(floor) :]
