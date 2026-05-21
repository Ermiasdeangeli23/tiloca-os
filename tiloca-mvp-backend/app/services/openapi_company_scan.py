from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import math
from pathlib import Path
from typing import Any
import urllib.parse
import urllib.request

import requests
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.company_match import CompanyMatch
from app.models.scan import Scan
from app.models.territory import Territory
from app.services.persistence import persist_asset_analysis
from app.services.satellite_fetch import fetch_satellite_image, safe_asset_name
from app.services.scoring import estimate_kwp, should_keep_analysis
from app.services.vision_analysis import analyze_roof


@dataclass
class OpenApiCompanyScanResult:
    companies_found: int
    companies_with_coordinates: int
    roofs_analyzed: int
    accepted_opportunities: int
    rejected_opportunities: int
    cost_estimate: Any
    status: str
    error: str | None = None
    debug_info: dict[str, Any] | None = None
    asset_ids: list[int] | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "companies_found": self.companies_found,
            "companies_with_coordinates": self.companies_with_coordinates,
            "roofs_analyzed": self.roofs_analyzed,
            "accepted_opportunities": self.accepted_opportunities,
            "rejected_opportunities": self.rejected_opportunities,
            "cost_estimate": self.cost_estimate,
            "status": self.status,
            "error": self.error,
            "debug_info": self.debug_info,
        }


