# Tiloca MVP Runbook

This runbook freezes the current MVP shape for real Torino/Cuneo production work and demos. It is intentionally not a CRM, outreach tool, billing system, or generic dashboard.

## Project Locations

- Backend: `C:\Users\Ermias\Documents\Codex\2026-05-13\files-mentioned-by-the-user-tiloca\tiloca-mvp-backend`
- Frontend: `C:\Users\Ermias\Documents\Codex\2026-05-13\files-mentioned-by-the-user-tiloca\tiloca-map-mvp`
- Landing website: `tiloca-v15-work` is separate and should not be touched for MVP console work.

## Current Architecture Audit

Backend models:

- `Territory`: scanable geographic area with bbox and default thresholds.
- `Scan`: historical scan event for one territory.
- `IndustrialAsset`: core roof/building entity.
- `AssetAnalysis`: scan-time roof intelligence and suitability output.
- `AssetPipelineState`: internal production state, not CRM state.
- `CompanyMatch`: probable company/address match for one industrial asset.

API endpoints:

- `GET /health`
- `GET /territories`
- `GET /territories/{slug}/overview`
- `GET /assets?territory=&suitability=&min_area_mq=&min_kwp=&limit=`
- `GET /assets/{asset_id}`
- `PATCH /assets/{asset_id}/state`
- `POST /assets/{asset_id}/match-company`
- `GET /enrichment/openapi/test`
- `GET /deliveries`
- `POST /deliveries`
- `GET /deliveries/{slug}`
- `PATCH /deliveries/{slug}`
- `GET /deliveries/{slug}/assets`
- `POST /deliveries/{slug}/run-openapi-scan`
- `POST /deliveries/{slug}/include-asset`
- `DELETE /deliveries/{slug}/exclude-asset/{asset_id}`
- `POST /company-scan/imel`
- `POST /company-scan/openapi`
- `POST /scan/{territory}`
- Static files under `/storage`

Frontend state areas:

- Territory and asset filters: territory, suitability, minimum area, minimum kWp, operational state, shortlist filter.
- Delivery config: client name, target provinces, target opportunity count, thresholds, accepted suitability.
- Scan state: selected candidate count, last scan, scan status/message.
- Asset data: API assets, ranked visible assets, review queue, selected asset detail.
- Company match state: loading/error while matching one asset.
- Export state: visible/report-ready CSV generation.
- Local-only dossier checklist: manual verification toggles.

Duplicated logic to watch:

- Opportunity scoring and data-quality warnings currently live in frontend (`lib/opportunity.ts`), while backend stores raw asset/match data. This is acceptable for MVP, but server-side scoring should be considered before automated report generation.
- Thresholds exist both as territory defaults in backend and delivery filters in frontend. Scan requests now send explicit production thresholds.
- Suitability filtering exists in backend query params and frontend delivery filters.

Local-only state that may eventually need persistence:

- Client Delivery Mode config.
- Manual Verification Checklist toggles.
- Selected quick filters and sort mode.
- Export preferences.

Fragile areas:

- Python environment on this Windows machine has previously pointed to a blocked Windows Store Python stub. Use a real Python install or a repaired venv before migrations/seeding.
- Google API key may support Static Maps but not Places; company matching handles this gracefully, but confidence may be `none`/`low`.
- Nominatim and Google matching are live external calls and can fail or rate-limit.
- Scans depend on external OSM, Google Static Maps, and OpenAI vision calls.
- Next `.next` cache can hold stale builds after type/interface changes.
- Existing assets created before migrations may not have `company_match` until matched.

## Environment

Recommended local quick setup:

```text
DATABASE_URL=postgresql+psycopg://postgres:tiloca123@localhost:5432/tiloca
```

This uses the local `postgres` user and password `tiloca123`.

Optional clean/production-style setup:

```text
DATABASE_URL=postgresql+psycopg://tiloca:<strong_password>@localhost:5432/tiloca
```

Use the clean setup when you want a dedicated database role with narrower permissions. Keep the quick setup for local validation and demos.

