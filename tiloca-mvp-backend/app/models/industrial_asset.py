from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class IndustrialAsset(Base):
    __tablename__ = "industrial_assets"
    __table_args__ = (UniqueConstraint("osm_id", "territory_id", name="uq_asset_osm_territory"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    territory_id: Mapped[int] = mapped_column(ForeignKey("territories.id"), index=True)
    osm_id: Mapped[str] = mapped_column(String(80), index=True)
    name: Mapped[str | None] = mapped_column(String(240), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    building_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    area_mq: Mapped[int] = mapped_column(Integer)
    estimated_kwp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    roof_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    suitability: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    satellite_image_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    industrial_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    point = mapped_column(Geometry("POINT", srid=4326), nullable=False)
    footprint = mapped_column(Geometry("POLYGON", srid=4326), nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    territory = relationship("Territory", back_populates="assets")
    analyses = relationship("AssetAnalysis", back_populates="asset")
    pipeline_state = relationship("AssetPipelineState", back_populates="asset", uselist=False)
    company_match = relationship("CompanyMatch", back_populates="asset", uselist=False)
