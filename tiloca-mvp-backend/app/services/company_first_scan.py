from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import time
from typing import Any

import requests
from sqlalchemy.orm import Session

from app.core.checks import require_api_keys
from app.core.config import get_settings
from app.models.company_match import CompanyMatch
from app.models.scan import Scan
from app.models.territory import Territory
from app.services.persistence import persist_asset_analysis
from app.services.satellite_fetch import fetch_satellite_image, safe_asset_name
from app.services.scoring import estimate_kwp, should_keep_analysis
from app.services.vision_analysis import analyze_roof


IMEL_ZONES: dict[str, list[str]] = {
    "torino": [
        "Moncalieri",
        "Nichelino",
        "Rivoli",
        "Grugliasco",
        "Collegno",
        "Settimo Torinese",
        "Borgaro Torinese",
        "Leini",
        "Volpiano",
        "Chieri",
        "Cambiano",
        "Santena",
        "Poirino",
        "Pinerolo",
        "Airasca",
    ],
    "cuneo": [
        "Alba",
        "Fossano",
        "Savigliano",
        "Mondovi",
        "Saluzzo",
        "Bra",
        "Cuneo area industriale",
    ],
}

IMEL_KEYWORDS = [
    "officina meccanica",
    "carpenteria metallica",
    "torneria",
    "stampaggio plastica",
    "lavorazione metalli",
    "produzione alimentare",
    "magazzino industriale",
    "fonderia",
    "imballaggio industriale",
    "falegnameria industriale",
]

BLACKLIST_TYPES = {
    "restaurant",
    "bar",
    "cafe",
    "meal_takeaway",
    "lodging",
    "school",
    "university",
    "church",
    "hospital",
    "doctor",
    "dentist",
    "pharmacy",
    "bank",
    "atm",
    "gas_station",
    "supermarket",
    "shopping_mall",
}

BLACKLIST_NAME_PARTS = {
    "ristorante",
    "bar ",
    "caffe",
    "caffè",
    "hotel",
    "b&b",
    "farmacia",
    "scuola",
    "banca",
    "supermercato",
}


@dataclass
class CompanyFirstScanResult:
    profile_slug: str
    province: str
    zone_group: str | None
    max_places: int
    companies_found: int
    after_blacklist_dedup: int
    roofs_analyzed: int
    accepted_opportunities: int
    rejected_opportunities: int
    status: str
    error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "profile_slug": self.profile_slug,
            "province": self.province,
            "zone_group": self.zone_group,
            "max_places": self.max_places,
            "companies_found": self.companies_found,
            "after_blacklist_dedup": self.after_blacklist_dedup,
            "roofs_analyzed": self.roofs_analyzed,
            "accepted_opportunities": self.accepted_opportunities,
            "rejected_opportunities": self.rejected_opportunities,
            "status": self.status,
            "error": self.error,
        }


