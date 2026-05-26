# OpenAPI Integration Readiness Audit

Phase 3.22 diagnostic note. This is an inspection-only audit before spending production OpenAPI credit. No backend, frontend, schema, endpoint, or OpenAPI behavior changes were implemented.

## Executive Summary

Tiloca currently has two OpenAPI-related layers:

- A safe adapter/test layer in `app/services/openapi_company.py`.
- A real company-led roof validation flow in `app/services/openapi_company_scan.py`.

The production delivery-relevant path is:

```text
OpenAPI Company IT-search -> company GPS/address -> nearby OSM roof lookup -> satellite image -> vision analysis -> persisted IndustrialAsset + CompanyMatch -> delivery_assets link
```

The code is using the newer Company API domain/path pattern, not the deprecated `imprese.openapi.it` API:

```text
https://company.openapi.com/IT-search
https://test.company.openapi.com/IT-search
```

Current readiness verdict:

- Technically ready for sandbox validation.
- Directionally correct for company-first deliveries.
- Not yet safe to spend at scale until one live paid micro-test confirms response shape, cost, and accepted opportunity rate.
- `dryRun=true` is not a full local simulation; in the main scan path it still calls OpenAPI `IT-search` with `dryRun=1`.
- `dryRun=false` can call paid/enriched OpenAPI data and then trigger additional non-OpenAPI calls: Overpass/OSM, Google Static Maps, and OpenAI vision.
- Phase 3.23 hardened the production path: default enrichment is now `address`, larger production scans require confirmation, and nested registered-office parsing is supported.

## Sources Checked

Code inspected:

- `tiloca-mvp-backend/app/core/config.py`
- `tiloca-mvp-backend/app/api/routes/enrichment.py`
- `tiloca-mvp-backend/app/api/routes/debug.py`
- `tiloca-mvp-backend/app/api/routes/scans.py`
- `tiloca-mvp-backend/app/api/routes/deliveries.py`
- `tiloca-mvp-backend/app/services/openapi_company.py`
- `tiloca-mvp-backend/app/services/openapi_company_scan.py`
- `tiloca-mvp-backend/app/services/delivery_service.py`
- `tiloca-mvp-backend/app/schemas/scan.py`
- `RUNBOOK.md`

External references checked:

- OpenAPI Company documentation: `https://console.openapi.com/it/apis/company/documentation`
- OpenAPI Company Search product page: `https://openapi.it/prodotti/cerca-ragione-sociale`
- OpenAPI migration guide from Imprese to Company: `https://storage.googleapis.com/static-openapi-com-bucket/documents/guide-enterprise-to-company.pdf`

## Config and Environment Variables

Configured in `app/core/config.py`:

```text
OPENAPI_COMPANY_BASE_URL
OPENAPI_COMPANY_TOKEN
OPENAPI_COMPANY_SANDBOX
OPENAPI_COMPANY_DRY_RUN
OPENAPI_COMPANY_SEARCH_PATH
OPENAPI_COMPANY_IT_SEARCH_PATH
OPENAPI_COMPANY_NEARBY_PATH
OPENAPI_COMPANY_DETAILS_PATH
OPENAPI_COMPANY_DEFAULT_DATA_ENRICHMENT
OPENAPI_COMPANY_PRODUCTION_MAX_LIMIT
```

Defaults:

```text
OPENAPI_COMPANY_BASE_URL=https://company.openapi.com
OPENAPI_COMPANY_TOKEN=
OPENAPI_COMPANY_SANDBOX=true
OPENAPI_COMPANY_DRY_RUN=true
OPENAPI_COMPANY_SEARCH_PATH=/companies/search
OPENAPI_COMPANY_IT_SEARCH_PATH=/IT-search
OPENAPI_COMPANY_NEARBY_PATH=/companies/search/nearby
OPENAPI_COMPANY_DETAILS_PATH=/companies/{company_id_or_vat}
OPENAPI_COMPANY_DEFAULT_DATA_ENRICHMENT=address
OPENAPI_COMPANY_PRODUCTION_MAX_LIMIT=10
```

For sandbox testing, the base URL should be:

