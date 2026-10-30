"""Duck: 节点到期时间

Revision ID: d3uckexpire
Revises: d2uck4proto
Create Date: 2026-03-30

"""
from alembic import op
import sqlalchemy as sa

revision = "d3uckexpire"
down_revision = "d2uck4proto"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("nodes", sa.Column("expire_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("nodes", "expire_at")
