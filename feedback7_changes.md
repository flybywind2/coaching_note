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
