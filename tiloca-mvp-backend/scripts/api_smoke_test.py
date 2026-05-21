from __future__ import annotations

import json
import sys
from typing import Any

import requests


API_BASE = "http://127.0.0.1:8000"


def pass_step(message: str) -> None:
    print(f"PASS  {message}")


def fail_step(message: str) -> None:
    print(f"FAIL  {message}")


def request_json(method: str, path: str, **kwargs: Any) -> Any:
    response = requests.request(method, f"{API_BASE}{path}", timeout=120, **kwargs)
    if response.status_code >= 400:
        raise RuntimeError(f"{method} {path} failed: {response.status_code} {response.text[:500]}")
    if not response.content:
        return None
    return response.json()


def main() -> int:
    print("Tiloca API smoke test")
    print("=====================")

    try:
        health = request_json("GET", "/health")
        if health.get("status") != "ok":
            raise RuntimeError(f"Unexpected health payload: {health}")
        pass_step("Backend health")

        enrichment = request_json("GET", "/enrichment/openapi/test")
        if enrichment.get("provider") != "openapi_company":
            raise RuntimeError(f"Unexpected OpenAPI Company payload: {enrichment}")
        config = enrichment.get("config") or {}
        if config.get("token_exposed") is not False:
            raise RuntimeError("OpenAPI Company endpoint did not confirm token masking.")
        pass_step(f"OpenAPI Company adapter ({enrichment.get('status')})")

        territories = request_json("GET", "/territories")
        if not territories:
            raise RuntimeError("No territories returned. Run migrations and seed territories.")
        pass_step(f"Territories loaded ({len(territories)})")

        territory = "parma"
        if not any(item.get("slug") == territory for item in territories):
            territory = territories[0]["slug"]

        assets = request_json("GET", f"/assets?territory={territory}&limit=10")
        pass_step(f"Assets endpoint reachable ({len(assets)} returned for {territory})")

        print(f"RUN   Minimal API scan: territory={territory} max_assets=1")
        scan = request_json(
            "POST",
            f"/scan/{territory}",
            json={
                "max_assets": 1,
                "min_area_mq": 2000,
                "min_kwp": 300,
                "suitability_levels": ["alta", "media"],
            },
        )
        if scan.get("status") != "completed":
            raise RuntimeError(f"Scan did not complete: {json.dumps(scan, ensure_ascii=False)}")
        pass_step(f"Scan endpoint completed (scan_id={scan.get('id')})")

        assets = request_json("GET", f"/assets?territory={territory}&limit=10")
        if not assets:
            raise RuntimeError("No assets available after scan. Candidate may have been rejected; retry with max_assets=3.")
        asset_id = assets[0]["id"]
        pass_step(f"Assets available for endpoint checks (asset_id={asset_id})")

        detail = request_json("GET", f"/assets/{asset_id}")
        if detail.get("id") != asset_id:
            raise RuntimeError("Asset detail endpoint returned the wrong asset.")
        pass_step("Asset detail endpoint")

        old_state = (detail.get("pipeline_state") or {}).get("state") or "new"
        updated = request_json(
            "PATCH",
            f"/assets/{asset_id}/state",
            json={"state": "needs_review", "reason": "API smoke test"},
        )
        if (updated.get("pipeline_state") or {}).get("state") != "needs_review":
            raise RuntimeError("State update did not persist needs_review.")
        request_json(
            "PATCH",
            f"/assets/{asset_id}/state",
            json={"state": old_state, "reason": "API smoke test restore"},
        )
        pass_step("State update endpoint")

        match = request_json("POST", f"/assets/{asset_id}/match-company")
        if "match_confidence" not in match:
            raise RuntimeError(f"Company match response missing confidence: {match}")
        pass_step(f"Company match endpoint ({match.get('match_confidence')}, score={match.get('match_score')})")

        refreshed = request_json("GET", f"/assets/{asset_id}")
        if "company_match" not in refreshed:
            raise RuntimeError("Asset detail does not expose company_match.")
        pass_step("Asset detail exposes company_match")

        print("=====================")
        print("PASS  API smoke validation completed")
        return 0
    except Exception as exc:
        fail_step(str(exc))
        return 1


if __name__ == "__main__":
    sys.exit(main())
