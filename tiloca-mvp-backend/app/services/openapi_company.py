from __future__ import annotations

from typing import Any

import requests

from app.core.config import get_settings


def get_public_openapi_company_config() -> dict[str, Any]:
    settings = get_settings()
    return {
        "provider": "openapi_company",
        "base_url": settings.openapi_company_base_url,
        "base_url_configured": bool(settings.openapi_company_base_url),
        "token_configured": bool(settings.openapi_company_token),
        "sandbox": settings.openapi_company_sandbox,
        "dry_run": settings.openapi_company_dry_run,
        "search_path": settings.openapi_company_search_path,
        "it_search_path": settings.openapi_company_it_search_path,
        "nearby_path": settings.openapi_company_nearby_path,
        "details_path": settings.openapi_company_details_path,
        "token_exposed": False,
    }


def search_companies_by_province_ateco(
    province: str,
    ateco_codes: list[str] | None = None,
    dry_run: bool = True,
) -> dict[str, Any]:
    payload = {
        "province": province.upper(),
        "ateco_codes": ateco_codes or [],
        "count_only": True,
        "limit": 0,
    }
    return _safe_company_request(
        action="search_companies_by_province_ateco",
        method="POST",
        path=get_settings().openapi_company_search_path,
        payload=payload,
        dry_run=dry_run,
    )


def search_companies_near_coordinates(
    lat: float,
    lon: float,
    radius_meters: int,
    ateco_codes: list[str] | None = None,
    dry_run: bool = True,
) -> dict[str, Any]:
    payload = {
        "lat": lat,
        "lon": lon,
        "radius_meters": radius_meters,
        "ateco_codes": ateco_codes or [],
        "count_only": True,
        "limit": 0,
    }
    return _safe_company_request(
        action="search_companies_near_coordinates",
        method="POST",
        path=get_settings().openapi_company_nearby_path,
        payload=payload,
        dry_run=dry_run,
    )


def get_company_details(company_id_or_vat: str, dry_run: bool = True) -> dict[str, Any]:
    path = get_settings().openapi_company_details_path.format(
        company_id_or_vat=company_id_or_vat
    )
    return _safe_company_request(
        action="get_company_details",
        method="GET",
        path=path,
        payload=None,
        dry_run=True if dry_run else get_settings().openapi_company_dry_run,
    )


def _safe_company_request(
    action: str,
    method: str,
    path: str,
    payload: dict[str, Any] | None,
    dry_run: bool,
) -> dict[str, Any]:
    settings = get_settings()
    public_config = get_public_openapi_company_config()

    if not settings.openapi_company_base_url or not settings.openapi_company_token:
        return {
            "status": "missing_config",
            "action": action,
            "config": public_config,
            "reason": "OPENAPI_COMPANY_BASE_URL and OPENAPI_COMPANY_TOKEN are required before calling OpenAPI Company.",
            "request": _planned_request(method, path, payload),
        }

    effective_dry_run = dry_run or settings.openapi_company_dry_run
    guarded_payload = _with_guard_fields(payload)

    if effective_dry_run:
        return {
            "status": "dry_run",
            "action": action,
            "config": public_config,
            "reason": "Dry-run is enabled; no OpenAPI Company network request was sent.",
            "request": _planned_request(method, path, guarded_payload),
        }

    try:
        response = requests.request(
            method=method,
            url=_build_url(path),
            headers=_headers(),
            json=guarded_payload if method.upper() != "GET" else None,
            timeout=20,
        )
    except requests.RequestException as exc:
        return {
            "status": "request_failed",
            "action": action,
            "config": public_config,
            "reason": str(exc),
            "request": _planned_request(method, path, guarded_payload),
        }

    if not response.ok:
        return {
            "status": "api_error",
            "action": action,
            "config": public_config,
            "http_status": response.status_code,
            "reason": _classify_api_error(response),
            "request": _planned_request(method, path, guarded_payload),
        }

    try:
        data: Any = response.json()
    except ValueError:
        data = {"raw_text": response.text[:1000]}

    return {
        "status": "ok",
        "action": action,
        "config": public_config,
        "request": _planned_request(method, path, guarded_payload),
        "data": data,
    }


def _with_guard_fields(payload: dict[str, Any] | None) -> dict[str, Any] | None:
    if payload is None:
        return None

    settings = get_settings()
    guarded = dict(payload)
    guarded["sandbox"] = settings.openapi_company_sandbox
    guarded["count_only"] = True
    guarded["limit"] = 0
    return guarded


def _planned_request(method: str, path: str, payload: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "method": method.upper(),
        "url": _build_url(path),
        "json": payload,
        "headers": {
            "Authorization": "Bearer ***",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    }


def _build_url(path: str) -> str:
    settings = get_settings()
    return f"{settings.openapi_company_base_url.rstrip('/')}/{path.lstrip('/')}"


def _headers() -> dict[str, str]:
    token = (get_settings().openapi_company_token or "").strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def _classify_api_error(response: requests.Response) -> str:
    detail = response.text[:500]

    if response.status_code in {401, 403}:
        return f"Authentication, permission, or sandbox access error from OpenAPI Company. Detail: {detail}"

    if response.status_code == 402:
        return f"Payment or credit requirement from OpenAPI Company. Detail: {detail}"

    if response.status_code == 404:
        return f"Endpoint not found. Check OPENAPI_COMPANY_BASE_URL and adapter path configuration. Detail: {detail}"

    return f"OpenAPI Company returned HTTP {response.status_code}. Detail: {detail}"