def run_openapi_company_scan(
    db: Session,
    province: str,
    ateco_code: str | None = None,
    min_employees: int | None = None,
    max_employees: int | None = None,
    min_turnover: int | None = None,
    max_turnover: int | None = None,
    activity_status: str | None = None,
    min_area_mq: int = 2000,
    max_area_mq: int = 30000,
    min_kwp: int = 300,
    max_kwp: int = 2500,
    limit: int = 10,
    dry_run: bool = True,
    data_enrichment: bool = False,
) -> OpenApiCompanyScanResult:
    settings = get_settings()
    capped_limit = min(max(limit or 10, 1), 50)
    province_slug = province.lower()
    territory = db.query(Territory).filter(Territory.slug == province_slug).first()
    if territory is None:
        raise ValueError(f"Unknown territory/province for OpenAPI company scan: {province_slug}")

    configured_token = (settings.openapi_company_token or "").strip()
    if configured_token.lower().startswith("bearer "):
        configured_token = configured_token[7:].strip()
    if not settings.openapi_company_base_url or not configured_token:
        return OpenApiCompanyScanResult(
            companies_found=0,
            companies_with_coordinates=0,
            roofs_analyzed=0,
            accepted_opportunities=0,
            rejected_opportunities=0,
            cost_estimate=None,
            status="missing_config",
            error="OPENAPI_COMPANY_BASE_URL and OPENAPI_COMPANY_TOKEN are required.",
        )

    effective_dry_run = dry_run
    search_params = _build_search_params(
        province=province_slug,
        ateco_code=ateco_code,
        min_employees=min_employees,
        max_employees=max_employees,
        min_turnover=min_turnover,
        max_turnover=max_turnover,
        activity_status=activity_status,
        limit=capped_limit,
        dry_run=effective_dry_run,
        data_enrichment=data_enrichment,
    )

    search = _call_openapi_it_search(search_params)
    if search["status"] in {"missing_config", "request_failed", "api_error"}:
        return OpenApiCompanyScanResult(
            companies_found=0,
            companies_with_coordinates=0,
            roofs_analyzed=0,
            accepted_opportunities=0,
            rejected_opportunities=0,
            cost_estimate=search.get("cost_estimate"),
            status=search["status"],
            error=search.get("error"),
            debug_info=search.get("debug_info"),
        )

    companies = _extract_companies(search.get("data"))
    cost_estimate = _extract_cost_estimate(search.get("data"))
    coordinate_debug = _coordinate_debug_counters(companies)
    if effective_dry_run:
        return OpenApiCompanyScanResult(
            companies_found=len(companies),
            companies_with_coordinates=coordinate_debug["companies_with_coordinates"],
            roofs_analyzed=0,
            accepted_opportunities=0,
            rejected_opportunities=0,
            cost_estimate=cost_estimate,
            status="dry_run",
            debug_info=coordinate_debug,
        )

    scan = Scan(
        territory_id=territory.id,
        status="running",
        profile="openapi_company",
        max_assets=capped_limit,
        osm_candidates_count=len(companies),
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)

    result = OpenApiCompanyScanResult(
        companies_found=len(companies),
        companies_with_coordinates=0,
        roofs_analyzed=0,
        accepted_opportunities=0,
        rejected_opportunities=0,
        cost_estimate=cost_estimate,
        status="running",
        debug_info={**coordinate_debug, "rejection_reasons": {}},
        asset_ids=[],
    )

    try:
        storage_dir = Path(settings.satellite_storage_dir) / territory.slug / f"openapi_company_scan_{scan.id}"

        for index, company in enumerate(companies[:capped_limit], start=1):
            coords = _company_coordinates(company)
            if coords is None:
                result.rejected_opportunities += 1
                _count_rejection(result, "missing_openapi_coordinates")
                continue
            result.companies_with_coordinates += 1

            building = _find_nearby_industrial_building(coords[0], coords[1])
            if building is None:
                result.rejected_opportunities += 1
                _count_rejection(result, "no_nearby_osm_building")
                continue

            image_name = f"{index:03d}_{safe_asset_name(_company_name(company) or _company_identifier(company))}.jpg"
            image_path = storage_dir / image_name
            if not fetch_satellite_image(building["lat"], building["lon"], image_path):
                result.rejected_opportunities += 1
                _count_rejection(result, "satellite_fetch_failed")
                continue

            analysis = analyze_roof(image_path)
            result.roofs_analyzed += 1
            if not should_keep_analysis(analysis):
                image_path.unlink(missing_ok=True)
                result.rejected_opportunities += 1
                _count_rejection(result, "vision_rejected")
                continue

            kwp = estimate_kwp(building["area_mq"], analysis.get("tipo_tetto", "piano"))
            if building["area_mq"] < min_area_mq or kwp < min_kwp:
                image_path.unlink(missing_ok=True)
                result.rejected_opportunities += 1
                _count_rejection(result, "below_min_threshold")
                continue
            if max_area_mq and building["area_mq"] > max_area_mq:
                image_path.unlink(missing_ok=True)
                result.rejected_opportunities += 1
                _count_rejection(result, "above_max_area")
                continue
            if max_kwp and kwp > max_kwp:
                image_path.unlink(missing_ok=True)
                result.rejected_opportunities += 1
                _count_rejection(result, "above_max_kwp")
                continue

            enriched_building = _company_to_building(company, building)
            asset = persist_asset_analysis(
                db=db,
                territory=territory,
                scan=scan,
                building=enriched_building,
                analysis=analysis,
                estimated_kwp=kwp,
                satellite_image_path=str(image_path),
            )
            _persist_openapi_company_match(db, asset.id, company, building)
            result.asset_ids = result.asset_ids or []
            result.asset_ids.append(asset.id)
            result.accepted_opportunities += 1
            db.commit()

        scan.analyzed_count = result.roofs_analyzed
        scan.persisted_count = result.accepted_opportunities
        scan.status = "completed"
        scan.finished_at = datetime.now(timezone.utc)
        db.commit()
        result.status = "completed"
        return result
    except Exception as exc:
        scan.status = "failed"
        scan.error = str(exc)[:2000]
        scan.finished_at = datetime.now(timezone.utc)
        db.commit()
        result.status = "failed"
        result.error = str(exc)[:2000]
        raise


def _build_search_params(
    province: str,
    ateco_code: str | None,
    min_employees: int | None,
    max_employees: int | None,
    min_turnover: int | None,
    max_turnover: int | None,
    activity_status: str | None,
    limit: int,
    dry_run: bool,
    data_enrichment: bool,
) -> dict[str, Any]:
    params: dict[str, Any] = {
        "dryRun": 1 if dry_run else 0,
        "dataEnrichment": "advanced" if data_enrichment else "advanced",
        "province": _province_code(province),
        "limit": limit,
    }
    if ateco_code:
        params["atecoCode"] = ateco_code
    if min_employees is not None:
        params["minEmployees"] = min_employees
    if max_employees is not None:
        params["maxEmployees"] = max_employees
    if min_turnover is not None:
        params["minTurnover"] = min_turnover
    if max_turnover is not None:
        params["maxTurnover"] = max_turnover
    if activity_status:
        params["activityStatus"] = activity_status
    return params


