"""ai_generated_content.week_number 컬럼 추가 마이그레이션 스크립트."""

import os
import sys

from sqlalchemy import inspect, text

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine  # noqa: E402


def migrate():
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    if "ai_generated_content" not in tables:
        print("[SKIP] table ai_generated_content does not exist")
        return

    cols = {c["name"] for c in insp.get_columns("ai_generated_content")}
    dialect = engine.dialect.name

    with engine.begin() as conn:
        if "week_number" not in cols:
            conn.execute(text("ALTER TABLE ai_generated_content ADD COLUMN week_number INTEGER"))
            print("[OK] added column: ai_generated_content.week_number")
        else:
            print("[SKIP] column already exists: ai_generated_content.week_number")

        idx_names = {idx["name"] for idx in insp.get_indexes("ai_generated_content")}
        if "idx_ai_content_project_week" not in idx_names:
            conn.execute(
                text(
                    "CREATE INDEX idx_ai_content_project_week "
                    "ON ai_generated_content (project_id, content_type, week_number, is_active)"
                )
            )
            print("[OK] created index: idx_ai_content_project_week")
        else:
            print("[SKIP] index already exists: idx_ai_content_project_week")

    print(f"done. dialect={dialect}")


if __name__ == "__main__":
    migrate()
