from __future__ import annotations

import time
from typing import Any

import requests


API_BASE = "http://127.0.0.1:8000"


def pass_step(message: str) -> None:
    print(f"PASS  {message}")


def fail_step(message: str) -> None:
    print(f"FAIL  {message}")


def request_json(method: str, path: str, **kwargs: Any) -> Any:
    response = requests.request(method, f"{API_BASE}{path}", timeout=180, **kwargs)
    if response.status_code >= 400:
        raise RuntimeError(f"{method} {path} failed: {response.status_code} {response.text[:500]}")
    return response.json()


def main() -> int:
    print("Tiloca delivery smoke test")
    print("==========================")

    try:
        suffix = int(time.time())
        payload = {
            "client_name": f"Delivery Smoke Test {suffix}",
            "target_provinces": ["torino"],
            "criteria": {
                "ateco_codes": ["25.62"],
                "min_area_mq": 2000,
                "max_area_mq": 30000,
                "min_kwp": 300,
                "max_kwp": 2500,
                "min_employees": 5,
                "max_employees": 80,
                "limit": 2,
                "dryRun": True,
            },
            "status": "draft",
            "target_opportunity_count": 2,
            "notes": "Temporary smoke-test delivery.",
        }

        delivery = request_json("POST", "/deliveries", json=payload)
        slug = delivery["slug"]
        if not slug:
            raise RuntimeError("Delivery create response missing slug.")
        pass_step(f"Delivery created ({slug})")

        deliveries = request_json("GET", "/deliveries")
        if not any(item.get("slug") == slug for item in deliveries):
            raise RuntimeError("Created delivery not present in delivery list.")
        pass_step("Delivery appears in list")

        scan = request_json("POST", f"/deliveries/{slug}/run-openapi-scan")
        if scan.get("new_asset_count") != 0:
            raise RuntimeError(f"Dry-run delivery scan should not associate assets: {scan}")
        pass_step("Delivery OpenAPI dry-run completed without asset persistence")

        assets = request_json("GET", f"/deliveries/{slug}/assets")
        if assets.get("assets"):
            raise RuntimeError("Dry-run delivery unexpectedly returned associated assets.")
        pass_step("Delivery assets remain empty after dry-run")

        print("==========================")
        print("PASS  Delivery smoke validation completed")
        return 0
    except Exception as exc:
        fail_step(str(exc))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
