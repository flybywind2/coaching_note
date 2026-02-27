# SQLite -> MySQL 마이그레이션 가이드

이 문서는 현재 `coaching_note` 코드베이스를 **SQLite(`ssp_coaching.db`)에서 MySQL로 이전**하는 절차를 정리합니다.

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

## 3. 의존성 설치

`backend/requirements.txt`에 MySQL 드라이버(`pymysql`)가 포함되어 있으므로 아래처럼 설치합니다.

```bash
cd backend
pip install -r requirements.txt
```

## 4. 환경변수 변경 (.env)

`backend/.env`의 `DATABASE_URL`을 MySQL로 변경:

```env
DATABASE_URL=mysql+pymysql://ssp:change_me_password@127.0.0.1:3306/coaching_note?charset=utf8mb4
```

주의:
- 비밀번호 특수문자는 URL 인코딩 필요
- 운영에서는 `127.0.0.1` 대신 실제 DB 호스트 사용

## 5. MySQL 스키마 생성

이 프로젝트는 현재 Alembic 리비전 파일이 없으므로, 초기 스키마는 `init_db.py`로 생성하는 방식이 안전합니다.

```bash
cd backend
python scripts/init_db.py
```

또는 앱 구동 시 `app.main`의 startup에서 `create_all()`이 실행되어 누락 테이블이 생성됩니다.

중요:
- MySQL에서는 startup의 SQLite 전용 `ALTER TABLE` 보정 로직이 실행되지 않습니다.
- 즉 MySQL에서는 `create_all()`로 **없는 테이블만 생성**되며, 기존 테이블의 컬럼 추가/변경은 자동 반영되지 않습니다.

## 6. 데이터 이전 (SQLite -> MySQL)

리포지토리에 포함된 스크립트를 사용합니다:
- `backend/scripts/migrate_sqlite_to_mysql.py`

### 6-1. Dry-run(쓰기 없이 계획 확인)

```bash
cd backend
python scripts/migrate_sqlite_to_mysql.py --sqlite-path ssp_coaching.db --mysql-url "mysql+pymysql://ssp:change_me_password@127.0.0.1:3306/coaching_note?charset=utf8mb4" --dry-run
```

### 6-2. 전체 테이블 마이그레이션 실행

```bash
cd backend
python scripts/migrate_sqlite_to_mysql.py --sqlite-path ssp_coaching.db --mysql-url "mysql+pymysql://ssp:change_me_password@127.0.0.1:3306/coaching_note?charset=utf8mb4" --truncate
```

옵션 설명:
- `--truncate`: 적재 전에 각 테이블 `TRUNCATE TABLE` 실행
- (미지정 시) `DELETE FROM` 방식으로 전체 교체
- `--tables users projects ...`: 특정 테이블만 마이그레이션

## 7. 검증

```bash
cd backend
uvicorn app.main:app --reload
```

다음 확인:
- `GET /api/health` 정상
- 로그인/과제/코칭노트/문서/게시판/Task 조회 정상
- 소식/과제조사/설문/수강신청/캘린더 강의일정 조회 정상

DB 검증 예시:

```sql
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM projects;
SELECT COUNT(*) FROM coaching_notes;
SELECT COUNT(*) FROM content_version;
SELECT COUNT(*) FROM about_news;
SELECT COUNT(*) FROM project_research_item;
SELECT COUNT(*) FROM survey;
SELECT COUNT(*) FROM lecture;
SELECT COUNT(*) FROM lecture_registration;
```

## 7-1. (이미 운영 중인 DB) AI 주차별 관리 컬럼 반영

운영 중인 기존 DB에 `ai_generated_content.week_number`가 없다면 아래 스크립트를 실행합니다.

```bash
cd backend
python scripts/migrate_ai_week_number.py
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
