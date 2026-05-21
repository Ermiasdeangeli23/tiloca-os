from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CompanyMatch(Base):
    __tablename__ = "company_matches"
    __table_args__ = (UniqueConstraint("asset_id", name="uq_company_match_asset"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("industrial_assets.id"), index=True)
    company_name: Mapped[str | None] = mapped_column(String(240), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    website: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(160), nullable=True)
    source: Mapped[str] = mapped_column(String(80), default="none")
    distance_meters: Mapped[float | None] = mapped_column(Float, nullable=True)
    match_confidence: Mapped[str] = mapped_column(String(40), default="none", index=True)
    match_score: Mapped[int] = mapped_column(Integer, default=0)
    match_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    asset = relationship("IndustrialAsset", back_populates="company_match")
