from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[int] = mapped_column(primary_key=True)
    territory_id: Mapped[int] = mapped_column(ForeignKey("territories.id"), index=True)
    status: Mapped[str] = mapped_column(String(40), default="running", index=True)
    profile: Mapped[str] = mapped_column(String(80), default="standard")
    max_assets: Mapped[int] = mapped_column(Integer, default=30)
    osm_candidates_count: Mapped[int] = mapped_column(Integer, default=0)
    analyzed_count: Mapped[int] = mapped_column(Integer, default=0)
    persisted_count: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    territory = relationship("Territory", back_populates="scans")
    analyses = relationship("AssetAnalysis", back_populates="scan")

    @property
    def rejected_count(self) -> int:
        return max((self.analyzed_count or 0) - (self.persisted_count or 0), 0)

    @property
    def skipped_count(self) -> int:
        return max((self.osm_candidates_count or 0) - (self.analyzed_count or 0), 0)

    @property
    def filters_used(self) -> dict | None:
        return getattr(self, "_filters_used", None)

    @property
    def debug_info(self) -> dict | None:
        return getattr(self, "_debug_info", None)
