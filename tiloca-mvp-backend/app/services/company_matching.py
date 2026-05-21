from math import asin, cos, radians, sin, sqrt
from typing import Any

import requests
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.models.company_match import CompanyMatch
from app.models.industrial_asset import IndustrialAsset


STRONG_INDUSTRIAL_HINTS = {
    "factory",
    "industrial",
    "warehouse",
    "logistics",
    "manufacturer",
    "manufacturing",
}

WEAK_INDUSTRIAL_HINTS = {
    "storage",
}

GENERIC_HINTS = {
    "establishment",
    "point_of_interest",
    "premise",
}

EXCLUDED_HINTS = {
    "restaurant",
    "bar",
    "cafe",
    "food",
    "store",
    "supermarket",
    "school",
    "church",
    "lodging",
    "tourist_attraction",
}


def haversine_meters(lat_a: float, lon_a: float, lat_b: float, lon_b: float) -> float:
    radius = 6371000
    d_lat = radians(lat_b - lat_a)
    d_lon = radians(lon_b - lon_a)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat_a)) * cos(radians(lat_b)) * sin(d_lon / 2) ** 2
    return 2 * radius * asin(sqrt(a))


def confidence_from_score(score: int) -> str:
    if score >= 78:
        return "high"
    if score >= 52:
        return "medium"
    if score > 0:
        return "low"
    return "none"


def is_plus_code_only(value: str | None) -> bool:
    if not value:
        return False
    text = value.strip()
    if "," in text:
        return False
    parts = text.split()
    return bool(parts and "+" in parts[0] and any(char.isdigit() for char in parts[0]))


def is_real_address(value: str | None) -> bool:
    return bool(value and value.strip() and not is_plus_code_only(value))


def has_strong_name(value: str | None) -> bool:
    if not value:
        return False
    text = value.strip()
    letters = sum(1 for char in text if char.isalpha())
    return len(text) >= 4 and letters >= 3


def category_strength(categories: set[str]) -> str:
    if categories & STRONG_INDUSTRIAL_HINTS:
        return "strong"
    if categories & WEAK_INDUSTRIAL_HINTS:
        return "weak"
    if categories and categories <= GENERIC_HINTS:
        return "generic"
    if categories & GENERIC_HINTS:
        return "generic_mixed"
    return "none"


def confidence_from_factors(
    score: int,
    distance_meters: float | None,
    name: str | None,
    address: str | None,
    strength: str,
) -> str:
    if score <= 0:
        return "none"

    plus_code_address = is_plus_code_only(address)
    real_address = is_real_address(address)
    strong_name = has_strong_name(name)
    strong_category = strength == "strong"
    relevant_category = strength in {"strong", "weak"}

    if (
        score >= 78
        and distance_meters is not None
        and distance_meters <= 75
        and strong_category
        and strong_name
        and (real_address or strong_name)
        and not plus_code_address
    ):
        return "high"

    if (
        score >= 52
        and distance_meters is not None
        and distance_meters <= 150
        and strong_name
        and relevant_category
    ):
        return "medium"

    return "low"


def reason_from_factors(
    distance_meters: float | None,
    category: str | None,
    address: str | None,
    confidence: str,
) -> str:
    reasons = []
    if distance_meters is not None:
        reasons.append(f"{round(distance_meters)}m away")
    if category:
        categories = {item.strip() for item in category.split(",") if item.strip()}
        strength = category_strength(categories)
        if strength == "strong":
            reasons.append("industrial/company-like category")
        elif strength == "weak":
            reasons.append("weakly relevant category")
        elif strength in {"generic", "generic_mixed"}:
            reasons.append("generic category")
        else:
            reasons.append("category not clearly industrial")
    if is_plus_code_only(address):
        reasons.append("plus-code address")
    elif not address:
        reasons.append("missing address")
    if confidence in {"low", "medium"}:
        reasons.append("needs manual verification")
    return ", ".join(reasons) or "Company match scored from available signals"