If PostgreSQL 18 tools are not on your `PATH`, call them with the full path:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d tiloca -c "SELECT PostGIS_Version();"
```

Optional OpenAPI Company sandbox configuration:

```text
OPENAPI_COMPANY_BASE_URL=https://company.openapi.com
OPENAPI_COMPANY_TOKEN=<your_sandbox_or_company_api_token>
OPENAPI_COMPANY_SANDBOX=true
OPENAPI_COMPANY_DRY_RUN=true
OPENAPI_COMPANY_DEFAULT_DATA_ENRICHMENT=address
OPENAPI_COMPANY_PRODUCTION_MAX_LIMIT=10
OPENAPI_COMPANY_SEARCH_PATH=/companies/search
OPENAPI_COMPANY_IT_SEARCH_PATH=/IT-search
OPENAPI_COMPANY_NEARBY_PATH=/companies/search/nearby
OPENAPI_COMPANY_DETAILS_PATH=/companies/{company_id_or_vat}
```

The app starts without these variables. Keep `OPENAPI_COMPANY_DRY_RUN=true` until you explicitly want to test live OpenAPI calls. OpenAPI company-led scans default to `dataEnrichment=address`, which is the cheapest safe mode for name/address/GPS validation. Use `advanced` only when explicitly needed because it can cost more.

Production guardrails:

- `dryRun=false` can spend OpenAPI credit.
- `limit > 10` requires `confirmProduction=true`.
- `OPENAPI_COMPANY_PRODUCTION_MAX_LIMIT` defaults to `10`; raise it intentionally before larger production batches.

Tiloca should prefer the newer OpenAPI Company API (`company.openapi.com`). The older `imprese.openapi.it` API is being migrated/deprecated, so endpoint paths are environment-configurable while the adapter is still in sandbox validation.

## Start Backend

```powershell
cd C:\Users\Ermias\Documents\Codex\2026-05-13\files-mentioned-by-the-user-tiloca\tiloca-mvp-backend
.\.venv\Scripts\Activate.ps1
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

If PowerShell blocks activation:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

## Run Migrations

