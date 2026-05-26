# Tiloca Changelog

## [3.23] - 2026-05-22
OpenAPI production safety hardening.
- Hardened OpenAPI Company parsing for nested `address.registeredOffice.*` response shapes
- Added configurable `dataEnrichment` with safe default `address`; `advanced` remains opt-in
- Added production scan limit guard with `confirmProduction` requirement above limit 10
- Added OpenAPI scan observability counters for address/coordinate coverage and skipped records
- Added parser validation script with mocked OpenAPI response shapes
- Updated OpenAPI readiness and runbook documentation for safe production micro-tests

## [3.19] - 2026-05-22
Stabilization and regression audit.
- Repaired API smoke test scope around core health, territories, assets, and delivery endpoints
- Documented Alembic migration chain 0001 -> 0002 -> 0003
- Added docs/ARCHITECTURE_AUDIT.md with models, endpoints, frontend routes, fragile areas, and do-not-touch areas
- Added frontend build validation command to stabilization notes
- No UI, endpoint, OpenAPI behavior, or product logic changes

## [3.18] - 2026-05-22
Stabilization pass.
- Translated UI to Italian throughout
- Removed "Available territories" from Home
- Added /territories list route
- New NavBar component on all routes
- Fixed "Nuova scansione" button to open scan config modal
- Deprecated /operations with warning banner
- Added data context banner to Territory Overview

## [3.17] - 2026-05-21
Territory Overview view.
- New GET /territories/{slug}/overview endpoint
- New /territories/[slug] frontend route
- Aggregated stats: buildings, idoneous roof, no-FV, MWp total
- Recharts-style visualizations

## [3.16] - 2026-05-21
Color-coded pins + perimeter drawing.
- Color-coded pins by suitability (alta/media/bassa)
- Custom perimeter drawing on map
- Asset count overlay for drawn area

## [3.14-3.15] - 2026-05-20
Delivery-centric refactor.
- New Delivery model + delivery_assets join table
- New 3-view frontend: Home / Delivery Workspace / Operations
- 8 new endpoints for delivery CRUD + scan + asset linking
