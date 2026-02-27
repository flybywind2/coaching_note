"""런타임 스키마 동기화 유틸리티."""

from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.schema import CreateColumn, CreateIndex, MetaData


def sync_missing_schema_objects(engine: Engine, metadata: MetaData) -> None:
    """모델 메타데이터 기준으로 누락된 컬럼/인덱스를 DB에 추가한다."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    preparer = engine.dialect.identifier_preparer

    with engine.begin() as conn:
        for table in metadata.sorted_tables:
            if table.name not in existing_tables:
                continue

            existing_columns = {
                str(row.get("name"))
                for row in inspector.get_columns(table.name)
                if row.get("name")
            }
            table_sql = preparer.format_table(table)

            for column in table.columns:
                if column.name in existing_columns:
                    continue
                column_sql = str(CreateColumn(column).compile(dialect=engine.dialect)).strip()
                conn.execute(text(f"ALTER TABLE {table_sql} ADD COLUMN {column_sql}"))

            existing_index_names = {
                str(row.get("name"))
                for row in inspector.get_indexes(table.name)
                if row.get("name")
            }
            for index in table.indexes:
                if not index.name or index.name in existing_index_names:
                    continue
                conn.execute(CreateIndex(index))
