"""Duck: per-node proxy port and inbound tags

Revision ID: d1uck9a1b2c3
Revises: d0a3960f5dad
Create Date: 2026-03-30

"""
from alembic import op
import sqlalchemy as sa

revision = "d1uck9a1b2c3"
down_revision = "2b231de97dc3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("nodes", sa.Column("proxy_port", sa.Integer(), nullable=True))
    op.add_column("nodes", sa.Column("inbound_tags", sa.String(length=1024), nullable=True))


def downgrade() -> None:
    op.drop_column("nodes", "inbound_tags")
    op.drop_column("nodes", "proxy_port")