```powershell
cd C:\Users\Ermias\Documents\Codex\2026-05-13\files-mentioned-by-the-user-tiloca\tiloca-mvp-backend
.\.venv\Scripts\Activate.ps1
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Required current migration:

- `0001_initial_schema`
- `0002_company_matches`
- `0003_delivery_model`

## Seed Territories

```powershell
.\.venv\Scripts\python.exe -m scripts.seed_territories
```

Expected territories include:

- `parma`
- `brescia`
- `bergamo`
- `verona`
- `reggio_emilia`
- `modena`
- `vicenza`
- `treviso`
- `torino`
- `cuneo`

The seed script skips existing slugs and adds only missing territories.

Optional demo delivery seed:

```powershell
.\.venv\Scripts\python.exe -m scripts.seed_demo_delivery
```

This creates or updates a draft `im-el` delivery for Torino/Cuneo with IM-EL delivery criteria.

## Start Frontend

```powershell
cd C:\Users\Ermias\Documents\Codex\2026-05-13\files-mentioned-by-the-user-tiloca\tiloca-map-mvp
npm.cmd install
npm.cmd run dev -- --hostname 127.0.0.1 --port 3001
```

Open:

```text
http://127.0.0.1:3001
```

## Clear Next Cache

```powershell
cd C:\Users\Ermias\Documents\Codex\2026-05-13\files-mentioned-by-the-user-tiloca\tiloca-map-mvp
Remove-Item -Recurse -Force .next
npm.cmd run build
```

## Smoke Tests

Backend service smoke test, including DB/PostGIS/API keys/minimal scan/state/company match:

```powershell
cd C:\Users\Ermias\Documents\Codex\2026-05-13\files-mentioned-by-the-user-tiloca\tiloca-mvp-backend
.\.venv\Scripts\python.exe -m scripts.smoke_test
```

Running API smoke test, including HTTP endpoints:

```powershell
cd C:\Users\Ermias\Documents\Codex\2026-05-13\files-mentioned-by-the-user-tiloca\tiloca-mvp-backend
.\.venv\Scripts\python.exe -m scripts.api_smoke_test
```

OpenAI roof-vision health check, using one existing satellite image:

```powershell
cd C:\Users\Ermias\Documents\Codex\2026-05-13\files-mentioned-by-the-user-tiloca\tiloca-mvp-backend
.\.venv\Scripts\python.exe -m scripts.vision_health_check
```

Expected healthy output:

```text
VISION HEALTH: PASS
```

If it prints `VISION HEALTH: FAIL - openai_auth_error`, `missing_openai_api_key`, `openai_rate_limit`, or a parsing reason, fix the OpenAI key/quota/model response before running roof-first scans. This prevents scans from silently persisting assets with `suitability="errore"`.

Clean temporary smoke-test delivery records:

```powershell
cd C:\Users\Ermias\Documents\Codex\2026-05-13\files-mentioned-by-the-user-tiloca\tiloca-mvp-backend
.\.venv\Scripts\python.exe -m scripts.cleanup_test_deliveries
```

Frontend build:

```powershell
cd C:\Users\Ermias\Documents\Codex\2026-05-13\files-mentioned-by-the-user-tiloca\tiloca-map-mvp
npm.cmd run build
```

## Phase 3.19 Regression Validation

Use this sequence before a delivery demo or Torino/Cuneo production session:

```powershell
cd C:\Users\Ermias\Documents\Codex\2026-05-13\files-mentioned-by-the-user-tiloca\tiloca-mvp-backend
.\.venv\Scripts\python.exe -m compileall app scripts
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m scripts.api_smoke_test
.\.venv\Scripts\python.exe -m scripts.delivery_smoke_test
```

Current migration chain expected by `alembic upgrade head`:

```text
0001_initial_schema -> 0002_company_matches -> 0003_delivery_model
```

Frontend build validation:

```powershell
cd C:\Users\Ermias\Documents\Codex\2026-05-13\files-mentioned-by-the-user-tiloca\tiloca-map-mvp
npm.cmd run build
```

Architecture audit:

```text
docs\ARCHITECTURE_AUDIT.md
```

OpenAPI Company adapter check:

```powershell
Invoke-RestMethod -Method Get -Uri http://127.0.0.1:8000/enrichment/openapi/test
```

Expected without OpenAPI env vars:

```text
status: missing_config
token_configured: false
```

Expected with token and dry-run enabled:

```text
status: dry_run
token_exposed: false
```

## API Contract Notes

Asset list item:

```json
{
  "id": 1,
  "territory_id": 1,
  "osm_id": "182153213",
  "name": "Barilla",
  "address": null,
  "building_type": "industrial",
  "lat": 44.827237,
  "lon": 10.371698,
  "area_mq": 79697,
  "estimated_kwp": 11954,
  "roof_type": "misto",
  "suitability": "alta",
  "satellite_image_path": "storage\\satellite\\...",
  "industrial_metadata": {},
  "first_seen_at": "...",
  "last_seen_at": "...",
  "pipeline_state": {},
  "company_match": {}
}
```

Asset detail extends asset list item:

```json
{
  "analyses": [
    {
      "id": 1,
      "scan_id": 1,
      "roof_type": "piano",
      "roof_quality": "good",
      "orientation": null,
      "obstacles": "none",
      "has_panels": false,
      "suitability": "alta",
      "estimated_kwp": 500,
      "satellite_image_path": "storage\\satellite\\...",
      "notes": null,
      "raw_vision": {},
      "created_at": "..."
    }
  ]
}
```

Pipeline state:

```json
{
  "state": "new | needs_review | qualified | report_ready | excluded",
  "reason": "Operator shortlist update",
  "updated_at": "..."
}
```

Company match:

```json
{
  "id": 1,
  "asset_id": 1,
  "company_name": "Example Company",
  "address": "Example address",
  "website": null,
  "category": "industrial",
  "source": "asset_metadata | nominatim_reverse | google_places | none",
  "distance_meters": 42.5,
  "match_confidence": "high | medium | low | none",
  "match_score": 0,
  "match_reason": "specific scoring factors",
  "raw_payload": {},
  "created_at": "...",
  "updated_at": "..."
}
```

OpenAPI Company adapter test:

```json
{
  "status": "missing_config | dry_run | ok | api_error | request_failed",
  "provider": "openapi_company",
  "config": {
    "base_url": "https://company.openapi.com",
    "base_url_configured": true,
    "token_configured": false,
    "sandbox": true,
    "dry_run": true,
    "search_path": "/companies/search",
    "nearby_path": "/companies/search/nearby",
    "details_path": "/companies/{company_id_or_vat}",
    "token_exposed": false
  },
  "test_query": {}
}
```

Territory overview:

```json
{
  "territory": {
    "id": 1,
    "slug": "torino",
    "name": "Torino"
  },
  "totals": {
    "buildings_identified": 23,
    "with_idoneous_roof": 21,
    "high_suitability": 20,
    "without_existing_pv": 23,
    "above_2000mq": 23,
    "total_installable_kwp": 12500
  },
  "kwp_distribution": [
    { "range": "300-1000", "count": 6 },
    { "range": "1000-2500", "count": 12 },
    { "range": "2500-5000", "count": 4 },
    { "range": ">5000", "count": 1 },
    { "range": "<300", "count": 0 }
  ],
  "by_ateco": [
    { "category": "25.62", "count": 8 }
  ],
  "by_suitability": {
    "alta": 20,
    "media": 1,
    "bassa": 0,
    "non_analizzato": 2
  },
  "last_scan_date": "2026-05-21T10:15:00+00:00"
}
```

Scan result:

```json
{
  "id": 1,
  "territory_id": 1,
  "status": "completed | failed | running",
  "profile": "sunsolution",
  "max_assets": 10,
  "osm_candidates_count": 1556,
  "analyzed_count": 10,
  "persisted_count": 3,
  "rejected_count": 7,
  "skipped_count": 1546,
  "filters_used": {
    "max_assets": 10,
    "min_area_mq": 2000,
    "max_area_mq": null,
    "min_kwp": 300,
    "max_kwp": null,
    "suitability_levels": []
  },
  "debug_info": {
    "osm_candidates_before_filters": 1556,
    "candidates_after_area_kwp_filters": 1556,
    "candidates_selected_for_analysis": 10
  },
  "error": null,
  "started_at": "...",
  "finished_at": "..."
}
```

PMI-sized roof-first scan example for Brescia/Ingenera preview:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:8000/scan/brescia" `
  -ContentType "application/json" `
  -Body '{"max_assets":30,"min_area_mq":1500,"max_area_mq":8000}'
```

