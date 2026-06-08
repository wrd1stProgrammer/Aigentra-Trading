from app.core.config import Settings
from app.db import make_engine_options


def test_postgres_engine_pool_options_respect_explicit_settings():
    settings = Settings(
        database_pool_size=3,
        database_max_overflow=2,
        database_pool_timeout_seconds=10,
        database_pool_recycle_seconds=180,
        database_connect_timeout_seconds=10,
    )

    options = make_engine_options("postgresql+psycopg://user:pass@example.com/db", settings)

    assert options["pool_pre_ping"] is True
    assert options["pool_size"] == 3
    assert options["max_overflow"] == 2
    assert options["pool_timeout"] == 10
    assert options["pool_recycle"] == 180


def test_sqlite_engine_options_remain_local_file_safe(tmp_path):
    db_path = tmp_path / "dev.db"

    options = make_engine_options(f"sqlite:///{db_path}", Settings())

    assert options["connect_args"]["check_same_thread"] is False
    assert options["connect_args"]["timeout"] >= 30
