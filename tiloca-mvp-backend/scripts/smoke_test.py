from __future__ import annotations

import sys

from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError

from app.core.checks import (
    LocalValidationError,
    check_database_connection,
    check_postgis_enabled,
    require_api_keys,
)

def pass_step(message: str) -> None:
    print(f"PASS  {message}")


def fail_step(message: str) -> None:
    print(f"FAIL  {message}")


def main() -> int:
    print("Tiloca Phase 1 smoke test")
    print("==========================")

    try:
        from app.core.database import SessionLocal
        from app.models.asset_analysis import AssetAnalysis
        from app.models.asset_pipeline_state import AssetPipelineState
        from app.models.company_match import CompanyMatch
        from app.models.industrial_asset import IndustrialAsset
        from app.models.territory import Territory
        from app.services.company_matching import match_company_for_asset
        from app.services.scan_service import run_scan
    except RuntimeError as exc:
        fail_step(str(exc))
        return 1

    db = SessionLocal()
    try:
        check_database_connection(db)
        pass_step("Database connection")

        postgis_version = check_postgis_enabled(db)
        pass_step(f"PostGIS enabled ({postgis_version})")

        require_api_keys()
        pass_step("API keys configured")

        territory_count = db.query(func.count(Territory.id)).scalar() or 0
        if territory_count == 0:
            raise LocalValidationError(
                "No territories found. Run: python -m scripts.seed_territories"
            )
        pass_step(f"Territories exist ({territory_count})")

        parma = db.query(Territory).filter(Territory.slug == "parma").first()
        if parma is None:
            raise LocalValidationError(
                "Territory 'parma' not found. Run: python -m scripts.seed_territories"
            )

        print("RUN   Minimal scan: territory=parma max_assets=1")
        scan = run_scan(db, "parma", max_assets=1)
        if scan.status != "completed":
            raise LocalValidationError(f"Scan did not complete. status={scan.status}")
        pass_step(f"Scan completed (scan_id={scan.id})")

        analysis_count = (
            db.query(func.count(AssetAnalysis.id))
            .filter(AssetAnalysis.scan_id == scan.id)
            .scalar()
            or 0
        )
        if analysis_count < 1:
            raise LocalValidationError(
                "Scan completed but no asset_analysis rows were persisted. "
                "The first OSM candidate may have been rejected by vision analysis; "
                "try again with max_assets=3 after validating keys and quota."
            )
        pass_step(f"Asset analysis persisted ({analysis_count})")

        asset_count = db.query(func.count(IndustrialAsset.id)).scalar() or 0
        if asset_count < 1:
            raise LocalValidationError("No industrial_assets rows found after scan.")
        pass_step(f"Industrial assets persisted ({asset_count} total)")

        asset = db.query(IndustrialAsset).order_by(IndustrialAsset.id.desc()).first()
        if asset is None:
            raise LocalValidationError("No asset available for state/company validation.")

        old_state = asset.pipeline_state.state if asset.pipeline_state else "new"
        state = asset.pipeline_state
        if state is None:
            state = AssetPipelineState(asset_id=asset.id)
            db.add(state)
        state.state = "needs_review"
        state.reason = "Smoke test state update"
        db.commit()
        db.refresh(state)
        if state.state != "needs_review":
            raise LocalValidationError("Asset pipeline state update did not persist.")
        state.state = old_state
        state.reason = "Smoke test restore"
        db.commit()
        pass_step("Asset pipeline state update")

        match = match_company_for_asset(db, asset.id)
        if match.match_confidence not in {"high", "medium", "low", "none"}:
            raise LocalValidationError("Company match returned invalid confidence.")
        match_count = db.query(func.count(CompanyMatch.id)).scalar() or 0
        pass_step(f"Company match persisted ({match.match_confidence}, {match_count} total)")

        print("==========================")
        print("PASS  Phase 1 backend validation completed")
        return 0
    except LocalValidationError as exc:
        fail_step(str(exc))
        return 1
    except SQLAlchemyError as exc:
        fail_step(f"Database error: {exc}")
        return 1
    except Exception as exc:
        fail_step(f"Unexpected error: {exc}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
