# SSP+ 코칭노트 관리 시스템

FastAPI + Vanilla JS(SPA) 기반 코칭 프로그램 운영 시스템입니다.  
차수(Batch) 중심으로 과제, 코칭노트, 세션, 문서, 게시판, 캘린더, AI 기능을 통합 관리합니다.

## 주요 기능

- 인증/권한: 사번(`emp_id`) 로그인, JWT 인증, 역할 기반 권한(`admin`, `coach`, `participant`, `observer`)
- 운영 관리: 차수 CRUD, 과제 CRUD, 과제 멤버 추가/삭제, 관리자 사용자 추가/삭제/복구
- 코칭노트: 작성/편집/삭제, 코멘트 작성/삭제, 코치 전용 메모
- 문서/게시판: 리치 에디터 기반 편집(표/이미지/링크/HTML 모드), 게시글/댓글 편집 및 삭제
- Task/마일스톤: 생성/편집/삭제, 상태 변경, 마일스톤 순서/캘린더 연동
- 세션/출석: 세션 관리, 출석 체크인/체크아웃, 코칭 시작/종료 로그
- 캘린더/대시보드: 월간 뷰 + 10주 뷰, 프로젝트별 마일스톤 시각화, 진행 통계 대시보드
- AI: 과제 요약 생성, Q&A 세트 생성, 코칭노트 섹션(`현재 상태/당면 문제/다음 액션`) AI 보완
- 파일 업로드: 문서/에디터 이미지 파일 서버 저장(`uploads/`) + 고아 이미지 정리 API

## 기술 스택

- Backend: Python, FastAPI, SQLAlchemy, Alembic, Pydantic
- Frontend: HTML/CSS/Vanilla JavaScript (Hash Router SPA)
- DB: SQLite (기본)
- Test: pytest, FastAPI TestClient
- AI: LangChain(OpenAI 호환 엔드포인트)

## 프로젝트 구조

```text
backend/
  app/
    main.py            # FastAPI 엔트리포인트
    routers/           # API 라우터
    services/          # 비즈니스 로직
    models/            # SQLAlchemy 모델
    schemas/           # Pydantic 스키마
  scripts/             # 운영/보조 스크립트
  tests/               # pytest 테스트
frontend/
  index.html           # SPA 엔트리
  js/, css/            # 페이지/컴포넌트/스타일
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

전체 스펙은 Swagger(`GET /docs`)를 기준으로 확인하세요.

| 도메인 | 메서드/경로 예시 | 권한 |
| --- | --- | --- |
| Auth | `POST /api/auth/login` | 공개 |
| Auth | `GET /api/auth/me`, `POST /api/auth/logout` | 로그인 사용자 |
| Users | `GET/POST /api/users`, `DELETE /api/users/{id}`, `PATCH /api/users/{id}/restore` | `admin` |
| Batch | `GET /api/batches` | 로그인 사용자 |
| Batch | `POST/PUT/DELETE /api/batches...` | `admin` |
| Project | `GET /api/batches/{batch_id}/projects`, `GET /api/projects/{id}` | 로그인 사용자 (가시성 정책 적용) |
| Project | `POST /api/batches/{batch_id}/projects`, `DELETE /api/projects/{id}` | `admin` |
| Project | `PUT /api/projects/{id}` | `admin`, `coach` |
| Project Member | `GET/POST/DELETE /api/projects/{id}/members...` | 조회: 로그인 사용자, 변경: `admin` |
| Coaching Note | `GET /api/projects/{id}/notes`, `GET /api/notes/{id}` | 로그인 사용자 |
| Coaching Note | `POST/PUT/DELETE /api/projects/{id}/notes`, `/api/notes/{id}` | `admin`, `coach` |
| Coaching Comment | `POST /api/notes/{id}/comments`, `DELETE /api/comments/{id}` | 로그인 사용자 (정책 적용) |
| Document | `GET/POST /api/projects/{id}/documents`, `GET/PUT/DELETE /api/documents/{id}` | 로그인 사용자 (정책 적용) |
| Upload | `POST /api/uploads/images` | 로그인 사용자 |
| Upload(Admin) | `POST /api/uploads/editor-images/cleanup` | `admin` |
| Task | `GET/POST /api/projects/{id}/tasks`, `GET/PUT/DELETE /api/tasks/{id}` | 로그인 사용자 (변경 권한 정책 적용) |
| Session | `GET /api/sessions...`, `GET /api/sessions/{id}` | 로그인 사용자 |
| Session | `POST /api/sessions`, `POST /api/sessions/{id}/attendees` | `admin` |
| Session | `PUT /api/sessions/{id}` | `admin`, `coach` |
| Attendance | `POST /api/sessions/{id}/checkin`, `/checkout` | 로그인 사용자 (허용 IP 대역 검사) |
| Coaching Time | `POST /api/sessions/{id}/coaching-start`, `/coaching-end` | `admin`, `coach` |
| Board | `/api/boards...` (게시글/댓글 CRUD) | 로그인 사용자 (수정/삭제 정책 적용) |
| Notification | `/api/notifications...` | 로그인 사용자 |
| Schedule | `GET /api/schedules...` | 로그인 사용자 |
| Schedule | `POST/PUT/DELETE /api/schedules...` | `admin` |
| Calendar | `GET /api/calendar` | 로그인 사용자 (참여자/참관자 필터링 적용) |
| Dashboard | `GET /api/dashboard` | `admin`, `coach` |
| AI | `POST /api/projects/{id}/summary`, `POST /api/projects/{id}/qa-set` | `admin`, `coach` |
| AI | `GET /api/projects/{id}/summary`, `GET /api/projects/{id}/qa-sets` | 로그인 사용자 |
| AI | `POST /api/notes/{note_id}/enhance` | `admin`, `coach` |
| Admin IP | `/api/admin/ip-ranges` | `admin` |

## 환경 변수

`backend/.env` 파일을 생성해 설정합니다.

```env
DATABASE_URL=sqlite:///./ssp_coaching.db
SECRET_KEY=change-me
DEBUG=True
ALLOWED_ORIGINS=["http://localhost:3000","http://localhost:8000"]

# AI
OPENAI_API_KEY=your_openai_api_key
AI_CREDENTIAL_KEY=your_credential_key
AI_SYSTEM_NAME=SSP_COACHING
AI_DEFAULT_MODEL=qwen3
AI_SUMMARY_MODEL=gpt-oss
AI_QA_MODEL=qwen3
AI_FEATURES_ENABLED=True
```

## 테스트

```bash
cd backend
python -m pytest tests/
python -m pytest tests/test_auth.py -k login
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

## 참고

- 리치 에디터 이미지 업로드는 기본적으로 `/uploads/editor_images/...` 경로에 저장됩니다.
- AI 기능은 `AI_FEATURES_ENABLED=True` 및 AI 관련 의존성/자격 정보가 정상 설정되어야 동작합니다.