`max_area_mq` is applied before selecting `max_assets`, so very large polygons such as 50k+ mq industrial complexes are excluded from the candidate shortlist for that scan. If omitted, roof-first scans keep the previous behavior.

Review a completed roof-first scan in the app:

```text
http://127.0.0.1:3001/operations/scans/28
```

The review page calls `GET /scans/{scan_id}/assets` and shows the scan counters, debug summary, satellite images, roof analysis, company-match status, and Google Maps links for assets created or updated by that scan.

## Production Workflow

1. Start backend and frontend.
2. Run migrations and seed territories if the database is new.
3. Select territory: `torino` or `cuneo`.
4. Set thresholds: min area `2000 mq`, min kWp `300`, suitability `alta`/`media`.
5. Analyze candidate roofs. The number is candidates analyzed, not final opportunities.
6. Optionally run Company-first scan for IM-EL delivery when the objective is contactable local companies first.
7. Review ranked queue.
8. Run company match for weak/generic assets.
9. Inspect data quality warnings and manual verification checklist.
10. Mark assets `qualified` or `report_ready`; exclude bad polygons/matches.
11. Export report-ready CSV for client delivery.

## Territory Overview Demo Flow

The territory overview is for prospect demos before a client delivery exists. It shows the size and quality of the province pipeline using persisted Tiloca assets only.

