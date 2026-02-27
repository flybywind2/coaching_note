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

