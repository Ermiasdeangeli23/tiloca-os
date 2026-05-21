"""initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-05-13
"""
from alembic import op
import geoalchemy2
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "territories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("profile", sa.String(length=80), nullable=False),
        sa.Column("min_area_mq", sa.Integer(), nullable=False),
        sa.Column("min_kwp", sa.Integer(), nullable=False),
        sa.Column("bbox_lat_min", sa.Float(), nullable=False),
        sa.Column("bbox_lon_min", sa.Float(), nullable=False),
        sa.Column("bbox_lat_max", sa.Float(), nullable=False),
        sa.Column("bbox_lon_max", sa.Float(), nullable=False),
        sa.Column("geom", geoalchemy2.types.Geometry(geometry_type="POLYGON", srid=4326), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_territories_slug", "territories", ["slug"])

    op.create_table(
        "scans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("territory_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("profile", sa.String(length=80), nullable=False),
        sa.Column("max_assets", sa.Integer(), nullable=False),
        sa.Column("osm_candidates_count", sa.Integer(), nullable=False),
        sa.Column("analyzed_count", sa.Integer(), nullable=False),
        sa.Column("persisted_count", sa.Integer(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["territory_id"], ["territories.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_scans_status", "scans", ["status"])
    op.create_index("ix_scans_territory_id", "scans", ["territory_id"])

    op.create_table(
        "industrial_assets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("territory_id", sa.Integer(), nullable=False),
        sa.Column("osm_id", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=240), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("building_type", sa.String(length=80), nullable=True),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lon", sa.Float(), nullable=False),
        sa.Column("area_mq", sa.Integer(), nullable=False),
        sa.Column("estimated_kwp", sa.Integer(), nullable=True),
        sa.Column("roof_type", sa.String(length=40), nullable=True),
        sa.Column("suitability", sa.String(length=40), nullable=True),
        sa.Column("satellite_image_path", sa.Text(), nullable=True),
        sa.Column("industrial_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("point", geoalchemy2.types.Geometry(geometry_type="POINT", srid=4326), nullable=False),
        sa.Column("footprint", geoalchemy2.types.Geometry(geometry_type="POLYGON", srid=4326), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["territory_id"], ["territories.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("osm_id", "territory_id", name="uq_asset_osm_territory"),
    )
    op.create_index("ix_industrial_assets_osm_id", "industrial_assets", ["osm_id"])
    op.create_index("ix_industrial_assets_point", "industrial_assets", ["point"], postgresql_using="gist")
    op.create_index("ix_industrial_assets_footprint", "industrial_assets", ["footprint"], postgresql_using="gist")
    op.create_index("ix_industrial_assets_suitability", "industrial_assets", ["suitability"])
    op.create_index("ix_industrial_assets_territory_id", "industrial_assets", ["territory_id"])

    op.create_table(
        "asset_analysis",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("asset_id", sa.Integer(), nullable=False),
        sa.Column("scan_id", sa.Integer(), nullable=False),
        sa.Column("roof_type", sa.String(length=40), nullable=True),
        sa.Column("roof_quality", sa.String(length=40), nullable=True),
        sa.Column("orientation", sa.String(length=40), nullable=True),
        sa.Column("obstacles", sa.String(length=40), nullable=True),
        sa.Column("has_panels", sa.Boolean(), nullable=False),
        sa.Column("suitability", sa.String(length=40), nullable=False),
        sa.Column("estimated_kwp", sa.Integer(), nullable=False),
        sa.Column("satellite_image_path", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("raw_vision", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["industrial_assets.id"]),
        sa.ForeignKeyConstraint(["scan_id"], ["scans.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_asset_analysis_asset_id", "asset_analysis", ["asset_id"])
    op.create_index("ix_asset_analysis_scan_id", "asset_analysis", ["scan_id"])
    op.create_index("ix_asset_analysis_suitability", "asset_analysis", ["suitability"])

    op.create_table(
        "asset_pipeline_state",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("asset_id", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(length=40), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["industrial_assets.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("asset_id"),
    )
    op.create_index("ix_asset_pipeline_state_asset_id", "asset_pipeline_state", ["asset_id"])
    op.create_index("ix_asset_pipeline_state_state", "asset_pipeline_state", ["state"])


def downgrade() -> None:
    op.drop_table("asset_pipeline_state")
    op.drop_table("asset_analysis")
    op.drop_table("industrial_assets")
    op.drop_table("scans")
    op.drop_table("territories")
