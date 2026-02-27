# FEEDBACK7 변경 이력

## Commit 1 - SSP+ 소개 > 소식 메뉴 추가

### 추가/수정 파일

- `backend/app/models/about_news.py` (신규)
- `backend/app/models/__init__.py`
- `backend/app/schemas/about.py`
- `backend/app/routers/about.py`
- `backend/tests/test_about_news_feedback7.py` (신규)
- `frontend/js/api.js`
- `frontend/js/pages/about.js`
- `frontend/css/style.css`

### 핵심 로직

- `[FEEDBACK7]` 소개 페이지 소식지 모델(`about_news`) 추가
  - 제목/내용/게시일시/공개여부/생성자/수정자 메타데이터 관리
- `[FEEDBACK7]` 소개 API 확장
  - `GET /api/about/news` : 최신순 조회 (관리자 `include_hidden=true` 지원)
  - `POST /api/about/news` : 관리자만 생성
  - `PUT /api/about/news/{news_id}` : 관리자만 수정
- `[FEEDBACK7]` 소개 프론트 확장
  - `about` 화면에 `소식` 진입 경로 추가
  - 소식 전용 뷰(좌측 리스트/우측 상세) + 관리자 추가/수정 모달
  - 소식 리스트 최신순, 기본 선택은 최신 소식
  - 소개 탭 버튼 밑줄 제거 (`.tab-btn` 링크 기본 밑줄 차단)

### 테스트

- 백엔드 자동화
  - `python -m pytest tests/test_about_news_feedback7.py -q`
  - `python -m pytest tests/test_about.py tests/test_about_news_feedback7.py -q`
- Chrome DevTools 실동작
  - 관리자 `admin001` 로그인 후 `#/about?tab=news`에서 소식 생성/조회/수정 버튼 노출 확인
  - 참여자 `user001` 로그인 후 동일 페이지에서 읽기 전용 노출(`소식 추가/수정` 미노출) 확인

## Commit 2 - 게시판 차수 분리 + 해당 차수 공개 옵션

### 추가/수정 파일

- `backend/app/models/board.py`
- `backend/app/schemas/board.py`
- `backend/app/services/board_service.py`
- `backend/app/routers/boards.py`
- `backend/app/main.py`
- `backend/tests/test_board_feedback7_batch_policy.py` (신규)
- `frontend/js/api.js`
- `frontend/js/pages/board.js`
- `frontend/css/style.css`

### 핵심 로직

- `[FEEDBACK7]` 게시글 차수 필드 및 비공개 옵션 추가
  - `board_post.batch_id`, `board_post.is_batch_private`
  - 생성/수정 payload에 `batch_id`, `is_batch_private` 반영
- `[FEEDBACK7]` 권한 정책 추가
  - 관리자/코치: 모든 차수 게시글/댓글 작성 가능
  - 참여자: 본인 차수(권한 테이블 또는 소속 과제 배치 추론)에서만 게시글/댓글 작성 가능
  - 참관자: 작성 불가 유지
- `[FEEDBACK7]` 비공개(해당 차수 공개) 게시글 노출 제어
  - 관리자/코치/해당 차수 참여자만 조회 가능
  - 참관자 및 타 차수 참여자에게는 목록/상세에서 숨김
- `[FEEDBACK7]` 게시판 UI 반영
  - 상단 차수 선택 필터 추가
  - 글쓰기/수정 모달에 `차수`, `해당 차수에게만 공개` 입력 추가
  - 목록/상세에 `차수공개` 배지 표시

### 테스트

- 백엔드 자동화
  - `python -m pytest tests/test_board_feedback7_batch_policy.py -q`
  - `python -m pytest tests/test_board_feedback5_p2.py tests/test_board_feedback6_p2.py tests/test_board_feedback7_batch_policy.py -q`
  - `python -m pytest tests/test_about.py tests/test_about_news_feedback7.py tests/test_board_feedback5_p2.py tests/test_board_feedback6_p2.py tests/test_board_feedback7_batch_policy.py -q`
- Chrome DevTools 실동작
  - 관리자 `admin001`:
    - 게시판 차수 필터 노출 확인
    - 차수공개 체크로 게시글 생성 후 목록 `차수공개` 배지 확인
  - 참여자 `user001`:
    - 타 차수 공개글 조회 가능 확인
    - 타 차수 게시글 작성 시도/댓글 작성 시도 시 `참여자는 본인 차수에만 작성할 수 있습니다.` 에러 확인
    - 본인 차수 목록에서 차수공개 게시글 노출 확인
  - 참관자 `obs001`:
    - 본인과 무관한 차수공개 게시글 미노출 확인

## Commit 3 - 과제별 의견 취합(조사) 페이지 추가

### 추가/수정 파일

- `backend/app/models/project_research.py` (신규)
- `backend/app/models/__init__.py`
- `backend/app/schemas/project_research.py` (신규)
- `backend/app/services/project_research_service.py` (신규)
- `backend/app/services/__init__.py`
- `backend/app/routers/project_research.py` (신규)
- `backend/app/main.py`
- `backend/tests/test_project_research_feedback7.py` (신규)
- `frontend/js/pages/projectResearch.js` (신규)
- `frontend/js/api.js`
- `frontend/js/app.js`
- `frontend/js/router.js`
- `frontend/js/components/header.js`
- `frontend/index.html`
- `frontend/css/style.css`
- `tasks7.md`

### 핵심 로직

