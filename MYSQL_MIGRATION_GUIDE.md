# SQLite -> MySQL 마이그레이션 가이드

이 문서는 현재 `coaching_note` 코드베이스를 **SQLite(`ssp_coaching.db`)에서 MySQL로 이전**하는 방법을 정리합니다.

## 1. 사전 준비

- Python 가상환경 활성화
- MySQL 8.x 준비 (로컬 또는 서버)
- 기존 SQLite 백업

```bash
cd backend
copy ssp_coaching.db ssp_coaching_backup.db
```

## 2. MySQL DB/계정 생성

MySQL 접속 후 실행:

```sql
CREATE DATABASE coaching_note
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER 'ssp'@'%' IDENTIFIED BY 'change_me_password';
GRANT ALL PRIVILEGES ON coaching_note.* TO 'ssp'@'%';
FLUSH PRIVILEGES;
```

## 3. MySQL 드라이버 설치

현재 코드베이스의 `backend/requirements.txt`에는 MySQL 드라이버가 기본 포함되어 있지 않으므로, MySQL 사용 시 `pymysql` 설치가 필수입니다.

```bash
cd backend
pip install pymysql
```

팀 공통 환경 재현을 위해 `requirements.txt`에도 반영:

```txt
pymysql==1.1.1
```

## 4. 환경변수 변경 (.env)

`backend/.env`의 `DATABASE_URL`을 MySQL로 변경:

```env
DATABASE_URL=mysql+pymysql://ssp:change_me_password@127.0.0.1:3306/coaching_note?charset=utf8mb4
```

주의:
- 비밀번호 특수문자는 URL 인코딩 필요
- 운영에서는 `127.0.0.1` 대신 실제 DB 호스트 사용

## 5. 스키마 생성

이 프로젝트는 현재 Alembic 리비전 파일이 없으므로, 초기 스키마는 `init_db.py`로 생성하는 방식이 안전합니다.

```bash
cd backend
python scripts/init_db.py
```

또는 앱 구동 시 `app.main`의 startup에서 `create_all()`이 실행되어 누락 테이블이 자동 생성됩니다.

중요:
- MySQL에서는 startup의 SQLite 전용 `ALTER TABLE` 보정 로직이 실행되지 않습니다.
- 즉 MySQL에서는 `create_all()`로 **없는 테이블만 생성**되며, 기존 테이블의 컬럼 추가/변경은 자동 반영되지 않습니다.
- 운영 반영 전 스키마 diff를 점검하거나, 장기적으로 Alembic 마이그레이션 리비전 관리로 전환하는 것을 권장합니다.

## 6. 데이터 이전 (SQLite -> MySQL)

아래 1회성 스크립트를 `backend/scripts/migrate_sqlite_to_mysql.py`로 저장 후 실행하세요.

```python
import sqlite3
from sqlalchemy import create_engine, MetaData, Table, text

SQLITE_PATH = "ssp_coaching.db"
MYSQL_URL = "mysql+pymysql://ssp:change_me_password@127.0.0.1:3306/coaching_note?charset=utf8mb4"

sqlite_conn = sqlite3.connect(SQLITE_PATH)
sqlite_conn.row_factory = sqlite3.Row
mysql_engine = create_engine(MYSQL_URL, future=True)
metadata = MetaData()
metadata.reflect(bind=mysql_engine)

# FK 충돌 방지: 복사 중에는 체크 비활성화
with mysql_engine.begin() as conn:
    conn.execute(text("SET FOREIGN_KEY_CHECKS=0"))

skip_tables = {"alembic_version"}
tables = [r["name"] for r in sqlite_conn.execute(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
) if not r["name"].startswith("sqlite_")]

for table_name in tables:
    if table_name in skip_tables:
        continue
    if table_name not in metadata.tables:
        print(f"[SKIP] not in MySQL schema: {table_name}")
        continue

    table: Table = metadata.tables[table_name]
    rows = sqlite_conn.execute(f"SELECT * FROM {table_name}").fetchall()
    if not rows:
        print(f"[OK] {table_name}: 0 rows")
        continue

    payload = [dict(row) for row in rows]
    with mysql_engine.begin() as conn:
        conn.execute(table.delete())  # 재실행 가능하게 전체 교체
        conn.execute(table.insert(), payload)
    print(f"[OK] {table_name}: {len(payload)} rows")

with mysql_engine.begin() as conn:
    conn.execute(text("SET FOREIGN_KEY_CHECKS=1"))

sqlite_conn.close()
print("Migration done.")
```

실행:

```bash
cd backend
python scripts/migrate_sqlite_to_mysql.py
```

## 7. 검증

```bash
cd backend
uvicorn app.main:app --reload
```

다음 확인:
- `GET /api/health` 정상
- 로그인/과제/코칭노트/문서/게시판/Task 조회 정상
- 코칭노트 이력/템플릿/멘션 기능 정상

DB 검증 예시:

```sql
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM projects;
SELECT COUNT(*) FROM coaching_notes;
SELECT COUNT(*) FROM content_version;
```

## 8. 롤백 방법

- `.env`의 `DATABASE_URL`을 SQLite로 되돌림
- 백업한 `ssp_coaching_backup.db` 복원

```bash
cd backend
copy /Y ssp_coaching_backup.db ssp_coaching.db
```

## 9. 운영 권장사항

- 운영 환경은 `--reload` 없이 실행
- MySQL 연결 풀/timeout 설정 점검
- 현재 `backend/alembic`에는 `versions/` 리비전 파일이 없으므로, 장기적으로는 Alembic 초기 리비전 생성 후 스키마 변경 이력을 Alembic으로 관리 권장
