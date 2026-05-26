from __future__ import annotations

import argparse
import json
import sys
from typing import Any

import requests

from app.core.config import get_settings
from app.services.openapi_company_parser import company_address, company_coordinates, company_name
from app.services.openapi_company_scan import _extract_companies


def main() -> int:
    parser = argparse.ArgumentParser(description="Diagnose OpenAPI Company IT-search payload variants.")
    parser.add_argument("--province", default="TO", help="Province code or slug, e.g. TO or CN.")
    parser.add_argument("--production", action="store_true", help="Use configured production base URL.")
    parser.add_argument(
        "--confirm-production",
        action="store_true",
        help="Required with --production. Limit remains fixed at 2.",
    )
    args = parser.parse_args()

    settings = get_settings()
    if args.production and not args.confirm_production:
        print("FAIL  --production requires --confirm-production. No request sent.")
        return 1

    token = (settings.openapi_company_token or "").strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    if not token:
        print("FAIL  OPENAPI_COMPANY_TOKEN is missing. No request sent.")
        return 1

    base_url = _production_base_url() if args.production else _sandbox_base_url()
    url = f"{base_url}/{settings.openapi_company_it_search_path.lstrip('/')}"
    province = _province_code(args.province)
    variants = _payload_variants(province, dry_run=not args.production)

    print("Tiloca OpenAPI IT-search query diagnostic")
    print("=========================================")
    print(f"Mode: {'production' if args.production else 'sandbox dry-run'}")
    print(f"URL: {url}")
    print(f"dryRun included: {'no' if args.production else 'yes'}")
    print("limit: 2")
    print("DB writes: false")
    print("Token: configured, not printed")
    print("")

    exit_code = 0
    for name, payload in variants:
        print(f"VARIANT {name}")
        print(f"request_url: {url}")
        print(f"request_payload: {json.dumps(payload, ensure_ascii=False)}")
        result = _call_it_search(url, token, payload)
        print(f"status_code: {result['status_code']}")
        if result["error"]:
            print(f"error: {result['error']}")
            exit_code = 1
        companies = _extract_companies(result["data"])
        print(f"companies_returned_count: {len(companies)}")
        for index, company in enumerate(companies[:2], start=1):
            print(f"company_{index}_name: {company_name(company) or '-'}")
            print(f"company_{index}_address_exists: {bool(company_address(company))}")
            print(f"company_{index}_coordinates_exists: {bool(company_coordinates(company))}")
        print("")

    return exit_code


def _payload_variants(province: str, dry_run: bool) -> list[tuple[str, dict[str, Any]]]:
    base = {"province": province, "limit": 2, "dataEnrichment": "address"}
    if dry_run:
        base["dryRun"] = 1
    return [
        ("province_only", dict(base)),
        ("province_ateco_dot", {**base, "atecoCode": "25.62"}),
        ("province_ateco_plain", {**base, "atecoCode": "2562"}),
        (
            "province_ateco_dot_employees",
            {**base, "atecoCode": "25.62", "minEmployees": 5, "maxEmployees": 80},
        ),
    ]


def _call_it_search(url: str, token: str, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        response = requests.get(
            url,
            headers={"accept": "application/json", "Authorization": f"Bearer {token}"},
            params=payload,
            timeout=30,
        )
    except requests.RequestException as exc:
        return {"status_code": "request_failed", "data": None, "error": str(exc)}

    try:
        data: Any = response.json()
    except ValueError:
        data = {"raw_text": response.text[:1000]}
    error = None if response.ok else response.text[:500]
    return {"status_code": response.status_code, "data": data, "error": error}


def _sandbox_base_url() -> str:
    return "https://test.company.openapi.com"


def _production_base_url() -> str:
    return "https://company.openapi.com"


def _province_code(value: str) -> str:
    codes = {"torino": "TO", "to": "TO", "cuneo": "CN", "cn": "CN"}
    return codes.get(value.lower(), value.upper())


if __name__ == "__main__":
    sys.exit(main())
