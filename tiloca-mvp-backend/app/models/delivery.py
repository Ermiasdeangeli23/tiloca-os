from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


DELIVERY_STATUSES = ("draft", "active", "delivered", "archived")
DELIVERY_ASSET_REASONS = ("scan_result", "manual_add", "carried_over")


class Delivery(Base):
    __tablename__ = "deliveries"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    client_name: Mapped[str] = mapped_column(String(240))
    client_contact: Mapped[str | None] = mapped_column(String(240), nullable=True)
    target_provinces: Mapped[list] = mapped_column(JSONB, default=list)
    criteria: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(
        Enum(*DELIVERY_STATUSES, name="delivery_status"),
        default="draft",
        index=True,
    )
    target_opportunity_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    delivery_assets = relationship(
        "DeliveryAsset",
        back_populates="delivery",
        cascade="all, delete-orphan",
    )


class DeliveryAsset(Base):
    __tablename__ = "delivery_assets"

    delivery_id: Mapped[int] = mapped_column(ForeignKey("deliveries.id"), primary_key=True, index=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("industrial_assets.id"), primary_key=True, index=True)
    included_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    included_reason: Mapped[str] = mapped_column(
        Enum(*DELIVERY_ASSET_REASONS, name="delivery_asset_reason"),
        default="manual_add",
    )

    delivery = relationship("Delivery", back_populates="delivery_assets")
    asset = relationship("IndustrialAsset")
