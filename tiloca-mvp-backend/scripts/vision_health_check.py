from __future__ import annotations

import sys
from pathlib import Path

from app.core.config import get_settings
from app.services.vision_analysis import analyze_roof


def _find_sample_image(storage_dir: Path) -> Path | None:
    if not storage_dir.exists():
        return None
    for pattern in ("*.jpg", "*.jpeg", "*.png", "*.webp"):
        image = next(storage_dir.rglob(pattern), None)
        if image:
            return image
    return None


def _fail(reason: str) -> int:
    print(f"VISION HEALTH: FAIL - {reason}")
    return 1


def main() -> int:
    settings = get_settings()
    image_path = _find_sample_image(settings.satellite_storage_dir)
    if image_path is None:
        return _fail(f"no satellite image found under {settings.satellite_storage_dir}")

    print(f"VISION HEALTH: sample_image={image_path}")
    analysis = analyze_roof(image_path)

    vision_status = analysis.get("vision_status")
    vision_error = analysis.get("vision_error")
    parsing_error = analysis.get("parsing_error")
    roof_type = analysis.get("tipo_tetto")
    suitability = analysis.get("idoneita")

    if vision_status == "error":
        details = vision_error or analysis.get("note") or "vision_status=error"
        if parsing_error:
            details = f"{details}; parsing_error={parsing_error}"
        return _fail(details)

    if not roof_type:
        return _fail(f"missing tipo_tetto; response={analysis}")

    if not suitability or suitability == "errore":
        return _fail(f"invalid idoneita={suitability!r}; response={analysis}")

    print(f"VISION HEALTH: roof_type={roof_type}")
    print(f"VISION HEALTH: suitability={suitability}")
    print("VISION HEALTH: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
