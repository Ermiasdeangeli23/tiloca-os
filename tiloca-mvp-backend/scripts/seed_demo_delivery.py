from __future__ import annotations

from app.core.database import SessionLocal
from app.models.delivery import Delivery
from app.services.delivery_service import create_delivery, update_delivery


IMEL_CRITERIA = {
    "ateco_codes": ["25.62"],
    "min_area_mq": 2000,
    "max_area_mq": 30000,
    "min_kwp": 300,
    "max_kwp": 2500,
    "min_employees": 5,
    "max_employees": 80,
    "suitability_floor": "media",
    "limit": 2,
    "dryRun": True,
    "dataEnrichment": False,
}


def main() -> int:
    db = SessionLocal()
    try:
        existing = db.query(Delivery).filter(Delivery.slug == "im-el").first()
        if existing:
            update_delivery(
                db,
                "im-el",
                client_name="IM-EL",
                target_provinces=["torino", "cuneo"],
                criteria=IMEL_CRITERIA,
                status="draft",
                target_opportunity_count=30,
                notes="Demo delivery for Riccardo / IM-EL local validation.",
            )
            print("PASS  Demo delivery updated (slug=im-el)")
            return 0

        delivery = create_delivery(
            db=db,
            client_name="IM-EL",
            target_provinces=["torino", "cuneo"],
            criteria=IMEL_CRITERIA,
            status="draft",
            target_opportunity_count=30,
            notes="Demo delivery for Riccardo / IM-EL local validation.",
        )
        print(f"PASS  Demo delivery created (slug={delivery.slug})")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
