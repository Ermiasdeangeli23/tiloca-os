from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class AssetAnalysis(Base):
    __tablename__ = "asset_analysis"

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("industrial_assets.id"), index=True)
    scan_id: Mapped[int] = mapped_column(ForeignKey("scans.id"), index=True)
    roof_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    roof_quality: Mapped[str | None] = mapped_column(String(40), nullable=True)
    orientation: Mapped[str | None] = mapped_column(String(40), nullable=True)
    obstacles: Mapped[str | None] = mapped_column(String(40), nullable=True)
    has_panels: Mapped[bool] = mapped_column(Boolean, default=False)
    suitability: Mapped[str] = mapped_column(String(40), index=True)
    estimated_kwp: Mapped[int] = mapped_column(Integer)
    satellite_image_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_vision: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    asset = relationship("IndustrialAsset", back_populates="analyses")
    scan = relationship("Scan", back_populates="analyses")
