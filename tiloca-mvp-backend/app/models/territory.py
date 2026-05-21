from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Territory(Base):
    __tablename__ = "territories"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    profile: Mapped[str] = mapped_column(String(80), default="standard")
    min_area_mq: Mapped[int] = mapped_column(Integer, default=2000)
    min_kwp: Mapped[int] = mapped_column(Integer, default=150)
    bbox_lat_min: Mapped[float] = mapped_column(Float)
    bbox_lon_min: Mapped[float] = mapped_column(Float)
    bbox_lat_max: Mapped[float] = mapped_column(Float)
    bbox_lon_max: Mapped[float] = mapped_column(Float)
    geom = mapped_column(Geometry("POLYGON", srid=4326), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    scans = relationship("Scan", back_populates="territory")
    assets = relationship("IndustrialAsset", back_populates="territory")