```text
OPENAPI_COMPANY_BASE_URL=https://test.company.openapi.com
```

The code strips whitespace from the token and removes a leading `Bearer ` prefix if accidentally included.

## Base URLs Used

The code supports configurable base URL:

```python
settings.openapi_company_base_url
```

Observed/default values:

- Production default: `https://company.openapi.com`
- Sandbox expected: `https://test.company.openapi.com`

OpenAPI’s Company documentation lists:

- Production domain: `company.openapi.com`
- Sandbox domain: `test.company.openapi.com`

## Endpoints Used

### Main Production-Relevant Path

`app/services/openapi_company_scan.py` calls:

```text
GET {OPENAPI_COMPANY_BASE_URL}{OPENAPI_COMPANY_IT_SEARCH_PATH}
```

Default path:

```text
/IT-search
```

Request construction:

```python
url = settings.OPENAPI_COMPANY_BASE_URL.rstrip("/") + "/" + settings.OPENAPI_COMPANY_IT_SEARCH_PATH.lstrip("/")
headers = {
  "accept": "application/json",
  "Authorization": f"Bearer {token}"
}
params = {
  "dryRun": 1 if dry_run else 0,
    "dataEnrichment": configured enrichment mode,
  "province": province_code,
  "limit": capped_limit,
  "atecoCode": optional,
  "minEmployees": optional,
  "maxEmployees": optional,
  "minTurnover": optional,
  "maxTurnover": optional,
  "activityStatus": optional
}
```

This matches the newer Company API Search endpoint shape documented by OpenAPI for Company Search. The configured enrichment mode now defaults to `address`; `advanced` is still supported but must be requested explicitly.

### Adapter/Test Layer

`app/services/openapi_company.py` contains placeholder/generic functions:

- `search_companies_by_province_ateco()`
- `search_companies_near_coordinates()`
- `get_company_details()`

These use configurable paths such as:

```text
/companies/search
/companies/search/nearby
/companies/{company_id_or_vat}
```

Important: these are not the production delivery path. They are currently used by:

```text
GET /enrichment/openapi/test
```

That endpoint is a safe adapter/config check. It should not be treated as proof that the production delivery scan uses those placeholder paths.

## Company API vs Deprecated Imprese API

The current delivery-relevant code does not call:

```text
imprese.openapi.it
```

The current delivery-relevant code calls:

```text
company.openapi.com/IT-search
test.company.openapi.com/IT-search
```

OpenAPI’s migration guide maps old Imprese endpoints to Company endpoints, including:

```text
GET imprese.openapi.it/advance
-> GET company.openapi.com/IT-search
```

OpenAPI’s Company documentation also shows Company API production and sandbox domains. Therefore the current main scan path is aligned with the newer Company API, not the deprecated Imprese API.

## Required Token Scopes

The code cannot introspect token scopes. Based on OpenAPI docs and the endpoints used, the token must allow at minimum:

```text
GET /IT-search
```

For the current query shape, the token/product plan must support:

```text
dataEnrichment=advanced
province
atecoCode
minEmployees / maxEmployees
minTurnover / maxTurnover
activityStatus
limit
dryRun
```

OpenAPI’s migration guide notes that token scopes can be configured broadly for Company, for example wildcard Company scopes. The smallest practical requirement for Tiloca is access to Company Search with the selected `dataEnrichment` level.

## Sandbox Behavior

Sandbox base URL:

```text
https://test.company.openapi.com
```

Sandbox is useful for:

- Auth header validation.
- Endpoint path validation.
- Request parameter validation.
- Response parser validation.
- Coordinate extraction validation.
- End-to-end Tiloca flow with mock companies.

Sandbox is not enough for:

- Commercial representativeness.
- Real Torino/Cuneo lead quality.
- True accepted opportunity rate.
- Real cost/credit behavior.
- Confirming realistic company names/addresses for IM-EL delivery.

Previous local validation documented in `RUNBOOK.md`:

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

`accepted_opportunities=0` was expected in sandbox because returned companies/roofs were mock and not commercially representative.

## What dryRun=true Actually Does

There are two different dry-run implementations.

### Adapter/Test Endpoint

For:

```text
GET /enrichment/openapi/test
```