Open the frontend route:

```text
http://127.0.0.1:3001/territories/torino
```

Validate the backend aggregate endpoint:

```powershell
Invoke-RestMethod -Method Get -Uri http://127.0.0.1:8000/territories/torino/overview
```

Demo sequence:

1. Open `/territories/torino`.
2. Show big numbers: buildings identified, idoneous roofs, no-FV assets, above 2000 mq, total MWp.
3. Use the map to show geographic spread and clustering.
4. Apply suitability, kWp range, and ATECO/category filters.
5. Point out that the map and metrics recompute from the filtered asset layer.
6. Use `Run new scan` to move to `/operations` only if the prospect wants to see the scanning workflow.

## Delivery Workflow

Delivery is the service-level container for client work. Assets remain global Tiloca intelligence records, while `delivery_assets` links only the assets included in a specific client delivery. This keeps historical scans reusable without mixing IM-EL, Sunsolution, Corna, or future client workflows.

Create a draft delivery:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8000/deliveries `
  -ContentType "application/json" `
  -Body '{"client_name":"IM-EL","target_provinces":["torino","cuneo"],"criteria":{"ateco_codes":["25.62"],"min_area_mq":2000,"max_area_mq":30000,"min_kwp":300,"max_kwp":2500,"min_employees":5,"max_employees":80,"limit":2,"dryRun":true},"status":"draft","target_opportunity_count":30,"notes":"Riccardo delivery workspace"}'
```

List deliveries:

```powershell
Invoke-RestMethod -Method Get -Uri http://127.0.0.1:8000/deliveries
```

Run the delivery OpenAPI scan wrapper:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/deliveries/im-el/run-openapi-scan
```

List assets included in the delivery:

```powershell
Invoke-RestMethod -Method Get -Uri http://127.0.0.1:8000/deliveries/im-el/assets
```

Carry over an existing asset into a delivery:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8000/deliveries/im-el/include-asset `
  -ContentType "application/json" `
  -Body '{"asset_id":1,"included_reason":"carried_over"}'
```

Exclude an asset from a delivery without deleting the global asset:

```powershell
Invoke-RestMethod -Method Delete -Uri http://127.0.0.1:8000/deliveries/im-el/exclude-asset/1
```

Delivery smoke test:

```powershell
cd C:\Users\Ermias\Documents\Codex\2026-05-13\files-mentioned-by-the-user-tiloca\tiloca-mvp-backend
.\.venv\Scripts\python.exe -m scripts.delivery_smoke_test
```

Tiny Company-first API test:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8000/company-scan/imel `
  -ContentType "application/json" `
  -Body '{"province":"torino","max_places":5,"min_area_mq":2000,"max_area_mq":30000,"min_kwp":300,"max_kwp":2500,"max_results":2}'
```

OpenAPI company-led dry-run test:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8000/company-scan/openapi `
  -ContentType "application/json" `
  -Body '{"province":"torino","atecoCode":"25.62","minEmployees":5,"maxEmployees":80,"min_area_mq":2000,"max_area_mq":30000,"min_kwp":300,"max_kwp":2500,"limit":2,"dryRun":true,"dataEnrichment":"address"}'
```

Dry-run calls OpenAPI IT-search in dry-run/count mode when the API supports it, but it does not persist assets, analyses, or company matches. To validate the full company-led roof path in sandbox, send `dryRun:false` with a tiny `limit` such as `2`.

Safe production micro-test after sandbox validation:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8000/company-scan/openapi `
  -ContentType "application/json" `
  -Body '{"province":"torino","atecoCode":"25.62","minEmployees":5,"maxEmployees":80,"min_area_mq":2000,"max_area_mq":30000,"min_kwp":300,"max_kwp":2500,"limit":2,"dryRun":false,"dataEnrichment":"address"}'
```

