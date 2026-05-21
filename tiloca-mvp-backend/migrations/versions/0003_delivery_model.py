"""delivery model

Revision ID: 0003_delivery_model
Revises: 0002_company_matches
Create Date: 2026-05-20
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003_delivery_model"
down_revision = "0002_company_matches"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP TYPE IF EXISTS delivery_status")
    op.execute("DROP TYPE IF EXISTS delivery_asset_reason")
    op.execute("CREATE TYPE delivery_status AS ENUM ('draft', 'active', 'delivered', 'archived')")
    op.execute("CREATE TYPE delivery_asset_reason AS ENUM ('scan_result', 'manual_add', 'carried_over')")

    delivery_status = postgresql.ENUM("draft", "active", "delivered", "archived", name="delivery_status", create_type=False)
    delivery_asset_reason = postgresql.ENUM("scan_result", "manual_add", "carried_over", name="delivery_asset_reason", create_type=False)

    op.create_table(
        "deliveries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("client_name", sa.String(length=240), nullable=False),
        sa.Column("client_contact", sa.String(length=240), nullable=True),
        sa.Column("target_provinces", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("criteria", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", delivery_status, nullable=False),
        sa.Column("target_opportunity_count", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_deliveries_slug", "deliveries", ["slug"])
    op.create_index("ix_deliveries_status", "deliveries", ["status"])

    op.create_table(
        "delivery_assets",
        sa.Column("delivery_id", sa.Integer(), nullable=False),
        sa.Column("asset_id", sa.Integer(), nullable=False),
        sa.Column("included_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("included_reason", delivery_asset_reason, nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["industrial_assets.id"]),
        sa.ForeignKeyConstraint(["delivery_id"], ["deliveries.id"]),
        sa.PrimaryKeyConstraint("delivery_id", "asset_id"),
    )
    op.create_index("ix_delivery_assets_delivery_id", "delivery_assets", ["delivery_id"])
    op.create_index("ix_delivery_assets_asset_id", "delivery_assets", ["asset_id"])
    op.create_index("ix_delivery_assets_delivery_asset", "delivery_assets", ["delivery_id", "asset_id"])


def downgrade() -> None:
    op.drop_index("ix_delivery_assets_delivery_asset", table_name="delivery_assets")
    op.drop_index("ix_delivery_assets_asset_id", table_name="delivery_assets")
    op.drop_index("ix_delivery_assets_delivery_id", table_name="delivery_assets")
    op.drop_table("delivery_assets")
    op.drop_index("ix_deliveries_status", table_name="deliveries")
    op.drop_index("ix_deliveries_slug", table_name="deliveries")
    op.drop_table("deliveries")
    op.execute("DROP TYPE IF EXISTS delivery_asset_reason")
    op.execute("DROP TYPE IF EXISTS delivery_status")
