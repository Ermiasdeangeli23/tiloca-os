# Tiloca Operational Backend MVP

Minimal backend for turning Tiloca scanner output into persistent geospatial intelligence.

This is intentionally not a CRM, dashboard, auth system, or generic SaaS admin app. The core entity is the physical industrial asset.

## What This Provides

- FastAPI app
- PostgreSQL + PostGIS persistence
- SQLAlchemy ORM models
- Alembic migration
- reusable scan services:
  - OSM ingestion
  - satellite fetch
  - vision analysis
  - scoring
  - persistence
- transition CLI that keeps `scanner_v2.py` executable
- local smoke test for Phase 1 validation

## Project Shape

```text
app/
  main.py
  core/
    checks.py
    config.py
    database.py
    seed.py
  models/
  schemas/
  api/routes/
  services/
migrations/
scripts/
  seed_territories.py
  smoke_test.py
scanner_v2.py
requirements.txt
```

## Windows Local Setup

Run these from PowerShell in the `tiloca-mvp-backend` folder.

### 1. Create Python Environment

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### 2. Configure Environment Variables

```powershell
Copy-Item .env.example .env
notepad .env
```

Set real values:

```text
DATABASE_URL=postgresql+psycopg://postgres:tiloca123@localhost:5432/tiloca
GOOGLE_API_KEY=your_google_static_maps_key
OPENAI_API_KEY=your_openai_key
OPENAPI_COMPANY_BASE_URL=https://company.openapi.com
OPENAPI_COMPANY_TOKEN=
OPENAPI_COMPANY_SANDBOX=true
OPENAPI_COMPANY_DRY_RUN=true
OPENAPI_COMPANY_SEARCH_PATH=/companies/search
OPENAPI_COMPANY_IT_SEARCH_PATH=/IT-search
OPENAPI_COMPANY_NEARBY_PATH=/companies/search/nearby
OPENAPI_COMPANY_DETAILS_PATH=/companies/{company_id_or_vat}
SATELLITE_STORAGE_DIR=storage/satellite
DEFAULT_SCAN_LIMIT=30
```

The recommended local quick setup uses the default `postgres` user with password `tiloca123`.

Optional clean/production-style setup can use a dedicated DB user instead:

```text
DATABASE_URL=postgresql+psycopg://tiloca:<strong_password>@localhost:5432/tiloca
```

Safety guards will fail clearly if `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `DATABASE_URL`, or PostGIS are not valid.

OpenAPI Company enrichment is optional and disabled safely by default. Leave `OPENAPI_COMPANY_TOKEN` empty or keep `OPENAPI_COMPANY_DRY_RUN=true` while validating the sandbox adapter.

### 3. Create PostgreSQL Database

Recommended local quick setup with the `postgres` superuser:

```powershell
createdb -U postgres tiloca
psql -U postgres -d tiloca -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

Optional clean setup with a dedicated `tiloca` user:

```powershell
createuser -U postgres tiloca -P
createdb -U postgres -O tiloca tiloca
psql -U postgres -d tiloca -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

If PostgreSQL 18 command-line tools are not on your `PATH`, use the full path, for example:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d tiloca -c "SELECT PostGIS_Version();"
```

Quick DB check:

```powershell
psql -U postgres -d tiloca -c "SELECT PostGIS_Version();"
```