- `[FEEDBACK7]` 과제 조사 도메인 모델 추가
  - 조사 아이템(`ProjectResearchItem`), 세부 질문(`ProjectResearchQuestion`), 과제별 응답(`ProjectResearchResponse`) 테이블 구성
- `[FEEDBACK7]` 과제 조사 API/서비스 구현
  - 관리자: 아이템/질문 CRUD, 공개/비공개 전환, 목적/기간 관리
  - 관리자/코치: 전체 차수 접근 가능
  - 참여자: 본인 차수 접근 + 본인 과제 행 응답만 수정 가능
  - 참관자: 메뉴/엔드포인트 접근 차단
  - 공개 전환 시 차수 참여자 대상 알림(`project_research`) 발송
- `[FEEDBACK7]` 과제 조사 프론트 페이지 추가
  - 상단 차수 선택, 좌측 조사 아이템 리스트(최신순), 우측 목적/기간/동적 질문 테이블
  - 관리자 편집 UI(아이템 생성/수정/삭제, 질문 추가/수정/삭제, 공개 토글)
  - 참여자 입력 UI(본인 과제 행 답변 저장)
- `[FEEDBACK7]` 라우팅/메뉴 반영
  - `#/project-research` 라우트 등록
  - 헤더 메뉴 `과제 조사` 노출(관리자/코치/참여자), 참관자 비노출 및 직접 URL 차단

### 테스트

- 백엔드 자동화
  - `python -m pytest tests/test_project_research_feedback7.py -q`
  - `python -m pytest tests/test_about.py tests/test_about_news_feedback7.py tests/test_board_feedback5_p2.py tests/test_board_feedback6_p2.py tests/test_board_feedback7_batch_policy.py tests/test_project_research_feedback7.py -q`
- Chrome DevTools 실동작
  - 관리자 `admin001`:
    - `과제 조사` 메뉴 진입, 조사 아이템 생성/공개 전환, 질문(주관식/객관식) 추가 확인
  - 참여자 `user001`:
    - 본인 차수 조사 목록만 조회, 본인 과제 행 답변 저장 성공 확인
  - 참관자 `obs001`:
    - 메뉴 미노출, `#/project-research` 직접 접근 시 차단/리다이렉트 확인

## Commit 4 - 설문 페이지 추가

### 추가/수정 파일

- `backend/app/models/survey.py` (신규)
- `backend/app/models/__init__.py`
- `backend/app/schemas/survey.py` (신규)
- `backend/app/services/survey_service.py` (신규)
- `backend/app/services/__init__.py`
- `backend/app/routers/surveys.py` (신규)
- `backend/app/main.py`
- `backend/tests/test_survey_feedback7.py` (신규)
- `frontend/js/pages/survey.js` (신규)
- `frontend/js/api.js`
- `frontend/js/app.js`
- `frontend/js/router.js`
- `frontend/js/components/header.js`
- `frontend/index.html`
- `frontend/css/style.css`
- `tasks7.md`

### 핵심 로직

- `[FEEDBACK7]` 설문 도메인 모델 추가
  - 설문(`Survey`), 질문(`SurveyQuestion`), 과제별 응답(`SurveyResponse`) 구성
  - 질문 유형: `subjective`, `objective_choice`, `objective_score`
  - 동시 공개 제약: `is_visible=true` 설문은 시스템 전체에서 1개만 허용
- `[FEEDBACK7]` 설문 API/서비스 구현
  - 관리자: 설문/질문 CRUD, 공개 전환, 결과 통계 조회, CSV 내보내기
  - 참여자: 대상 차수 + 기간 내 본인 과제 응답 제출/제출취소(재수정)
  - 공개 전환 시 대상 차수 참여자 알림(`noti_type=\"survey\"`) 발송
  - 필수 문항 누락 시 제출 차단(백엔드 검증)
- `[FEEDBACK7]` 통계 구현
  - 과제별 필수 문항 응답률
  - 점수형 문항 평균(전체/과제별)
- `[FEEDBACK7]` 프론트 설문 페이지 추가
  - 관리자/참여자 전용 `설문` 메뉴 및 `#/survey` 라우트
  - 좌측 설문 리스트 + 우측 설문 상세/질문 테이블
  - 필수 미응답 시 셀 하이라이트 + 제출 차단
  - 참여자 대상 설문이 없으면 `현재 진행중인 설문이 없습니다.` 문구 노출

### 테스트

- 백엔드 자동화
  - `python -m pytest tests/test_survey_feedback7.py -q`
  - `python -m pytest tests/test_about.py tests/test_about_news_feedback7.py tests/test_board_feedback5_p2.py tests/test_board_feedback6_p2.py tests/test_board_feedback7_batch_policy.py tests/test_project_research_feedback7.py tests/test_survey_feedback7.py -q`
- Chrome DevTools 실동작
  - 관리자 `admin001`:
    - `설문` 메뉴 진입, 설문 생성/질문 추가(주관식/점수형) 확인
    - 동시 공개 제약(`동시에 공개 가능한 설문은 1개입니다.`) 확인
  - 참여자 `user001`:
    - `설문` 메뉴 노출 확인
    - 설문 미대상 상태에서 `현재 진행중인 설문이 없습니다.` 문구 확인
  - 참관자 `obs001`:
    - 헤더 메뉴에서 `설문` 미노출 확인
    - `#/survey` 직접 접근 시 `#/projects`로 리다이렉트 확인