def _call_openapi_it_search(params: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()
    url = f"{settings.openapi_company_base_url.rstrip('/')}/{settings.openapi_company_it_search_path.lstrip('/')}"
    token = (settings.openapi_company_token or "").strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {token}",
    }
    safe_request = {
        "method": "GET",
        "url": url,
        "params": params,
        "headers": {
            "accept": "application/json",
            "Authorization": "Bearer ***",
        },
    }
    debug_info = _openapi_auth_debug(url, params, token)

    try:
        response = requests.get(url, headers=headers, params=params, timeout=30)
    except requests.RequestException as exc:
        return {
            "status": "request_failed",
            "error": str(exc),
            "request": safe_request,
            "debug_info": debug_info,
        }

    if not response.ok:
        return {
            "status": "api_error",
            "error": f"OpenAPI Company returned HTTP {response.status_code}: {response.text[:500]}",
            "request": safe_request,
            "debug_info": debug_info,
        }

    try:
        data: Any = response.json()
    except ValueError:
        data = {"raw_text": response.text[:1000]}
    return {"status": "ok", "data": data, "request": safe_request, "debug_info": debug_info}


def _openapi_auth_debug(url: str, params: dict[str, Any], token: str) -> dict[str, Any]:
    return {
        "request_url": url,
        "request_params": params,
        "auth_header_present": bool(token),
        "auth_header_prefix": "Bearer",
        "token_length": len(token),
        "token_first_4": token[:4],
        "token_last_4": token[-4:] if token else "",
    }


def _province_code(province: str) -> str:
    codes = {
        "torino": "TO",
        "to": "TO",
        "cuneo": "CN",
        "cn": "CN",
    }
    return codes.get(province.lower(), province.upper())


def _extract_companies(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if not isinstance(data, dict):
        return []
    for key in ("companies", "results", "items", "data"):
        value = data.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        if isinstance(value, dict):
            nested = _extract_companies(value)
            if nested:
                return nested
    return []


def _extract_cost_estimate(data: Any) -> Any:
    if not isinstance(data, dict):
        return None
    for key in ("cost_estimate", "costEstimate", "cost", "credits", "pricing"):
        if key in data:
            return data[key]
    return None


def _company_coordinates(company: dict[str, Any]) -> tuple[float, float] | None:
    registered_office = _registered_office(company)
    gps = registered_office.get("gps") if isinstance(registered_office, dict) else None
    coordinates = gps.get("coordinates") if isinstance(gps, dict) else None
    if isinstance(coordinates, list) and len(coordinates) >= 2:
        lon = coordinates[0]
        lat = coordinates[1]
        if lat is not None and lon is not None:
            return float(lat), float(lon)

    candidates = [
        company.get("gps"),
        company.get("geo"),
        company.get("location"),
        company.get("coordinates"),
        (company.get("address") or {}).get("geo") if isinstance(company.get("address"), dict) else None,
    ]
    for value in candidates:
        if not isinstance(value, dict):
            continue
        lat = value.get("lat") or value.get("latitude")
        lon = value.get("lon") or value.get("lng") or value.get("longitude")
        if lat is not None and lon is not None:
            return float(lat), float(lon)
    lat = company.get("lat") or company.get("latitude")
    lon = company.get("lon") or company.get("lng") or company.get("longitude")
    if lat is not None and lon is not None:
        return float(lat), float(lon)
    return None


def _registered_office(company: dict[str, Any]) -> dict[str, Any] | None:
    address = company.get("address")
    if not isinstance(address, dict):
        return None
    registered_office = address.get("registeredOffice")
    return registered_office if isinstance(registered_office, dict) else None


def _coordinate_debug_counters(companies: list[dict[str, Any]]) -> dict[str, Any]:
    with_registered_office = 0
    with_gps_object = 0
    with_coordinates = 0

    for company in companies:
        registered_office = _registered_office(company)
        if registered_office is not None:
            with_registered_office += 1
        gps = registered_office.get("gps") if isinstance(registered_office, dict) else None
        if isinstance(gps, dict):
            with_gps_object += 1
        coordinates = gps.get("coordinates") if isinstance(gps, dict) else None
        if isinstance(coordinates, list) and len(coordinates) >= 2:
            with_coordinates += 1

    return {
        "companies_found": len(companies),
        "companies_with_registered_office": with_registered_office,
        "companies_with_gps_object": with_gps_object,
        "companies_with_coordinates": with_coordinates,
    }


def _count_rejection(result: OpenApiCompanyScanResult, reason: str) -> None:
    if result.debug_info is None:
        result.debug_info = {}
    reasons = result.debug_info.setdefault("rejection_reasons", {})
    reasons[reason] = reasons.get(reason, 0) + 1


def _geocode_company(company: dict[str, Any]) -> tuple[float, float] | None:
    settings = get_settings()
    address = _company_address(company)
    if not address or not settings.google_api_key:
        return None
    try:
        response = requests.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"address": address, "key": settings.google_api_key, "region": "it", "language": "it"},
            timeout=15,
        )
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException:
        return None
    if payload.get("status") != "OK" or not payload.get("results"):
        return None
    location = payload["results"][0]["geometry"]["location"]
    return float(location["lat"]), float(location["lng"])


