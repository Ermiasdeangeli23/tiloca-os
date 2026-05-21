import re
from pathlib import Path

import requests

from app.core.config import get_settings


def safe_asset_name(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]", "_", value)[:25] or "asset"


def fetch_satellite_image(
    lat: float,
    lon: float,
    output_path: Path,
    zoom: int = 18,
) -> bool:
    settings = get_settings()
    if not settings.google_api_key:
        raise RuntimeError("GOOGLE_API_KEY is not configured")

    url = (
        "https://maps.googleapis.com/maps/api/staticmap"
        f"?center={lat},{lon}&zoom={zoom}&size=640x640"
        f"&maptype=satellite&key={settings.google_api_key}"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        response = requests.get(url, timeout=15)
        if response.status_code == 200 and len(response.content) > 5000:
            output_path.write_bytes(response.content)
            return True
    except requests.RequestException:
        return False
    return False
