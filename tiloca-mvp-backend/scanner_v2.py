#!/usr/bin/env python3
"""Transition CLI for Tiloca scanner v2.

This keeps the scanner executable while the operational backend becomes the
source of truth. It runs the same scan pipeline used by POST /scan/{territory}.
"""

from app.core.database import SessionLocal
from app.core.seed import seed_default_territories
from app.services.scan_service import run_scan


def main() -> None:
    territory = input("Scegli territorio [parma]: ").strip() or "parma"
    max_assets_raw = input("Max edifici da analizzare [30]: ").strip() or "30"
    max_assets = int(max_assets_raw)

    db = SessionLocal()
    try:
        seed_default_territories(db)
        scan = run_scan(db, territory, max_assets=max_assets)
        print("\nTILOCA SCAN COMPLETATO")
        print(f"Scan ID: {scan.id}")
        print(f"Status: {scan.status}")
        print(f"OSM candidates: {scan.osm_candidates_count}")
        print(f"Analyzed: {scan.analyzed_count}")
        print(f"Persisted assets: {scan.persisted_count}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