Do not use `dataEnrichment:"advanced"` for a production test unless you intentionally want the higher enrichment tier. For production scans above `limit:10`, add `confirmProduction:true` and raise `OPENAPI_COMPANY_PRODUCTION_MAX_LIMIT` deliberately.

OpenAPI parser test:

```powershell
cd C:\Users\Ermias\Documents\Codex\2026-05-13\files-mentioned-by-the-user-tiloca\tiloca-mvp-backend
.\.venv\Scripts\python.exe -m scripts.openapi_parsing_test
```

Phase 3.12 sandbox validation result:

```text
POST /company-scan/openapi dryRun=true
- status=dry_run
- cost_estimate returned
- no persistence

POST /company-scan/openapi dryRun=false limit=2
- companies_found=2
- companies_with_coordinates=2
- roofs_analyzed=2
- status=completed
- error empty
```

`accepted_opportunities=0` is expected in sandbox when the returned companies/roofs are mock data and not commercially representative. For production delivery, use live representative company data and keep the existing manual review/data-quality workflow before marking assets report-ready.

## Demo Validation Checklist

```text
[ ] PostgreSQL is running
[ ] DATABASE_URL points to the intended DB
[ ] .\.venv\Scripts\python.exe -m alembic upgrade head passes
[ ] .\.venv\Scripts\python.exe -m scripts.seed_territories passes
[ ] .\.venv\Scripts\python.exe -m scripts.seed_demo_delivery passes
[ ] GET /territories includes torino and cuneo
[ ] GET /territories/torino/overview returns aggregate stats
[ ] /territories/torino opens and filters update map + big numbers
[ ] POST /deliveries creates a draft delivery
[ ] POST /deliveries/{slug}/run-openapi-scan associates assets when dryRun=false and accepted opportunities exist
[ ] GET /deliveries/{slug}/assets returns only that delivery's assets
[ ] .\.venv\Scripts\python.exe -m scripts.api_smoke_test passes or fails only on known external quota/key limits
[ ] .\.venv\Scripts\python.exe -m scripts.delivery_smoke_test passes
[ ] npm.cmd run build passes
[ ] Frontend opens at http://127.0.0.1:3001
[ ] Map loads persisted assets only
[ ] Clicking a marker opens dossier
[ ] Company match button returns high/medium/low/none without breaking dossier
[ ] State changes persist after refresh
[ ] Report-ready CSV exports real persisted assets
[ ] No hardcoded demo leads or fake companies
```

## Common Errors

Python opens Windows Store or says access denied:

- Install a real Python distribution.
- Recreate `.venv`.
- Confirm `python --version` before installing requirements.

PostGIS missing:

```powershell
psql -U postgres -d tiloca -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

Alembic cannot connect:

- Check `.env`.
- Check PostgreSQL service.
- Check `DATABASE_URL`.

Google Places returns no useful match:

- Static Maps and Places are different APIs.
- The app should keep the match as `none`/`low` and preserve current asset data.

OpenAPI Company test returns auth/payment/sandbox error:

- Confirm `OPENAPI_COMPANY_TOKEN` is valid.
- Keep `OPENAPI_COMPANY_DRY_RUN=true` while validating route configuration.
- Confirm the Company API product is enabled for the token.
- Check whether OpenAPI has changed the search endpoint path and update `OPENAPI_COMPANY_SEARCH_PATH`.

Scan persists no assets:

- Candidate may have been rejected by vision or suitability rules.
- Retry with a slightly larger candidate count.
- Check Google/OpenAI quota.

Frontend stale after type changes:

```powershell
Remove-Item -Recurse -Force .next
npm.cmd run build
```

## Stabilization Rule

Until the next planned phase, prefer:

- documentation
- validation scripts
- small reliability fixes
- bug fixes with clear reproduction

Avoid:

- redesign
- CRM/contact workflows
- generic charts/dashboards outside the planned territory overview
- auth/billing/users
- new external enrichment sources
- changing scoring logic without a real bug
