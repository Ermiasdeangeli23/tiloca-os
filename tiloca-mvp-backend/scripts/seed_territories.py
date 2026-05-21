from app.core.database import SessionLocal
from app.core.seed import seed_default_territories


def main() -> None:
    db = SessionLocal()
    try:
        seed_default_territories(db)
        print("Default territories seeded")
    finally:
        db.close()


if __name__ == "__main__":
    main()
