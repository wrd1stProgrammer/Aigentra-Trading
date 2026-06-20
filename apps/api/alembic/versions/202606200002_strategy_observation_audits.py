"""add strategy observation audit tables

Revision ID: 202606200002
Revises: 202606200001
Create Date: 2026-06-20 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "202606200002"
down_revision: Union[str, None] = "202606200001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "first_stage_audit_reports",
        sa.Column("scanner_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scanner_finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("market_regime", sa.String(length=80), nullable=True),
        sa.Column("total_traders", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("candidate_ready_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("observe_only_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("no_trade_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ai_rejected_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cooldown_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active_exposure_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("symbol", sa.String(length=32), nullable=True),
        sa.Column("trader_id", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=80), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("raw_json", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_first_stage_audit_reports_id"), "first_stage_audit_reports", ["id"], unique=False)
    op.create_index(op.f("ix_first_stage_audit_reports_created_at"), "first_stage_audit_reports", ["created_at"], unique=False)
    op.create_index(op.f("ix_first_stage_audit_reports_symbol"), "first_stage_audit_reports", ["symbol"], unique=False)
    op.create_index(op.f("ix_first_stage_audit_reports_trader_id"), "first_stage_audit_reports", ["trader_id"], unique=False)
    op.create_index(op.f("ix_first_stage_audit_reports_status"), "first_stage_audit_reports", ["status"], unique=False)
    op.create_index(op.f("ix_first_stage_audit_reports_scanner_started_at"), "first_stage_audit_reports", ["scanner_started_at"], unique=False)
    op.create_index(op.f("ix_first_stage_audit_reports_scanner_finished_at"), "first_stage_audit_reports", ["scanner_finished_at"], unique=False)
    op.create_index(op.f("ix_first_stage_audit_reports_market_regime"), "first_stage_audit_reports", ["market_regime"], unique=False)
    op.create_index("ix_first_stage_audit_reports_symbol_created", "first_stage_audit_reports", ["symbol", "created_at"], unique=False)
    op.create_index("ix_first_stage_audit_reports_symbol_status", "first_stage_audit_reports", ["symbol", "status", "created_at"], unique=False)

    op.create_table(
        "observation_candidates",
        sa.Column("run_id", sa.Integer(), nullable=True),
        sa.Column("candidate_trade_id", sa.Integer(), nullable=True),
        sa.Column("ai_review_id", sa.Integer(), nullable=True),
        sa.Column("observation_type", sa.String(length=80), nullable=False),
        sa.Column("side", sa.String(length=20), nullable=True),
        sa.Column("setup_type", sa.String(length=140), nullable=True),
        sa.Column("setup_score", sa.Integer(), nullable=True),
        sa.Column("decision", sa.String(length=60), nullable=True),
        sa.Column("entry_price", sa.Float(), nullable=True),
        sa.Column("stop_loss", sa.Float(), nullable=True),
        sa.Column("first_take_profit", sa.Float(), nullable=True),
        sa.Column("outcome_status", sa.String(length=80), nullable=True),
        sa.Column("outcome_r", sa.Float(), nullable=True),
        sa.Column("outcome_recorded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("symbol", sa.String(length=32), nullable=True),
        sa.Column("trader_id", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=80), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("raw_json", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["ai_review_id"], ["ai_reviews.id"]),
        sa.ForeignKeyConstraint(["candidate_trade_id"], ["candidate_trades.id"]),
        sa.ForeignKeyConstraint(["run_id"], ["trader_run_logs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_observation_candidates_id"), "observation_candidates", ["id"], unique=False)
    op.create_index(op.f("ix_observation_candidates_created_at"), "observation_candidates", ["created_at"], unique=False)
    op.create_index(op.f("ix_observation_candidates_symbol"), "observation_candidates", ["symbol"], unique=False)
    op.create_index(op.f("ix_observation_candidates_trader_id"), "observation_candidates", ["trader_id"], unique=False)
    op.create_index(op.f("ix_observation_candidates_status"), "observation_candidates", ["status"], unique=False)
    op.create_index(op.f("ix_observation_candidates_run_id"), "observation_candidates", ["run_id"], unique=False)
    op.create_index(op.f("ix_observation_candidates_candidate_trade_id"), "observation_candidates", ["candidate_trade_id"], unique=False)
    op.create_index(op.f("ix_observation_candidates_ai_review_id"), "observation_candidates", ["ai_review_id"], unique=False)
    op.create_index(op.f("ix_observation_candidates_observation_type"), "observation_candidates", ["observation_type"], unique=False)
    op.create_index(op.f("ix_observation_candidates_side"), "observation_candidates", ["side"], unique=False)
    op.create_index(op.f("ix_observation_candidates_setup_type"), "observation_candidates", ["setup_type"], unique=False)
    op.create_index(op.f("ix_observation_candidates_decision"), "observation_candidates", ["decision"], unique=False)
    op.create_index(op.f("ix_observation_candidates_outcome_status"), "observation_candidates", ["outcome_status"], unique=False)
    op.create_index(op.f("ix_observation_candidates_outcome_recorded_at"), "observation_candidates", ["outcome_recorded_at"], unique=False)
    op.create_index("ix_observation_candidates_symbol_trader_created", "observation_candidates", ["symbol", "trader_id", "created_at"], unique=False)
    op.create_index("ix_observation_candidates_type_created", "observation_candidates", ["observation_type", "created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_observation_candidates_type_created", table_name="observation_candidates")
    op.drop_index("ix_observation_candidates_symbol_trader_created", table_name="observation_candidates")
    op.drop_index(op.f("ix_observation_candidates_decision"), table_name="observation_candidates")
    op.drop_index(op.f("ix_observation_candidates_outcome_recorded_at"), table_name="observation_candidates")
    op.drop_index(op.f("ix_observation_candidates_outcome_status"), table_name="observation_candidates")
    op.drop_index(op.f("ix_observation_candidates_setup_type"), table_name="observation_candidates")
    op.drop_index(op.f("ix_observation_candidates_side"), table_name="observation_candidates")
    op.drop_index(op.f("ix_observation_candidates_observation_type"), table_name="observation_candidates")
    op.drop_index(op.f("ix_observation_candidates_ai_review_id"), table_name="observation_candidates")
    op.drop_index(op.f("ix_observation_candidates_candidate_trade_id"), table_name="observation_candidates")
    op.drop_index(op.f("ix_observation_candidates_run_id"), table_name="observation_candidates")
    op.drop_index(op.f("ix_observation_candidates_status"), table_name="observation_candidates")
    op.drop_index(op.f("ix_observation_candidates_trader_id"), table_name="observation_candidates")
    op.drop_index(op.f("ix_observation_candidates_symbol"), table_name="observation_candidates")
    op.drop_index(op.f("ix_observation_candidates_created_at"), table_name="observation_candidates")
    op.drop_index(op.f("ix_observation_candidates_id"), table_name="observation_candidates")
    op.drop_table("observation_candidates")

    op.drop_index("ix_first_stage_audit_reports_symbol_status", table_name="first_stage_audit_reports")
    op.drop_index("ix_first_stage_audit_reports_symbol_created", table_name="first_stage_audit_reports")
    op.drop_index(op.f("ix_first_stage_audit_reports_market_regime"), table_name="first_stage_audit_reports")
    op.drop_index(op.f("ix_first_stage_audit_reports_scanner_finished_at"), table_name="first_stage_audit_reports")
    op.drop_index(op.f("ix_first_stage_audit_reports_scanner_started_at"), table_name="first_stage_audit_reports")
    op.drop_index(op.f("ix_first_stage_audit_reports_status"), table_name="first_stage_audit_reports")
    op.drop_index(op.f("ix_first_stage_audit_reports_trader_id"), table_name="first_stage_audit_reports")
    op.drop_index(op.f("ix_first_stage_audit_reports_symbol"), table_name="first_stage_audit_reports")
    op.drop_index(op.f("ix_first_stage_audit_reports_created_at"), table_name="first_stage_audit_reports")
    op.drop_index(op.f("ix_first_stage_audit_reports_id"), table_name="first_stage_audit_reports")
    op.drop_table("first_stage_audit_reports")
