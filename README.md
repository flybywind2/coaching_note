# SSP+ 코칭노트 관리 시스템

AI 활용 과제 코칭 프로그램 운영을 위한 **통합 관리 시스템**입니다. 배치(차수), 과제(Project), 코칭노트, 세션, 일정, 게시판, 알림, AI 생성 콘텐츠를 하나의 웹 애플리케이션에서 관리합니다.

- **백엔드**: FastAPI + SQLAlchemy + Alembic
- **프론트엔드**: Vanilla JS SPA (Hash Router)
- **DB**: SQLite(기본), 추후 RDB 확장 고려

---

## 1) 주요 기능

- 사번(emp_id) 기반 로그인(JWT 발급)
- 배치/과제 생성 및 조회
- 과제별 코칭노트/댓글 관리
- 과제 문서 업로드/조회/삭제
- 코칭 세션 및 출석(입실/퇴실) 로그 관리
- 프로그램 일정/마일스톤/세션 통합 캘린더
- 대시보드(배치/과제 현황 집계)
- 게시판(공지/Q&A/자유게시판)
- 알림 조회 및 읽음 처리
- 관리자 IP 대역 관리
- AI 요약/질의응답 세트 생성

---

## 2) 프로젝트 구조

```text
coaching_note/
├─ backend/
│  ├─ app/
│  │  ├─ main.py               # FastAPI 엔트리포인트
│  │  ├─ config.py             # 환경설정(BaseSettings)
│  │  ├─ database.py           # SQLAlchemy engine/session
│  │  ├─ models/               # ORM 모델
│  │  ├─ schemas/              # Pydantic 스키마
│  │  ├─ routers/              # API 라우터
│  │  ├─ services/             # 비즈니스 로직
│  │  └─ middleware/           # 인증/권한 처리
│  ├─ scripts/
│  │  ├─ init_db.py            # 테이블 초기 생성
│  │  └─ seed_data.py          # 테스트 데이터 입력
│  ├─ tests/                   # pytest 테스트
│  ├─ requirements.txt
│  └─ alembic/                 # 마이그레이션
├─ frontend/
│  ├─ index.html               # SPA 엔트리
│  ├─ css/
│  └─ js/
│     ├─ app.js                # 라우트 등록/앱 시작
│     ├─ router.js             # hash 기반 라우터
│     ├─ api.js                # API 클라이언트
│     ├─ auth.js               # 토큰 저장/인증 상태
│     ├─ pages/                # 화면 단위
│     └─ components/           # 공통 컴포넌트
└─ README.md
```

---

## 3) 실행 방법 (로컬 개발)

### 3-1. 요구사항

- Python 3.10+
- pip

### 3-2. 의존성 설치

```bash
cd backend
pip install -r requirements.txt
```

### 3-3. 데이터베이스 초기화/시드

```bash
# backend/ 디렉터리에서 실행
python scripts/init_db.py
python scripts/seed_data.py
```

### 3-4. 서버 실행

```bash
# backend/ 디렉터리에서 실행
uvicorn app.main:app --reload
```

실행 후 접속:

- 앱: http://localhost:8000/
- Swagger: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- 헬스체크: http://localhost:8000/api/health

> `main.py`에서 프론트엔드를 `/` 경로로 static mount 하므로, 백엔드 서버 하나로 API + 프론트를 함께 실행할 수 있습니다.

---

## 4) 환경 변수

`backend/.env` 파일에 설정합니다(없으면 `config.py` 기본값 사용).

```env
DATABASE_URL=sqlite:///./ssp_coaching.db
SECRET_KEY=change-me-to-a-random-secret-key
DEBUG=True
ALLOWED_ORIGINS=["http://localhost:3000","http://localhost:8000"]

# AI 연동
OPENAI_API_KEY=your_openai_api_key
AI_CREDENTIAL_KEY=your_credential_key
AI_SYSTEM_NAME=SSP_COACHING
AI_DEFAULT_MODEL=qwen3
AI_SUMMARY_MODEL=gpt-oss
AI_QA_MODEL=qwen3
AI_CODE_MODEL=deepseek-r1
AI_FEATURES_ENABLED=True
```

---

## 5) 테스트

```bash
# 저장소 루트 기준
pytest backend/tests -q
```

---

## 6) API 개요

주요 라우터(prefix 기준):

- `/api/auth` : 로그인/로그아웃/내 정보
- `/api/batches` : 배치 CRUD
- `/api/projects` : 과제 상세/수정/삭제
- `/api/projects/{project_id}/...` : 노트/문서/작업 등 과제 하위 리소스
- `/api/sessions` : 코칭 세션/출석
- `/api/schedules` : 프로그램 일정
- `/api/boards` : 게시판/게시글/댓글
- `/api/notifications` : 알림
- `/api/calendar` : 통합 캘린더 이벤트
- `/api/dashboard` : 대시보드 집계
- `/api/admin/ip-ranges` : 관리자 IP 대역
- `/api/projects/{project_id}/summary`, `/qa-set` : AI 콘텐츠 생성

상세 스키마/예시는 Swagger 문서(`/docs`)를 참고하세요.

---

## 7) 기본 로그인 계정(시드 데이터 기준)

- `admin001` (관리자)
- `coach001` (코치)
- `coach002` (코치)
- `user001` (참여자)
- `user002` (참여자)
- `obs001` (참관자)

비밀번호는 사용하지 않고, 현재는 **사번(emp_id) 기반 Mock SSO 로그인** 방식입니다.

---

## 8) 참고 사항

- 파일 업로드 기본 저장 경로: `backend/uploads` (실행 경로 기준)
- 업로드 허용 최대 크기: 50MB
- 허용 확장자: `jpg, jpeg, png, gif, pdf, ppt, pptx, xls, xlsx, csv`
- 개발/테스트용 SQLite DB 파일(`backend/ssp_coaching.db`, `backend/test_ssp.db`)이 저장소에 포함되어 있습니다.