def run_company_first_scan(
    db: Session,
    profile_slug: str,
    province: str | None = None,
    zone_group: str | None = None,
    max_places: int = 25,
    min_area_mq: int = 2000,
    max_area_mq: int = 30000,
    min_kwp: int = 300,
    max_kwp: int = 2500,
    max_results: int = 10,
) -> CompanyFirstScanResult:
    if profile_slug != "imel":
        raise ValueError(f"Unknown company-first profile: {profile_slug}")

    require_api_keys()
    settings = get_settings()
    capped_max_places = min(max(max_places, 1), 100)
    capped_max_results = min(max(max_results, 1), capped_max_places)
    effective_province = (province or "torino").lower()
    territory = db.query(Territory).filter(Territory.slug == effective_province).first()
    if territory is None:
        raise ValueError(f"Unknown territory/province for company-first scan: {effective_province}")

    scan = Scan(
        territory_id=territory.id,
        status="running",
        profile=f"company_first:{profile_slug}",
        max_assets=capped_max_places,
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)

    result = CompanyFirstScanResult(
        profile_slug=profile_slug,
        province=effective_province,
        zone_group=zone_group,
        max_places=capped_max_places,
        companies_found=0,
        after_blacklist_dedup=0,
        roofs_analyzed=0,
        accepted_opportunities=0,
        rejected_opportunities=0,
        status="running",
    )

    try:
        zones = _zones_for(effective_province, zone_group)
        candidates = _search_google_places(settings.google_api_key, zones, capped_max_places)
        result.companies_found = len(candidates)

        candidates = _dedupe_and_filter(candidates)[:capped_max_places]
        result.after_blacklist_dedup = len(candidates)
        scan.osm_candidates_count = result.companies_found
        db.commit()

        storage_dir = Path(settings.satellite_storage_dir) / territory.slug / f"company_scan_{scan.id}"

        for index, candidate in enumerate(candidates, start=1):
            if result.accepted_opportunities >= capped_max_results:
                break

            details = _fetch_place_details(settings.google_api_key, candidate["place_id"])
            place = {**candidate, **details}
            lat = place.get("lat")
            lon = place.get("lon")
            if lat is None or lon is None:
                result.rejected_opportunities += 1
                continue

            image_name = f"{index:03d}_{safe_asset_name(place.get('name') or place['place_id'])}.jpg"
            image_path = storage_dir / image_name
            if not fetch_satellite_image(lat, lon, image_path):
                result.rejected_opportunities += 1
                continue

            analysis = analyze_roof(image_path)
            result.roofs_analyzed += 1
            if not should_keep_analysis(analysis):
                image_path.unlink(missing_ok=True)
                result.rejected_opportunities += 1
                continue

            area_mq = int(analysis.get("superficie_mq") or 0)
            if area_mq <= 0:
                image_path.unlink(missing_ok=True)
                result.rejected_opportunities += 1
                continue

            kwp = estimate_kwp(area_mq, analysis.get("tipo_tetto", "piano"))
            if area_mq < min_area_mq or kwp < min_kwp:
                image_path.unlink(missing_ok=True)
                result.rejected_opportunities += 1
                continue
            if max_area_mq and area_mq > max_area_mq:
                image_path.unlink(missing_ok=True)
                result.rejected_opportunities += 1
                continue
            if max_kwp and kwp > max_kwp:
                image_path.unlink(missing_ok=True)
                result.rejected_opportunities += 1
                continue

            asset = persist_asset_analysis(
                db=db,
                territory=territory,
                scan=scan,
                building=_place_to_building(place, area_mq),
                analysis=analysis,
                estimated_kwp=kwp,
                satellite_image_path=str(image_path),
            )
            _persist_company_match(db, asset.id, place)
            result.accepted_opportunities += 1
            db.commit()
            time.sleep(1.0)

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


def _zones_for(province: str, zone_group: str | None) -> list[str]:
    zones = IMEL_ZONES.get(province)
    if zones is None:
        raise ValueError(f"Unsupported IM-EL province: {province}")
    if zone_group:
        wanted = zone_group.lower()
        return [zone for zone in zones if wanted in zone.lower()] or [zone_group]
    return zones


def _search_google_places(api_key: str, zones: list[str], max_places: int) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    for zone in zones:
        for keyword in IMEL_KEYWORDS:
            if len(found) >= max_places:
                return found
            params = {
                "query": f"{keyword} {zone} Piemonte",
                "key": api_key,
                "language": "it",
                "region": "it",
            }
            try:
                response = requests.get(
                    "https://maps.googleapis.com/maps/api/place/textsearch/json",
                    params=params,
                    timeout=15,
                )
                response.raise_for_status()
                payload = response.json()
            except requests.RequestException as exc:
                raise RuntimeError(f"Google Places search failed: {exc}") from exc

            status = payload.get("status")
            if status not in {"OK", "ZERO_RESULTS"}:
                message = payload.get("error_message") or status
                raise RuntimeError(f"Google Places search error: {message}")

            for item in payload.get("results", []):
                location = (item.get("geometry") or {}).get("location") or {}
                found.append(
                    {
                        "place_id": item.get("place_id"),
                        "name": item.get("name"),
                        "address": item.get("formatted_address"),
                        "types": item.get("types") or [],
                        "lat": location.get("lat"),
                        "lon": location.get("lng"),
                        "keyword": keyword,
                        "zone": zone,
                        "raw_search": item,
                    }
                )
                if len(found) >= max_places:
                    break
    return found


