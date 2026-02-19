# SSP+ 코칭노트 관리 시스템

FastAPI + Vanilla JS 기반의 코칭 프로그램 운영 시스템입니다.  
차수(Batch) 단위로 과제를 관리하고, 코칭노트/문서/일정/게시판/알림/AI 요약 기능을 제공합니다.

## 주요 기능

- 인증: 사번(`emp_id`) 기반 로그인, JWT 인증
- 운영: 차수/과제/멤버 관리
- 코칭: 코칭노트, 코멘트, 세션, 출석/코칭 시간 기록
- 협업: 게시판, 알림
- 실행 관리: 일정/캘린더/대시보드
- AI: 과제 요약, Q&A 세트 생성
- 파일: 과제 문서 업로드 및 정적 서빙(`/uploads`)

## 기술 스택

- Backend: Python, FastAPI, SQLAlchemy, Alembic
- Frontend: HTML/CSS/Vanilla JavaScript (SPA)
- DB: SQLite (기본)
- Test: pytest, FastAPI TestClient

## 프로젝트 구조

```text
backend/
  app/
    main.py            # FastAPI 엔트리포인트
    routers/           # API 라우터
    services/          # 비즈니스 로직
    models/            # SQLAlchemy 모델
    schemas/           # Pydantic 스키마
  scripts/             # init_db, seed_data
  tests/               # pytest 테스트
frontend/
  index.html           # SPA 엔트리
  js/, css/
uploads/               # 업로드 파일 저장소
```

## 빠른 시작

```bash
cd backend
python -m venv .venv
# PowerShell
.venv\Scripts\Activate.ps1
pip install -r requirements.txt

python scripts/init_db.py
python scripts/seed_data.py
uvicorn app.main:app --reload
```

- 앱: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`
- 헬스체크: `GET /api/health`

## 주요 API 엔드포인트 (요약)

전체 스펙은 Swagger(`GET /docs`)를 기준으로 확인하세요. 아래는 실사용 빈도가 높은 경로와 권한 요약입니다.

| 도메인 | 메서드/경로 예시 | 권한 |
| --- | --- | --- |
| Auth | `POST /api/auth/login` | 공개 |
| Auth | `GET /api/auth/me`, `POST /api/auth/logout` | 로그인 사용자 |
| Batch | `GET /api/batches` | 로그인 사용자 |
| Batch | `POST/PUT/DELETE /api/batches...` | `admin` |
| Project | `GET /api/batches/{batch_id}/projects`, `GET /api/projects/{id}` | 로그인 사용자 (가시성 정책 적용) |
| Project | `POST /api/batches/{batch_id}/projects`, `DELETE /api/projects/{id}` | `admin` |
| Project | `PUT /api/projects/{id}` | `admin`, `coach` |
| Coaching Note | `GET /api/projects/{id}/notes`, `GET /api/notes/{id}` | 로그인 사용자 |
| Coaching Note | `POST/PUT/DELETE /api/projects/{id}/notes`, `/api/notes/{id}` | `admin`, `coach` |
| Document | `/api/projects/{id}/documents`, `/api/documents/{id}` | 로그인 사용자 |
| Session | `GET /api/sessions...`, `GET /api/sessions/{id}` | 로그인 사용자 |
| Session | `POST /api/sessions`, `POST /api/sessions/{id}/attendees` | `admin` |
| Session | `PUT /api/sessions/{id}` | `admin`, `coach` |
| Attendance | `POST /api/sessions/{id}/checkin`, `checkout` | 로그인 사용자 (허용 IP 대역 검사) |
| Dashboard | `GET /api/dashboard` | `admin`, `coach` |
| Calendar | `GET /api/calendar` | 로그인 사용자 (참여자/참관자는 본인 프로젝트 위주) |
| Schedule | `GET /api/schedules...` | 로그인 사용자 |
| Schedule | `POST/PUT/DELETE /api/schedules...` | `admin` |
| Board | `/api/boards...` | 로그인 사용자 (수정/삭제는 작성자 또는 `admin`) |
| AI | `POST /api/projects/{id}/summary`, `POST /qa-set` | `admin`, `coach` |
| AI | `GET /api/projects/{id}/summary`, `GET /qa-sets` | 로그인 사용자 |
| Admin | `/api/admin/ip-ranges` | `admin` |

## 환경 변수

`backend/.env` 파일을 생성해 설정합니다.

```env
DATABASE_URL=sqlite:///./ssp_coaching.db
SECRET_KEY=change-me
DEBUG=True
ALLOWED_ORIGINS=["http://localhost:3000","http://localhost:8000"]
OPENAI_API_KEY=your_openai_api_key
AI_CREDENTIAL_KEY=your_credential_key
AI_FEATURES_ENABLED=True
```

## 테스트

```bash
cd backend
pytest tests/
pytest tests/test_auth.py -k login
```

## DB 마이그레이션

```bash
cd backend
alembic revision --autogenerate -m "message"
alembic upgrade head
```

## 시드 데이터 로그인 예시

- 관리자: `admin001`
- 코치: `coach001`
- 참여자: `user001`
- 참관자: `obs001`