def metadata_match_candidate(asset: IndustrialAsset) -> dict[str, Any] | None:
    metadata = asset.industrial_metadata or {}
    name = asset.name or metadata.get("name") or metadata.get("operator") or metadata.get("brand")
    address = asset.address or metadata.get("addr:full") or metadata.get("address")
    category = asset.building_type or metadata.get("building")
    if not name and not address:
        return None

    score = 35
    reasons = []
    if name:
        score += 25
        reasons.append("company/name present in asset metadata")
    if address:
        score += 15
        reasons.append("address present in asset metadata")
    categories = {str(category).lower()} if category else set()
    if category and category_strength(categories) in {"strong", "weak"}:
        score += 15
        reasons.append("industrial building category present")

    confidence = confidence_from_factors(score, 0, str(name) if name else None, str(address) if address else None, category_strength(categories))

    return {
        "company_name": str(name) if name else None,
        "address": str(address) if address else None,
        "website": metadata.get("website"),
        "category": str(category) if category else None,
        "source": "asset_metadata",
        "distance_meters": 0,
        "match_score": min(score, 100),
        "match_confidence": confidence,
        "match_reason": "; ".join(reasons) or "Matched from existing asset metadata",
        "raw_payload": {"asset_metadata": metadata},
    }


def reverse_geocode_candidate(asset: IndustrialAsset) -> dict[str, Any] | None:
    try:
        response = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={
                "format": "jsonv2",
                "lat": asset.lat,
                "lon": asset.lon,
                "zoom": 18,
                "addressdetails": 1,
            },
            headers={"User-Agent": "TilocaCompanyMatching/0.1"},
            timeout=8,
        )
        if response.status_code != 200:
            return None
        payload = response.json()
    except (requests.RequestException, ValueError):
        return None

    address = payload.get("display_name")
    name = payload.get("name") or payload.get("address", {}).get("industrial")
    category = payload.get("category") or payload.get("type")
    if not name and not address:
        return None

    score = 30
    if name:
        score += 20
    if address:
        score += 15
    categories = {str(category).lower()} if category else set()
    if category and category_strength(categories) in {"strong", "weak"}:
        score += 15

    confidence = confidence_from_factors(score, None, name, address, category_strength(categories))

    return {
        "company_name": name,
        "address": address,
        "website": None,
        "category": category,
        "source": "nominatim_reverse",
        "distance_meters": None,
        "match_score": min(score, 80),
        "match_confidence": confidence,
        "match_reason": reason_from_factors(None, str(category) if category else None, address, confidence),
        "raw_payload": payload,
    }