`dry_run=true` in `app/services/openapi_company.py` means:

```text
No network request is sent.
The response contains a planned request only.
```

This is configuration-level safety.

### Company-Led Scan Endpoint

For:

```text
POST /company-scan/openapi
POST /deliveries/{slug}/run-openapi-scan
```

`dryRun=true` in `app/services/openapi_company_scan.py` means:

```text
The backend still calls OpenAPI IT-search with query param dryRun=1.
No Tiloca assets, scans, analyses, company matches, or delivery_assets are persisted.
No OSM roof lookup, satellite fetch, or vision analysis is run.
```

This is useful for checking OpenAPI request cost/count response shape, but it still depends on OpenAPI supporting the `dryRun=1` query parameter for that account/product.

## What dryRun=false Actually Does

For:

```text
POST /company-scan/openapi
```

`dryRun=false` means:

1. Calls `GET /IT-search` with:

```text
dryRun=0
dataEnrichment=address by default, or explicit request/env mode
province=TO/CN/etc.
atecoCode=...
employee/turnover/status filters if supplied
limit capped at 50
```

2. Extracts companies from response.
3. Extracts coordinates from:

```text
company["address"]["registeredOffice"]["gps"]["coordinates"]
```

The code correctly treats OpenAPI coordinates as:

```text
[longitude, latitude]
```

4. For each company with coordinates:

- Searches OSM buildings within 50m, then 100m, then 150m.
- Prefers industrial/warehouse/factory/manufacturing-like buildings.
- Fetches Google satellite image.
- Runs vision analysis.
- Applies min/max area and kWp filters.
- Persists accepted `IndustrialAsset`.
- Persists `CompanyMatch` with `source=openapi_company`.
- Appends accepted asset id to `result.asset_ids`.

5. For delivery scan wrapper:

```text
POST /deliveries/{slug}/run-openapi-scan
```

The wrapper calls `run_openapi_company_scan()` for each delivery target province, then links accepted `asset_ids` into `delivery_assets` with reason `scan_result`.

## Search vs Enrichment by VAT/ID

The delivery-relevant flow searches companies by province/ATECO and optional business filters. It does not require VAT/company ID as input.

Supported search filters in current scan request:

```text
province
atecoCode
minEmployees
maxEmployees
minTurnover
maxTurnover
activityStatus
limit
dryRun
```

The placeholder adapter has `get_company_details(company_id_or_vat)`, but the delivery scan does not currently call `/IT-start`, `/IT-advanced/{id}`, or any detail endpoint after search. It relies on `IT-search?dataEnrichment=advanced` to return enough company data in the search response.

## Response Fields Expected by Tiloca

The code attempts to parse:

Company identity:

```text
companyName
denominazione
ragioneSociale
name
nome
```

Identifier:

```text
vatCode
vat
partitaIva
taxCode
codiceFiscale
id
```

ATECO:

```text
atecoCode
ateco
codiceAteco
ateco.code
ateco.codice
```

Address:

```text
address
indirizzo
registeredOfficeAddress
sedeLegale
```

GPS:

```text
address.registeredOffice.gps.coordinates
```

Other metadata:

```text
employees
turnover
pec
legalStatus
activityStatus
```

OpenAPI docs show Company Search can return company name, VAT/tax code, registered office address, GPS coordinates, activity status, ATECO, employees, turnover, PEC, SDI, REA, and legal nature depending on `dataEnrichment`.

## Known Parser Gap

Coordinate parsing was fixed for:

```text
address.registeredOffice.gps.coordinates
```

But address parsing is still shallow. `_company_address()` handles an `address` dict only if fields like `street`, `streetNumber`, `city`, and `province` are directly under `address`.

OpenAPI Company examples place these under:

```text
address.registeredOffice.street
address.registeredOffice.streetNumber
address.registeredOffice.streetName
address.registeredOffice.town
address.registeredOffice.province
address.registeredOffice.zipCode
```

Phase 3.23 updated parsing for:

```text
address.registeredOffice.*
registeredOffice.*
address.*
```

The parser now extracts company name, VAT/tax code, registered office address, city, province, postal code, GPS coordinates, and ATECO/category where present. Missing nested fields should not crash the scan.

