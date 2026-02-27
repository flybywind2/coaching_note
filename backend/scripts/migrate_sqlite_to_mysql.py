"""Migrate data from SQLite to MySQL for the coaching_note backend.

Usage example:
  python scripts/migrate_sqlite_to_mysql.py \
    --mysql-url "mysql+pymysql://user:pass@127.0.0.1:3306/coaching_note?charset=utf8mb4" \
    --dry-run
"""

from __future__ import annotations

import argparse
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from sqlalchemy import MetaData, Table, create_engine, text
from sqlalchemy.engine import Engine


# [FEEDBACK7] 마이그레이션 시 제외할 내부 테이블 목록
SKIP_TABLES = {"alembic_version"}


@dataclass
class MigrationResult:
    table_name: str
    row_count: int
    status: str
    detail: str = ""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migrate SQLite data into MySQL tables.")
    parser.add_argument(
        "--sqlite-path",
        default="ssp_coaching.db",
        help="Path to SQLite DB file (default: ssp_coaching.db)",
    )
    parser.add_argument(
        "--mysql-url",
        required=True,
        help="SQLAlchemy MySQL URL (mysql+pymysql://...)",
    )
    parser.add_argument(
        "--tables",
        nargs="*",
        default=None,
        help="Optional table names to migrate (space-separated). If omitted, migrate all.",
    )
    parser.add_argument(
        "--truncate",
        action="store_true",
        help="Use TRUNCATE TABLE before insert (default: DELETE).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print migration plan and row counts without writing to MySQL.",
    )
    return parser.parse_args()


def quote_sqlite_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def load_sqlite_tables(sqlite_conn: sqlite3.Connection) -> list[str]:
    rows = sqlite_conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).fetchall()
    tables = [str(row["name"]) for row in rows]
    return [t for t in tables if not t.startswith("sqlite_") and t not in SKIP_TABLES]


def count_rows(sqlite_conn: sqlite3.Connection, table_name: str) -> int:
    q = f"SELECT COUNT(*) AS c FROM {quote_sqlite_ident(table_name)}"
    row = sqlite_conn.execute(q).fetchone()
    return int(row["c"] if row else 0)


def read_rows(sqlite_conn: sqlite3.Connection, table_name: str) -> list[dict]:
    q = f"SELECT * FROM {quote_sqlite_ident(table_name)}"
    rows = sqlite_conn.execute(q).fetchall()
    return [dict(row) for row in rows]


def disable_fk_checks(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("SET FOREIGN_KEY_CHECKS=0"))


def enable_fk_checks(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("SET FOREIGN_KEY_CHECKS=1"))


def clear_table(conn, table: Table, table_name: str, use_truncate: bool) -> None:
    if use_truncate:
        conn.execute(text(f"TRUNCATE TABLE `{table_name}`"))
    else:
        conn.execute(table.delete())


def migrate(
    sqlite_conn: sqlite3.Connection,
    mysql_engine: Engine,
    selected_tables: set[str] | None,
    use_truncate: bool,
    dry_run: bool,
) -> list[MigrationResult]:
    metadata = MetaData()
    metadata.reflect(bind=mysql_engine)
    mysql_tables = set(metadata.tables.keys())

    table_names = load_sqlite_tables(sqlite_conn)
    if selected_tables is not None:
        table_names = [t for t in table_names if t in selected_tables]

    results: list[MigrationResult] = []
    if not dry_run:
        disable_fk_checks(mysql_engine)

    try:
        for table_name in table_names:
            row_count = count_rows(sqlite_conn, table_name)

            if table_name not in mysql_tables:
                results.append(MigrationResult(table_name, row_count, "SKIP", "missing in MySQL schema"))
                continue

            if dry_run:
                results.append(MigrationResult(table_name, row_count, "PLAN", "ready"))
                continue

            table: Table = metadata.tables[table_name]
            payload = read_rows(sqlite_conn, table_name)
            with mysql_engine.begin() as conn:
                clear_table(conn, table, table_name, use_truncate)
                if payload:
                    conn.execute(table.insert(), payload)
            results.append(MigrationResult(table_name, len(payload), "OK", "migrated"))
    finally:
        if not dry_run:
            enable_fk_checks(mysql_engine)

    return results


def print_results(results: Iterable[MigrationResult], dry_run: bool) -> None:
    rows = list(results)
    mode = "DRY-RUN" if dry_run else "EXECUTE"
    print(f"[{mode}] migration summary")
    total_rows = 0
    for row in rows:
        total_rows += int(row.row_count or 0)
        detail = f" ({row.detail})" if row.detail else ""
        print(f"- [{row.status}] {row.table_name}: {row.row_count} rows{detail}")
    print(f"tables={len(rows)} rows={total_rows}")


def main() -> None:
    args = parse_args()

    sqlite_path = Path(args.sqlite_path)
    if not sqlite_path.exists():
        raise FileNotFoundError(f"SQLite DB not found: {sqlite_path}")

    sqlite_conn = sqlite3.connect(str(sqlite_path))
    sqlite_conn.row_factory = sqlite3.Row
    mysql_engine = create_engine(args.mysql_url, future=True)

    selected_tables = set(args.tables) if args.tables else None
    try:
        results = migrate(
            sqlite_conn=sqlite_conn,
            mysql_engine=mysql_engine,
            selected_tables=selected_tables,
            use_truncate=bool(args.truncate),
            dry_run=bool(args.dry_run),
        )
    finally:
        sqlite_conn.close()

    print_results(results, dry_run=bool(args.dry_run))


if __name__ == "__main__":
    main()