def google_places_candidates(asset: IndustrialAsset, radius: int) -> list[dict[str, Any]]:
    settings = get_settings()
    if not settings.google_api_key:
        return []
    try:
        response = requests.get(
            "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
            params={
                "location": f"{asset.lat},{asset.lon}",
                "radius": radius,
                "key": settings.google_api_key,
            },
            timeout=10,
        )
        payload = response.json()
    except (requests.RequestException, ValueError):
        return []

    if payload.get("status") not in {"OK", "ZERO_RESULTS"}:
        return [
            {
                "company_name": None,
                "address": None,
                "website": None,
                "category": None,
                "source": "google_places",
                "distance_meters": None,
                "match_score": 0,
                "match_reason": f"Google Places unavailable: {payload.get('status', 'unknown')}",
                "raw_payload": payload,
            }
        ]

    candidates = []
    for place in payload.get("results", []):
        types = set(place.get("types", []))
        if types & EXCLUDED_HINTS:
            continue
        strength = category_strength(types)
        location = place.get("geometry", {}).get("location", {})
        distance = None
        if "lat" in location and "lng" in location:
            distance = haversine_meters(asset.lat, asset.lon, location["lat"], location["lng"])

        name = place.get("name")
        address = place.get("vicinity") or place.get("plus_code", {}).get("compound_code")
        score = 0
        if has_strong_name(name):
            score += 20
        elif name:
            score += 10
        if is_real_address(address):
            score += 20
        elif is_plus_code_only(address):
            score += 3
        if strength == "strong":
            score += 25
        elif strength == "weak":
            score += 10
        elif strength in {"generic", "generic_mixed"}:
            score -= 10
        if distance is not None:
            if distance <= 50:
                score += 25
            elif distance <= 75:
                score += 18
            elif distance <= 150:
                score += 10
            elif distance <= 250:
                score += 2

        score = max(min(score, 100), 0)
        if distance is not None and distance > 150:
            score = min(score, 49)
        if is_plus_code_only(address):
            score = min(score, 68)
        if strength in {"generic", "generic_mixed", "none"}:
            score = min(score, 55)
        confidence = confidence_from_factors(score, distance, name, address, strength)
        category = ", ".join(place.get("types", [])[:5])

        candidates.append(
            {
                "company_name": name,
                "address": address,
                "website": None,
                "category": category,
                "source": "google_places",
                "distance_meters": round(distance, 1) if distance is not None else None,
                "match_score": score,
                "match_confidence": confidence,
                "match_reason": reason_from_factors(distance, category, address, confidence),
                "raw_payload": place,
            }
        )
    return candidates


def persist_match(db: Session, asset: IndustrialAsset, candidate: dict[str, Any]) -> CompanyMatch:
    match = asset.company_match
    if match is None:
        match = CompanyMatch(asset_id=asset.id)
        db.add(match)

    match.company_name = candidate.get("company_name")
    match.address = candidate.get("address")
    match.website = candidate.get("website")
    match.category = candidate.get("category")
    match.source = candidate.get("source") or "none"
    match.distance_meters = candidate.get("distance_meters")
    match.match_score = int(candidate.get("match_score") or 0)
    match.match_confidence = candidate.get("match_confidence") or confidence_from_score(match.match_score)
    match.match_reason = candidate.get("match_reason")
    match.raw_payload = candidate.get("raw_payload")
    db.commit()
    db.refresh(match)
    return match


def match_company_for_asset(db: Session, asset_id: int) -> CompanyMatch:
    asset = (
        db.query(IndustrialAsset)
        .options(selectinload(IndustrialAsset.company_match))
        .filter(IndustrialAsset.id == asset_id)
        .first()
    )
    if asset is None:
        raise ValueError(f"Asset not found: {asset_id}")

    candidates: list[dict[str, Any]] = []
    metadata_candidate = metadata_match_candidate(asset)
    if metadata_candidate:
        candidates.append(metadata_candidate)

    reverse_candidate = reverse_geocode_candidate(asset)
    if reverse_candidate:
        candidates.append(reverse_candidate)

    google_failures: list[dict[str, Any]] = []
    for radius in (100, 250):
        google_candidates = google_places_candidates(asset, radius)
        google_failures.extend([candidate for candidate in google_candidates if candidate["match_score"] == 0])
        candidates.extend([candidate for candidate in google_candidates if candidate["match_score"] > 0])
        if candidates and max(candidate["match_score"] for candidate in candidates) >= 78:
            break

    if candidates:
        best = max(candidates, key=lambda candidate: candidate["match_score"])
        best["raw_payload"] = {
            "best": best.get("raw_payload"),
            "candidate_count": len(candidates),
            "failed_sources": google_failures,
        }
        return persist_match(db, asset, best)

    reason = "No reliable company found from metadata, reverse geocoding, or nearby search"
    if google_failures:
        reason = google_failures[-1].get("match_reason") or reason
    return persist_match(
        db,
        asset,
        {
            "company_name": None,
            "address": None,
            "website": None,
            "category": None,
            "source": "none",
            "distance_meters": None,
            "match_score": 0,
            "match_reason": reason,
            "raw_payload": {"failed_sources": google_failures},
        },
    )