def _dedupe_and_filter(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    kept: list[dict[str, Any]] = []
    for candidate in candidates:
        place_id = candidate.get("place_id")
        if not place_id or place_id in seen:
            continue
        seen.add(place_id)
        name = (candidate.get("name") or "").lower()
        types = set(candidate.get("types") or [])
        if any(part in name for part in BLACKLIST_NAME_PARTS):
            continue
        if types.intersection(BLACKLIST_TYPES):
            continue
        kept.append(candidate)
    return kept


def _fetch_place_details(api_key: str, place_id: str) -> dict[str, Any]:
    params = {
        "place_id": place_id,
        "fields": "name,formatted_address,geometry,website,formatted_phone_number,types,place_id,business_status",
        "key": api_key,
        "language": "it",
    }
    try:
        response = requests.get(
            "https://maps.googleapis.com/maps/api/place/details/json",
            params=params,
            timeout=15,
        )
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        raise RuntimeError(f"Google Places details failed: {exc}") from exc

    status = payload.get("status")
    if status != "OK":
        message = payload.get("error_message") or status
        raise RuntimeError(f"Google Places details error: {message}")

    result = payload.get("result") or {}
    location = (result.get("geometry") or {}).get("location") or {}
    return {
        "name": result.get("name"),
        "address": result.get("formatted_address"),
        "website": result.get("website"),
        "phone": result.get("formatted_phone_number"),
        "types": result.get("types") or [],
        "lat": location.get("lat"),
        "lon": location.get("lng"),
        "business_status": result.get("business_status"),
        "raw_details": result,
    }


def _place_to_building(place: dict[str, Any], area_mq: int) -> dict[str, Any]:
    return {
        "osm_id": f"google_places:{place['place_id']}",
        "name": place.get("name"),
        "address": place.get("address"),
        "building_type": "industrial_company_candidate",
        "lat": place["lat"],
        "lon": place["lon"],
        "area_mq": area_mq,
        "footprint_coords": None,
        "tags": {
            "source": "google_places_company_first",
            "company_name": place.get("name"),
            "address": place.get("address"),
            "website": place.get("website"),
            "phone": place.get("phone"),
            "place_id": place.get("place_id"),
            "category": ", ".join(place.get("types") or []),
            "keyword": place.get("keyword"),
            "zone": place.get("zone"),
            "business_status": place.get("business_status"),
        },
    }


def _persist_company_match(db: Session, asset_id: int, place: dict[str, Any]) -> None:
    match = db.query(CompanyMatch).filter(CompanyMatch.asset_id == asset_id).first()
    if match is None:
        match = CompanyMatch(asset_id=asset_id)
        db.add(match)

    types = place.get("types") or []
    match.company_name = place.get("name")
    match.address = place.get("address")
    match.website = place.get("website")
    match.category = ", ".join(types[:6])
    match.source = "google_places_company_first"
    match.distance_meters = 0
    match.match_confidence = "high" if place.get("name") and place.get("address") else "medium"
    match.match_score = 88 if match.match_confidence == "high" else 68
    match.match_reason = "Company-first Google Places candidate validated by satellite roof analysis."
    match.raw_payload = {
        "place_id": place.get("place_id"),
        "phone": place.get("phone"),
        "website": place.get("website"),
        "types": types,
        "keyword": place.get("keyword"),
        "zone": place.get("zone"),
        "source": "google_places_company_first",
    }
