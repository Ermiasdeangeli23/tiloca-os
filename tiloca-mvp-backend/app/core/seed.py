from sqlalchemy.orm import Session

from app.models.territory import Territory


DEFAULT_TERRITORIES = {
    "parma": (44.50, 9.80, 45.00, 10.60),
    "brescia": (45.30, 9.90, 45.80, 10.60),
    "bergamo": (45.55, 9.50, 45.90, 10.10),
    "verona": (45.20, 10.60, 45.60, 11.30),
    "reggio_emilia": (44.50, 10.20, 44.90, 10.80),
    "modena": (44.40, 10.60, 44.80, 11.10),
    "vicenza": (45.40, 11.20, 45.80, 11.80),
    "treviso": (45.60, 11.80, 45.95, 12.30),
    "torino": (44.65, 6.60, 45.60, 8.15),
    "cuneo": (43.88, 6.95, 44.95, 8.35),
}


def seed_default_territories(db: Session) -> None:
    for slug, bbox in DEFAULT_TERRITORIES.items():
        exists = db.query(Territory).filter(Territory.slug == slug).first()
        if exists:
            continue
        lat_min, lon_min, lat_max, lon_max = bbox
        db.add(
            Territory(
                slug=slug,
                name=slug.replace("_", " ").title(),
                profile="sunsolution",
                min_area_mq=3000,
                min_kwp=300,
                bbox_lat_min=lat_min,
                bbox_lon_min=lon_min,
                bbox_lat_max=lat_max,
                bbox_lon_max=lon_max,
            )
        )
    db.commit()