def _find_nearby_industrial_building(lat: float, lon: float) -> dict[str, Any] | None:
    for radius in (50, 100, 150):
        buildings = _fetch_osm_buildings_around(lat, lon, radius)
        if buildings:
            return sorted(buildings, key=lambda item: (not item["preferred"], item["distance_m"], -item["area_mq"]))[0]
    return None


def _fetch_osm_buildings_around(lat: float, lon: float, radius_m: int) -> list[dict[str, Any]]:
    query = f"""
[out:json][timeout:45];
(
  way["building"](around:{radius_m},{lat},{lon});
);
out body geom;
"""
    data = urllib.parse.urlencode({"data": query}).encode()
    req = urllib.request.Request("https://overpass-api.de/api/interpreter", data=data)
    req.add_header("User-Agent", "TilocaScanner/2.0")
    try:
        with urllib.request.urlopen(req, timeout=55) as resp:
            result = json.loads(resp.read())
    except Exception:
        return []

    buildings: list[dict[str, Any]] = []
    for el in result.get("elements", []):
        if el.get("type") != "way" or not el.get("geometry"):
            continue
        tags = el.get("tags", {})
        building_type = tags.get("building")
        preferred = building_type in {"industrial", "warehouse", "factory", "manufacture", "shed"} or tags.get("landuse") == "industrial"
        coords = [(node["lon"], node["lat"]) for node in el["geometry"]]
        if len(coords) < 3:
            continue
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        lat_c = sum(node["lat"] for node in el["geometry"]) / len(el["geometry"])
        lon_c = sum(node["lon"] for node in el["geometry"]) / len(el["geometry"])
        area_mq = _polygon_area_mq(coords, lat)
        if area_mq < 500:
            continue
        buildings.append(
            {
                "osm_id": str(el["id"]),
                "lat": round(lat_c, 6),
                "lon": round(lon_c, 6),
                "area_mq": int(area_mq),
                "name": tags.get("name"),
                "building_type": building_type,
                "address": _osm_address(tags),
                "tags": tags,
                "footprint_coords": coords,
                "preferred": preferred,
                "distance_m": _distance_m(lat, lon, lat_c, lon_c),
            }
        )
    return buildings


def _polygon_area_mq(coords: list[tuple[float, float]], lat_ref: float) -> float:
    area_deg = 0.0
    for i in range(len(coords) - 1):
        area_deg += coords[i][0] * coords[i + 1][1]
        area_deg -= coords[i + 1][0] * coords[i][1]
    return abs(area_deg) / 2 * (111320**2) * math.cos(math.radians(lat_ref))