## API Calls Per Delivery Scan

For each target province in a delivery:

1. One OpenAPI Company call:

```text
GET /IT-search
```

2. For each returned company up to `limit`:

- 1 to 3 Overpass/OSM calls depending on whether a nearby building is found at 50m/100m/150m.
- 1 Google Static Maps call if a building is found.
- 1 OpenAI vision analysis call if satellite fetch succeeds.

For an IM-EL delivery with two provinces and `limit=10`:

```text
OpenAPI calls: 2
OSM calls: up to 60
Google Static Maps calls: up to 20
OpenAI vision calls: up to 20
```

For two provinces and `limit=50`:

```text
OpenAPI calls: 2
OSM calls: up to 300
Google Static Maps calls: up to 100
OpenAI vision calls: up to 100
```

The OpenAPI billing risk is per `/IT-search` request and selected `dataEnrichment`, not per company loop inside Tiloca, based on the current code.

## Cost Estimate

OpenAPI’s public product page lists indicative single-request prices for Company Search:

```text
GET /IT-search search: EUR 0.01 + VAT
GET /IT-search data_enrichment_name: EUR 0.001 + VAT
GET /IT-search data_enrichment_address: EUR 0.01 + VAT
GET /IT-search data_enrichment_start: EUR 0.05 + VAT
GET /IT-search data_enrichment_advanced: EUR 0.10 + VAT
GET /IT-search data_enrichment_pec: EUR 0.03 + VAT
GET /IT-search data_enrichment_shareholders: EUR 0.03 + VAT
```

Before Phase 3.23 the code always sent:

```text
dataEnrichment=advanced
```

even when `data_enrichment=False`, because `_build_search_params()` currently sets:

```python
"dataEnrichment": "advanced" if data_enrichment else "advanced"
```

Phase 3.23 changed this. The expected default OpenAPI request tier is now:

```text
dataEnrichment=address
```

`advanced` remains available as an explicit opt-in via request body or env.

Estimated OpenAPI cost for 100 returned companies depends on OpenAPI billing semantics for `IT-search`:

- If billed per request: approximately one advanced search request per province, not per company.
- If OpenAPI charges by returned record or plan-specific unit rules, actual cost must be confirmed by `dryRun=1` response or account pricing.

Do not assume cost from code alone. Use `dryRun=true` first and inspect `cost_estimate`/OpenAPI response.

## Failure Modes

OpenAPI/config:

- Missing token/base URL: returns `status=missing_config`.
- Invalid token / wrong scope / sandbox mismatch: OpenAPI can return 401 or 403.
- Credit/payment required: OpenAPI can return 402.
- Wrong endpoint or obsolete path: 404.
- Service unavailable: 503.

Data quality:

- No companies returned for filters.
- Companies returned without coordinates.
- Coordinates present but no nearby OSM building within 150m.
- OSM polygon too small, too large, or not industrial-looking.
- Satellite fetch fails.
- Vision rejects roof.
- Asset fails min/max area or kWp thresholds.
- OpenAPI address present in nested registered office format but not parsed by current `_company_address()`.
- Production `dryRun=false` with `limit > 10` and no `confirmProduction=true`: rejected before the OpenAPI request.
- Production `limit` above `OPENAPI_COMPANY_PRODUCTION_MAX_LIMIT`: rejected before the OpenAPI request.

Persistence:

- `dryRun=true` never persists Tiloca records.
- `dryRun=false` persists only accepted roof-validated opportunities.
- Delivery wrapper associates only accepted `asset_ids`; rejected companies are not visible as delivery opportunities.

## Readiness for Real Company-First Deliveries

The architecture supports the desired company-first flow:

```text
real companies -> address/GPS -> rooftop verification -> persisted delivery opportunity
```

Current strengths:

- Uses Company API `IT-search`, not deprecated Imprese.
- Supports province, ATECO, employees, turnover, and activity status filters.
- Uses GPS coordinates when available.
- Persists `CompanyMatch` for accepted opportunities.
- Links accepted assets to a delivery through `delivery_assets`.
- Has hard limit cap of 50 per scan.
- Does not expose token in debug responses.

