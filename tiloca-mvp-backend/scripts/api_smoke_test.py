from __future__ import annotations

import sys
import time
from typing import Any
from urllib import error, request


API_BASE = "http://127.0.0.1:8000"


def pass_step(message: str) -> None:
    print(f"PASS  {message}")


def fail_step(message: str) -> None:
    print(f"FAIL  {message}")


def request_json(method: str, path: str, **kwargs: Any) -> Any:
    body = kwargs.get("json")
    headers = {"Accept": "application/json"}
    data = None
    if body is not None:
        import json

        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = request.Request(f"{API_BASE}{path}", data=data, headers=headers, method=method)
    try:
        with request.urlopen(req, timeout=60) as response:
            content = response.read()
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} failed: {exc.code} {detail[:500]}") from exc
    if not content:
        return None
    import json

    return json.loads(content.decode("utf-8"))


def main() -> int:
    print("Tiloca API smoke test")
    print("=====================")

    try:
        health = request_json("GET", "/health")
        if health.get("status") != "ok":
            raise RuntimeError(f"Unexpected health payload: {health}")
        pass_step("GET /health")

        territories = request_json("GET", "/territories")
        if not isinstance(territories, list) or not territories:
            raise RuntimeError("No territories returned. Run migrations and seed territories.")
        pass_step(f"GET /territories ({len(territories)} returned)")

        assets = request_json("GET", "/assets?limit=10")
        if not isinstance(assets, list):
            raise RuntimeError(f"Assets endpoint did not return a list: {assets}")
        pass_step(f"GET /assets ({len(assets)} returned)")

        deliveries = request_json("GET", "/deliveries")
        if not isinstance(deliveries, list):
            raise RuntimeError(f"Deliveries endpoint did not return a list: {deliveries}")
        pass_step(f"GET /deliveries ({len(deliveries)} returned)")

        suffix = int(time.time())
        create_payload = {
            "client_name": f"API Smoke Test {suffix}",
            "target_provinces": ["torino"],
            "criteria": {
                "ateco_codes": ["25.62"],
                "min_area_mq": 2000,
                "max_area_mq": 30000,
                "min_kwp": 300,
                "max_kwp": 2500,
                "limit": 2,
                "dryRun": True,
            },
            "status": "draft",
            "target_opportunity_count": 2,
            "notes": "Temporary API smoke-test delivery.",
        }
        delivery = request_json("POST", "/deliveries", json=create_payload)
        slug = delivery.get("slug")
        if not slug:
            raise RuntimeError(f"Delivery create response missing slug: {delivery}")
        pass_step(f"POST /deliveries ({slug})")

        detail = request_json("GET", f"/deliveries/{slug}")
        if detail.get("slug") != slug:
            raise RuntimeError(f"Delivery detail returned wrong slug: {detail}")
        pass_step("GET /deliveries/{slug}")

        delivery_assets = request_json("GET", f"/deliveries/{slug}/assets")
        if "assets" not in delivery_assets or not isinstance(delivery_assets["assets"], list):
            raise RuntimeError(f"Delivery assets response is invalid: {delivery_assets}")
        pass_step(f"GET /deliveries/{{slug}}/assets ({len(delivery_assets['assets'])} linked)")

        print("=====================")
        print("PASS  API smoke validation completed")
        return 0
    except Exception as exc:
        fail_step(str(exc))
        return 1


if __name__ == "__main__":
    sys.exit(main())
