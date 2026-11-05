"""Duck: node enroll token + api_secret + reality

Revision ID: e5ducknode
"""
from alembic import op
import sqlalchemy as sa

revision = "e5ducknode"
down_revision = "d3uckexpire"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("nodes", sa.Column("api_secret", sa.String(128), nullable=True))
    op.add_column("nodes", sa.Column("enroll_token", sa.String(64), nullable=True))
    op.add_column("nodes", sa.Column("enroll_expires_at", sa.DateTime(), nullable=True))
    op.add_column("nodes", sa.Column("reality_meta", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("nodes", "reality_meta")
    op.drop_column("nodes", "enroll_expires_at")
    op.drop_column("nodes", "enroll_token")
    op.drop_column("nodes", "api_secret")
