# Company Enrichment Gap Audit

Phase 3.21B diagnostic note. This is an inspection-only document; no behavior changes were implemented.

## Observed Issue

In `/deliveries/im-el`, the delivery dossier can show:

```text
Azienda: -
Indirizzo: -
Website: -
Fonte: -
```

while the same asset has valid geospatial and roof data such as coordinates, area, kWp estimate, suitability, and satellite image.

Live API spot check against `GET /deliveries/im-el/assets` showed:

```text
asset_count=22
first_id=50
name=
address=
metadata_source=
company_match=
```

That means the frontend is receiving an asset with no usable company fields.

## Backend Contract

Delivery assets are returned by:

```text
GET /deliveries/{slug}/assets
```

The route calls `get_delivery_with_assets()` in `app/services/delivery_service.py`.

That query loads:

```python
joinedload(IndustrialAsset.pipeline_state)
joinedload(IndustrialAsset.company_match)
```

The response model is:

```python
DeliveryAssetsRead.assets: list[AssetListRead]
```

`AssetListRead` includes:

```python
name
address
industrial_metadata
pipeline_state
company_match
```

`CompanyMatchRead` includes:

```python
company_name
address
website
category
source
distance_meters
match_confidence
match_score
match_reason
raw_payload
```

Conclusion: company match data is already part of the API contract. If it exists in the database, `/deliveries/{slug}/assets` should return it.

## Frontend Rendering

The delivery dossier in `components/DeliveryWorkspace.tsx` renders company fields as:

```tsx
asset.company_match?.company_name || asset.name || "-"
asset.company_match?.address || asset.address || "-"
asset.company_match?.website || "-"
asset.company_match?.source || String(asset.industrial_metadata?.source || "-")
```

This is correct fallback behavior for the current data shape.

Conclusion: company data is not being dropped in the delivery workspace. The UI shows `-` because both `company_match` and fallback asset fields are empty.

## Persistence Paths

### Roof-First OSM Scan

The generic roof-first persistence path is `persist_asset_analysis()` in `app/services/persistence.py`.

It persists:

```python
asset.name = building.get("name")
asset.address = building.get("address")
asset.industrial_metadata = building.get("tags", {})
```

It does not create a `CompanyMatch`.

This is expected for an OSM-first roof scan: many OSM building polygons have geometry and tags, but no company name, address, or commercial identity.

### Company-First Google Places Scan

`app/services/company_first_scan.py` does create company data.

Accepted results call:

```python
persist_asset_analysis(...)
_persist_company_match(db, asset.id, place)
```

`_persist_company_match()` writes:

```python
source = "google_places_company_first"
company_name
address
website
category
raw_payload
```

So company-first Google Places results should show commercial fields if they are accepted and linked to the delivery.

### OpenAPI Company-Led Scan

`app/services/openapi_company_scan.py` also creates company match data for accepted opportunities.

Accepted results call:

```python
asset = persist_asset_analysis(...)
_persist_openapi_company_match(db, asset.id, company, building)
result.asset_ids.append(asset.id)
```

Then `run_scan_for_delivery()` links returned `asset_ids` to the delivery via `delivery_assets`.

So OpenAPI company-led accepted opportunities should show:

```text
source=openapi_company
company_name
address if parsed
category/ATECO if parsed
raw_payload with VAT/tax/ATECO metadata
```

## Current Root Cause

The empty dossier is not caused by frontend rendering and not caused by the delivery API omitting `company_match`.

The root cause is that the IM-EL delivery currently includes roof/asset records that were created through a technical roof-first or carry-over path without company enrichment. Those assets have:

- no `company_matches` row
- empty or missing OSM `name`
- empty or missing OSM `address`
- empty or missing `industrial_metadata.source`

The delivery model correctly links assets to a client delivery, but linking an asset does not automatically enrich it.

In short:

```text
delivery_assets links roof assets
roof-first assets often have no company identity
company_match is only created by explicit company matching or company-led scan flows
therefore dossier company fields are empty
```

## Secondary Risk: OpenAPI Address Parsing

The OpenAPI scan flow persists company matches when an opportunity is accepted, but `_company_address()` currently looks for direct or shallow address fields first.

Earlier OpenAPI inspection showed registered office GPS under:

```text
address.registeredOffice.gps.coordinates
```

If registered office address fields are similarly nested, the current parser may fail to extract a useful postal address even when OpenAPI returns one. This would not explain a null `company_match`, but it can explain partial OpenAPI matches with a company name and missing address.

This should be checked before relying on OpenAPI CSV delivery fields.

## Minimal Fix Path

Recommended next implementation step:

1. Add an internal enrichment action for delivery assets that have no `company_match`.
2. Reuse the existing `match_company_for_asset()` service first, because it already supports one-asset enrichment and persists `CompanyMatch`.
3. Add a delivery-level utility or endpoint later only if needed, for example:

```text
POST /deliveries/{slug}/enrich-missing-companies
```

But the smallest immediate path is to expose a button/action in the delivery dossier that calls the already existing:

```text
POST /assets/{asset_id}/match-company
```

and then refetches:

```text
GET /assets/{asset_id}
GET /deliveries/{slug}/assets
```

4. For IM-EL production, prefer company-led acquisition paths for new assets:

```text
OpenAPI companies -> nearby roof validation -> company_match -> delivery_assets
```

instead of carrying over roof-first OSM assets without enrichment.

5. Improve OpenAPI address extraction if sandbox/live payloads confirm useful nested registered office address fields.

## Risks

- Automatic company matching can produce false positives if a roof is inside an industrial complex or near unrelated places.
- Existing Google Places matching is intentionally conservative after confidence tightening; many results may stay `low` or `none`.
- OpenAPI sandbox data is mock and may not be commercially representative.
- Delivery-scoped assets may mix old roof-first assets and new company-led assets unless the workflow clearly labels source and match confidence.
- A delivery-level bulk enrichment action could spend API quota if implemented without dry-run and limit guards.

## Commercial Usability Implication

For a delivery like IM-EL/Riccardo, roof suitability alone is not enough. A commercially usable opportunity needs at least:

- probable company name
- address
- source and confidence
- roof/kWp/suitability data
- manual review status

The current system already has the tables and API fields to represent this. The gap is operational: the assets currently linked to `im-el` were not all produced by a company-led or company-matched path.

## Clear Next Step

Implement a narrow enrichment pass for existing delivery assets:

```text
For each /deliveries/im-el asset where company_match is null:
  run POST /assets/{asset_id}/match-company
  persist CompanyMatch
  refetch delivery assets
  keep low/none confidence assets in needs_review
```

Do not change the delivery schema, UI layout, or OpenAPI behavior for this fix. The first goal is to fill company identity where a reliable match exists and make unresolved assets explicit rather than blank.
