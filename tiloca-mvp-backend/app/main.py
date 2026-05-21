from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import assets, debug, deliveries, enrichment, scans, territories
from app.core.config import get_settings

app = FastAPI(
    title="Tiloca Operational Backend",
    description="Minimal geospatial intelligence backend for industrial PV asset scans.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:3000", "http://localhost:3000", "http://127.0.0.1:3001", "http://localhost:3001"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(territories.router)
app.include_router(assets.router)
app.include_router(scans.router)
app.include_router(deliveries.router)
app.include_router(enrichment.router)
app.include_router(debug.router)

storage_root = Path(get_settings().satellite_storage_dir).parent
storage_root.mkdir(parents=True, exist_ok=True)
app.mount("/storage", StaticFiles(directory=storage_root), name="storage")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