Current gaps before spending production credit at scale:

- Address parser is now hardened for `address.registeredOffice.*`.
- `dataEnrichment` is now configurable and defaults to `address`.
- The code does not call `/IT-address`, `/IT-start`, or `/IT-advanced/{id}` by VAT/ID after search.
- Rejected companies are not persisted as reviewable company candidates.
- Cost behavior must be confirmed from dry-run/account response.
- Sandbox proves mechanics, not lead quality.

## Smallest Next Step Before Paying

Recommended sequence:

1. Keep sandbox configured:

```text
OPENAPI_COMPANY_BASE_URL=https://test.company.openapi.com
OPENAPI_COMPANY_DRY_RUN=true
```

2. Run one dry-run with the exact IM-EL criteria:

```text
province=torino
atecoCode=25.62
minEmployees=5
maxEmployees=80
limit=10
dryRun=true
```

3. Confirm the response includes a cost estimate or enough billing metadata.
4. Run the parser test before production spend:

```powershell
.\.venv\Scripts\python.exe -m scripts.openapi_parsing_test
```

5. Use the explicit enrichment-level choice consciously:

```text
address / start / advanced
```

For IM-EL, `address` is the default safe mode for company name + legal address + GPS. `start` or `advanced` may be unnecessary until later.

6. Run one paid production micro-test only:

```text
province=torino
atecoCode=25.62
minEmployees=5
maxEmployees=80
limit=2
dryRun=false
dataEnrichment=address
```

7. Inspect:

- number of companies returned
- coordinates present
- registered office address parsed
- OSM roof match quality
- accepted opportunities
- persisted `company_match`
- actual charged credits

Only after that should Tiloca run larger 30-opportunity production scans.

## Bottom Line

The current endpoint is conceptually correct: Company API `GET /IT-search`, not deprecated Imprese.

Sandbox is enough for technical validation only.

Production credit is required to validate real commercial lead quality and actual charge behavior.

Before paying for a meaningful batch, run the parser test and then a `limit=2`, `dataEnrichment=address` paid micro-test.

## Phase 3.23 Safety Behavior

OpenAPI production safety hardening adds:

- Robust parsing for flat and nested registered-office response shapes.
- `OPENAPI_COMPANY_DEFAULT_DATA_ENRICHMENT=address`.
- Request body `dataEnrichment` accepts explicit modes such as `address`, `start`, or `advanced`.
- `OPENAPI_COMPANY_PRODUCTION_MAX_LIMIT=10` by default.
- `dryRun=false` with `limit > 10` requires `confirmProduction=true`.
- Requests above the configured production max are rejected before calling OpenAPI.
- Responses expose operational counters:
  - `requested_limit`
  - `actual_companies_returned`
  - `with_coordinates`
  - `without_coordinates`
  - `with_address`
  - `without_address`
  - `skipped_missing_address`
  - `skipped_missing_coordinates`
  - `estimated_or_configured_enrichment_mode`

These fields are safe to show in logs/UI because they do not expose tokens.

## Phase 3.24 Request Diagnostics

OpenAPI company-led scan responses now include the exact token-safe request diagnostics inside `debug_info`.

For dry-run and production responses, inspect:

```json
{
  "debug_info": {
    "request_url": "https://test.company.openapi.com/IT-search",
    "request_payload": {
      "dryRun": 1,
      "dataEnrichment": "address",
      "province": "TO",
      "limit": 2,
      "atecoCode": "25.62",
      "minEmployees": 5,
      "maxEmployees": 80
    },
    "territory": {
      "slug": "torino",
      "name": "Torino"
    },
    "ateco_filters_used": {
      "atecoCode": "25.62"
    },
    "employee_filters_used": {
      "minEmployees": 5,
      "maxEmployees": 80
    },
    "dataEnrichment": "address",
    "dryRun": 1
  }
}
```

This is meant to diagnose zero-company dry-runs before changing business logic. It helps distinguish:

- query too restrictive,
- malformed province or ATECO parameter,
- wrong enrichment mode,
- sandbox returning no representative records,
- endpoint/config mismatch.

The token is never included in `debug_info`.
