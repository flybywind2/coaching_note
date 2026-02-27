from pathlib import Path
from uuid import uuid4

from sqlalchemy import Column, Index, Integer, MetaData, String, Table, create_engine, inspect

from app.utils.schema_sync import sync_missing_schema_objects


def test_sync_missing_schema_objects_adds_column_and_index():
    db_path = Path(f"./schema_sync_{uuid4().hex}.db").resolve()
    engine = create_engine(f"sqlite:///{db_path}")

    base_metadata = MetaData()
    Table(
        "sync_target",
        base_metadata,
        Column("id", Integer, primary_key=True),
        Column("name", String(100), nullable=False),
    )
    base_metadata.create_all(engine)

    target_metadata = MetaData()
    table = Table(
        "sync_target",
        target_metadata,
        Column("id", Integer, primary_key=True),
        Column("name", String(100), nullable=False),
        Column("email", String(150), nullable=True),
    )
    Index("idx_sync_target_name", table.c.name)

    sync_missing_schema_objects(engine, target_metadata)

    inspector = inspect(engine)
    column_names = {row["name"] for row in inspector.get_columns("sync_target")}
    index_names = {row.get("name") for row in inspector.get_indexes("sync_target")}

    assert "email" in column_names
    assert "idx_sync_target_name" in index_names

    engine.dispose()
    if db_path.exists():
        db_path.unlink()
