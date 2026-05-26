# Tiloca Architecture Audit

Phase 3.19 stabilization snapshot. This document describes the current delivery-centric MVP without introducing product changes.

## Current Models

Backend models live in `tiloca-mvp-backend/app/models`.

- `Territory`: province or operational territory with bounding box, geometry, and default scan thresholds.
- `Scan`: historical territory scan event with candidate, analyzed, persisted, rejected, and skipped counts.
- `IndustrialAsset`: core Tiloca entity. Represents a roof/building asset with geospatial coordinates, area, kWp estimate, suitability, image path, and industrial metadata.
- `AssetAnalysis`: scan-time roof intelligence for one asset, including roof quality, obstacles, FV presence, suitability, and raw vision output.
- `AssetPipelineState`: internal production state for delivery work: `new`, `needs_review`, `qualified`, `report_ready`, `excluded`.
- `CompanyMatch`: persisted probable company/address match for one industrial asset.
- `Delivery`: client delivery workspace with slug, client name, target provinces, criteria, status, target opportunity count, and notes.
- `DeliveryAsset`: join table that links global assets to a specific delivery without duplicating or deleting the asset.

## Alembic Migration Chain

Migration files live in `tiloca-mvp-backend/migrations/versions`.

- `0001_initial_schema`: territories, scans, industrial_assets, asset_analysis, asset_pipeline_state, PostGIS extension.
- `0002_company_matches`: company_matches table and indexes.
- `0003_delivery_model`: deliveries table, delivery_assets join table, delivery status/reason enums and indexes.

Expected upgrade command:

```powershell
cd C:\Users\Ermias\Documents\Codex\2026-05-13\files-mentioned-by-the-user-tiloca\tiloca-mvp-backend
.\.venv\Scripts\python.exe -m alembic upgrade head
```

## Current Endpoints

Core health and territory endpoints:

- `GET /health`
- `GET /territories`
- `GET /territories/{slug}/overview`

Asset endpoints:

- `GET /assets`
- `GET /assets/{asset_id}`
- `PATCH /assets/{asset_id}/state`
- `POST /assets/{asset_id}/match-company`

Delivery endpoints:

- `GET /deliveries`
- `POST /deliveries`
- `GET /deliveries/{slug}`
- `PATCH /deliveries/{slug}`
- `GET /deliveries/{slug}/assets`
- `POST /deliveries/{slug}/run-openapi-scan`
- `POST /deliveries/{slug}/include-asset`
- `DELETE /deliveries/{slug}/exclude-asset/{asset_id}`

Scan and enrichment endpoints:

- `POST /scan/{territory}`
- `POST /company-scan/{profile_slug}`
- `POST /company-scan/openapi`
- `GET /enrichment/openapi/test`
- `GET /debug/openapi-config` temporary debug endpoint; never exposes full token.

Static storage:

- `GET /storage/...` serves local satellite image files.

## Current Frontend Routes

Frontend routes live in `tiloca-map-mvp/app`.

- `/`: delivery home with delivery list and new delivery modal.
- `/deliveries`: compatibility index route.
- `/deliveries/[slug]`: delivery workspace with scoped map, shortlist controls, dossier, state actions, and delivery CSV export.
- `/territories`: territory list.
- `/territories/[slug]`: territory overview for province-level demo context.
- `/operations`: legacy technical console, intentionally retained but visually deprecated.

## Core Components

Core delivery-centric components:

- `components/NavBar.tsx`
- `components/DeliveryHome.tsx`
- `components/DeliveryList.tsx`
- `components/NewDeliveryModal.tsx`
- `components/DeliveryWorkspace.tsx`
- `components/MapCanvas.tsx`
- `components/AssetPanel.tsx`
- `components/TerritoriesList.tsx`
- `components/TerritoryOverview.tsx`

Core libraries:

- `lib/api.ts`: backend API client functions.
- `lib/types.ts`: frontend data contracts.
- `lib/opportunity.ts`: frontend-side opportunity scoring, data quality, CSV export helpers.
- `lib/geo.ts`: frontend-side map/perimeter geometry helpers.

## Legacy Components

These are kept for compatibility and validation, but should not drive the main workflow.

- `components/OperationsPanel.tsx`: technical legacy console.
- `components/LeftControls.tsx`: compatibility stub for older map console wiring.
- `components/ScanStatus.tsx`: legacy/simple scan status display.
- `/operations`: legacy route for old endpoint access and smoke/demo troubleshooting.

## Duplicated Logic

- Opportunity scoring and data-quality warnings are computed in the frontend (`lib/opportunity.ts`) while backend stores raw asset, analysis, pipeline state, and company match data.
- Min/max area and kWp thresholds appear in delivery criteria, frontend filters, and scan request payloads.
- Suitability filtering can happen in backend `/assets` queries, delivery workspace frontend filters, and territory overview frontend filters.
- CSV export logic is frontend-side. Backend does not yet generate report artifacts.

This is acceptable for the MVP, but PDF/report generation should eventually move report-critical scoring and export contracts closer to the backend.

## Local-Only State

The following state is currently local or frontend-only:

- Territory overview filter selections.
- Drawn map perimeter polygons and area stats.
- Dossier "Verified" checkbox state.
- Some modal form defaults.
- UI dismiss state for the legacy operations banner.

Do not treat these as durable production records until persistence is intentionally added.

## Fragile Areas

- Windows Python environment: previous local venv pointed to a blocked Windows Store Python stub. Use `.\.venv\Scripts\python.exe` only after confirming the venv points to a real Python installation.
- External scan dependencies: OSM, Google Static Maps, Google Places, Nominatim, OpenAI vision, and OpenAPI Company can fail independently because of quota, auth, sandbox mode, or network availability.
- OpenAPI Company behavior: validated in sandbox, but production data and credit behavior depend on the OpenAPI account/product enabled for the token.
- `GET /debug/openapi-config` is temporary and must remain token-safe.
- Next.js `.next` cache can preserve stale type/build artifacts. Clear it before demo troubleshooting.
- Existing persisted assets may predate newer fields or company matches.
- `delivery_smoke_test.py` calls the delivery OpenAPI scan wrapper in dry-run mode; it still requires the backend server to be running.

## Do-Not-Touch Areas During Stabilization

- Do not redesign the UI.
- Do not add CRM/contact workflows.
- Do not add auth, billing, teams, notifications, dashboards, Street View, or dossier PDF in this phase.
- Do not alter OpenAPI auth/request behavior during Phase 3.19.
- Do not delete legacy endpoints or `/operations`; only keep them quarantined.
- Do not mutate historical asset data during smoke tests except through temporary delivery creation.
- Do not change the landing website in `tiloca-v15-work`.

## Validation Commands

Backend compile:

```powershell
cd C:\Users\Ermias\Documents\Codex\2026-05-13\files-mentioned-by-the-user-tiloca\tiloca-mvp-backend
.\.venv\Scripts\python.exe -m compileall app scripts
```

Migration upgrade:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
```

API smoke test:

```powershell
.\.venv\Scripts\python.exe -m scripts.api_smoke_test
```

Delivery smoke test:

```powershell
.\.venv\Scripts\python.exe -m scripts.delivery_smoke_test
```

Frontend build:

```powershell
cd C:\Users\Ermias\Documents\Codex\2026-05-13\files-mentioned-by-the-user-tiloca\tiloca-map-mvp
npm.cmd run build
```