def _distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius = 6371000
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return earth_radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _osm_address(tags: dict[str, Any]) -> str | None:
    value = f"{tags.get('addr:street', '')} {tags.get('addr:housenumber', '')} {tags.get('addr:city', '')}".strip()
    return value or None


def _company_to_building(company: dict[str, Any], building: dict[str, Any]) -> dict[str, Any]:
    metadata = _safe_company_metadata(company)
    metadata.update(
        {
            "source": "openapi_company",
            "matched_osm_id": building.get("osm_id"),
            "osm_distance_m": round(building.get("distance_m", 0), 1),
        }
    )
    return {
        **building,
        "osm_id": f"openapi_company:{_company_identifier(company)}:{building['osm_id']}",
        "name": _company_name(company) or building.get("name"),
        "address": _company_address(company) or building.get("address"),
        "building_type": building.get("building_type") or "industrial_company_candidate",
        "tags": metadata,
    }


def _persist_openapi_company_match(db: Session, asset_id: int, company: dict[str, Any], building: dict[str, Any]) -> None:
    match = db.query(CompanyMatch).filter(CompanyMatch.asset_id == asset_id).first()
    if match is None:
        match = CompanyMatch(asset_id=asset_id)
        db.add(match)
    match.company_name = _company_name(company)
    match.address = _company_address(company)
    match.website = _first_value(company, ["website", "web", "url", "sitoWeb"])
    match.category = _company_ateco(company)
    match.source = "openapi_company"
    match.distance_meters = float(building.get("distance_m", 0))
    match.match_confidence = "high" if match.company_name and match.address and match.distance_meters <= 100 else "medium"
    match.match_score = 90 if match.match_confidence == "high" else 70
    match.match_reason = "OpenAPI company matched to nearby OSM roof and validated by satellite vision."
    match.raw_payload = _safe_company_metadata(company)


def _safe_company_metadata(company: dict[str, Any]) -> dict[str, Any]:
    return {
        "company_name": _company_name(company),
        "vat_or_tax_code": _company_identifier(company),
        "ateco": _company_ateco(company),
        "employees": _first_value(company, ["employees", "dipendenti", "numeroDipendenti"]),
        "turnover": _first_value(company, ["turnover", "fatturato", "revenue"]),
        "pec": _first_value(company, ["pec", "pecAddress", "mailPec"]),
        "legal_status": _first_value(company, ["legalStatus", "statoAttivita", "activityStatus"]),
        "address": _company_address(company),
    }


def _company_name(company: dict[str, Any]) -> str | None:
    return _first_value(company, ["companyName", "denominazione", "ragioneSociale", "name", "nome"])


def _company_identifier(company: dict[str, Any]) -> str:
    value = _first_value(company, ["vatCode", "vat", "partitaIva", "taxCode", "codiceFiscale", "id"])
    return safe_asset_name(value or _company_name(company) or "openapi_company")


def _company_ateco(company: dict[str, Any]) -> str | None:
    value = _first_value(company, ["atecoCode", "ateco", "codiceAteco"])
    if value:
        return value
    ateco = company.get("ateco")
    if isinstance(ateco, dict):
        return _first_value(ateco, ["code", "codice", "atecoCode"])
    return None


def _company_address(company: dict[str, Any]) -> str | None:
    direct = _first_value(company, ["address", "indirizzo", "registeredOfficeAddress", "sedeLegale"])
    if isinstance(direct, str):
        return direct
    if isinstance(direct, dict):
        parts = [
            direct.get("street") or direct.get("via"),
            direct.get("streetNumber") or direct.get("civico"),
            direct.get("city") or direct.get("comune"),
            direct.get("province") or direct.get("provincia"),
        ]
        return " ".join(str(part) for part in parts if part)
    return None


def _first_value(source: dict[str, Any], keys: list[str]) -> Any:
    for key in keys:
        value = source.get(key)
        if value not in (None, ""):
            return value
    return None
