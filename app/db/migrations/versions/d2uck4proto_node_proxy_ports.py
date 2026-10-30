"""Duck: per-node four-protocol proxy ports (JSON)

Revision ID: d2uck4proto
Revises: d1uck9a1b2c3
Create Date: 2026-03-30

"""
from alembic import op
import sqlalchemy as sa

revision = "d2uck4proto"
down_revision = "d1uck9a1b2c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("nodes", sa.Column("proxy_ports", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("nodes", "proxy_ports")
