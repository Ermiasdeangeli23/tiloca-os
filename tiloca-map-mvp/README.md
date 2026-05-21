# Tiloca Map MVP

First operational geospatial console for Tiloca industrial solar assets.

This is not a marketing website, CRM, or generic SaaS dashboard. The map is the product.

## Stack

- Next.js
- TypeScript
- Tailwind
- Mapbox GL JS
- FastAPI backend from `tiloca-mvp-backend`

## Environment

Create `.env.local`:

```powershell
Copy-Item .env.local.example .env.local
```

Values:

```text
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1IjoiZXJtaWFzZGVhbmdlbGkiLCJhIjoiY21vbG1waGc4MG03NzJyc2FnZjJtYTJ0dCJ9.vCLXrGcns36w-X9sAzSpJw
```

## Install

```powershell
npm install
```

If PowerShell blocks `npm.ps1`, use the Windows command shim:

```powershell
npm.cmd install
```

## Run Backend First

From `tiloca-mvp-backend`:

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

Confirm:

```powershell
Invoke-RestMethod -Method Get -Uri http://127.0.0.1:8000/health
Invoke-RestMethod -Method Get -Uri http://127.0.0.1:8000/territories
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8000/assets?territory=parma"
```

If no assets exist yet:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8000/scan/parma `
  -ContentType "application/json" `
  -Body '{"max_assets": 1}'
```

## Run Frontend

From `tiloca-map-mvp`:

```powershell
npm run dev
```

Or, if PowerShell blocks `npm.ps1`:

```powershell
npm.cmd run dev
```

Open:

```text
http://127.0.0.1:3000
```

## Validation

- Map loads with satellite basemap
- `GET /territories` fills the territory selector
- `GET /assets` renders industrial asset pins
- Suitability filter calls backend query params
- Minimum area and pipeline state filter locally
- Pin click opens asset intelligence drawer
- `POST /scan/parma` runs from the scan button with `max_assets=1`
- Assets refresh after scan completion

## Product Constraints

No auth, billing, analytics dashboard, notifications, AI copilots, CRM tables, or marketing sections.