### 4. Run Migration

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
```

### 5. Seed Territories

```powershell
.\.venv\Scripts\python.exe -m scripts.seed_territories
```

### 6. Run Phase 1 Smoke Test

This validates the backend end-to-end before any frontend or map work:

```powershell
.\.venv\Scripts\python.exe -m scripts.smoke_test
```

The smoke test checks:

- database connection
- PostGIS extension
- seeded territories
- required API keys
- one minimal `parma` scan with `max_assets=1`
- persisted `industrial_assets`
- persisted `asset_analysis`

Expected style:

```text
PASS  Database connection
PASS  PostGIS enabled (...)
PASS  API keys configured
PASS  Territories exist (...)
RUN   Minimal scan: territory=parma max_assets=1
PASS  Scan completed (...)
PASS  Asset analysis persisted (...)
PASS  Industrial assets persisted (...)
PASS  Phase 1 backend validation completed
```

If the first OSM candidate is rejected by vision analysis, the smoke test will fail clearly. After confirming API keys and quota, rerun it or temporarily test through the API with `max_assets=3`.

### 7. Run API

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

The API should be available at:

```text
http://127.0.0.1:8000
```

## Endpoint Checks

PowerShell examples:

### Health

```powershell
Invoke-RestMethod -Method Get -Uri http://127.0.0.1:8000/health
```

### Territories

```powershell
Invoke-RestMethod -Method Get -Uri http://127.0.0.1:8000/territories
```

### Minimal Scan

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8000/scan/parma `
  -ContentType "application/json" `
  -Body '{"max_assets": 1}'
```

### Assets

```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8000/assets?territory=parma"
```

### Assets With Suitability Filter

```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8000/assets?territory=parma&suitability=alta"
```

### OpenAPI Company Sandbox Adapter

This checks whether the OpenAPI Company adapter is configured. It never exposes the token.

```powershell
Invoke-RestMethod -Method Get -Uri http://127.0.0.1:8000/enrichment/openapi/test
```

Keep this in dry-run mode until you are ready to intentionally test paid or credit-consuming data access:

```text
OPENAPI_COMPANY_SANDBOX=true
OPENAPI_COMPANY_DRY_RUN=true
```

Tiloca targets the newer OpenAPI Company API (`company.openapi.com`). The older `imprese.openapi.it` API is being migrated/deprecated, so endpoint paths are configurable in `.env` if OpenAPI adjusts the Company API routes.

### OpenAPI Company-Led Roof Validation

Dry-run IT-search validation:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8000/company-scan/openapi `
  -ContentType "application/json" `
  -Body '{"province":"torino","atecoCode":"25.62","minEmployees":5,"maxEmployees":80,"min_area_mq":2000,"max_area_mq":30000,"min_kwp":300,"max_kwp":2500,"limit":2,"dryRun":true}'
```

`dryRun:true` does not persist any Tiloca assets. `dryRun:false` validates returned companies through nearby OSM roof lookup, satellite imagery, and vision analysis, then persists accepted opportunities with `source=openapi_company`.

curl examples:

```powershell
curl.exe http://127.0.0.1:8000/health
curl.exe http://127.0.0.1:8000/territories
curl.exe -X POST http://127.0.0.1:8000/scan/parma -H "Content-Type: application/json" -d "{\"max_assets\":1}"
curl.exe "http://127.0.0.1:8000/assets?territory=parma"
```

## CLI Transition

The scanner remains executable:

```powershell
.\.venv\Scripts\python.exe scanner_v2.py
```

The CLI calls the same scan service used by the API and writes results to the database.

## Data Model

- `industrial_assets`
  Core entity. One physical building/roof.

- `scans`
  Historical scan event for a territory.

- `asset_analysis`
  Evolving intelligence generated during scans.

- `asset_pipeline_state`
  Operational state for the asset. This is not CRM state.

## Validation Checklist Before Frontend

Do not start frontend or live maps until all of these pass:

```text
[ ] .env exists and has real API keys
[ ] PostgreSQL is running
[ ] DATABASE_URL connects
[ ] PostGIS_Version() returns a version
[ ] .\.venv\Scripts\python.exe -m alembic upgrade head succeeds
[ ] .\.venv\Scripts\python.exe -m scripts.seed_territories succeeds
[ ] .\.venv\Scripts\python.exe -m scripts.smoke_test passes
[ ] GET /health returns {"status":"ok"}
[ ] GET /territories returns seeded territories
[ ] POST /scan/parma with max_assets=1 completes or fails with a clear external API/quota reason
[ ] GET /assets returns persisted assets after a successful scan
```

## Notes

- API keys are read from environment variables.
- Satellite images are stored on disk under `SATELLITE_STORAGE_DIR`.
- The website is intentionally untouched in this phase.
- No auth, billing, users, organizations, notifications, realtime, or background worker layer.
