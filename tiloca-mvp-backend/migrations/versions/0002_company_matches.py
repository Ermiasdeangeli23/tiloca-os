"""company matches

Revision ID: 0002_company_matches
Revises: 0001_initial_schema
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002_company_matches"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "company_matches",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("asset_id", sa.Integer(), nullable=False),
        sa.Column("company_name", sa.String(length=240), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("website", sa.Text(), nullable=True),
        sa.Column("category", sa.String(length=160), nullable=True),
        sa.Column("source", sa.String(length=80), nullable=False),
        sa.Column("distance_meters", sa.Float(), nullable=True),
        sa.Column("match_confidence", sa.String(length=40), nullable=False),
        sa.Column("match_score", sa.Integer(), nullable=False),
        sa.Column("match_reason", sa.Text(), nullable=True),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["industrial_assets.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("asset_id", name="uq_company_match_asset"),
    )
    op.create_index("ix_company_matches_asset_id", "company_matches", ["asset_id"])
    op.create_index("ix_company_matches_match_confidence", "company_matches", ["match_confidence"])


def downgrade() -> None:
    op.drop_index("ix_company_matches_match_confidence", table_name="company_matches")
    op.drop_index("ix_company_matches_asset_id", table_name="company_matches")
    op.drop_table("company_matches")
