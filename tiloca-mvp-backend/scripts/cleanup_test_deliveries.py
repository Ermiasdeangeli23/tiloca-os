from __future__ import annotations

from sqlalchemy import or_

from app.core.database import SessionLocal
from app.models.delivery import Delivery, DeliveryAsset


TEST_SLUG_PREFIXES = (
    "api-smoke-test-",
    "delivery-smoke-test-",
)


def main() -> int:
    db = SessionLocal()
    try:
        test_deliveries = (
            db.query(Delivery)
            .filter(or_(*(Delivery.slug.startswith(prefix) for prefix in TEST_SLUG_PREFIXES)))
            .all()
        )
        delivery_ids = [delivery.id for delivery in test_deliveries]
        if not delivery_ids:
            print("PASS  No smoke-test deliveries found.")
            print("Deleted delivery_assets: 0")
            print("Deleted deliveries: 0")
            return 0

        deleted_joins = (
            db.query(DeliveryAsset)
            .filter(DeliveryAsset.delivery_id.in_(delivery_ids))
            .delete(synchronize_session=False)
        )
        deleted_deliveries = (
            db.query(Delivery)
            .filter(Delivery.id.in_(delivery_ids))
            .delete(synchronize_session=False)
        )
        db.commit()

        print("PASS  Smoke-test deliveries cleaned.")
        print(f"Deleted delivery_assets: {deleted_joins}")
        print(f"Deleted deliveries: {deleted_deliveries}")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
