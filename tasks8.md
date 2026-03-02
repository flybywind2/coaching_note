# Feedback8 반영 Task 정리 및 실행 계획

## 0. 요구사항 분석 요약

- 강의 기능은 `강의리스트`와 `강의 상세(강의 페이지)`를 명확히 분리해야 함.
- 강의리스트는 카드형 UI로 전환하고, 정원/신청 현황과 참여자 신청 상태를 한눈에 보여줘야 함.
- 강의 상세 화면에는 정원/팀별정원/신청인원/승인인원을 한 줄에 배치하고, 승인인원은 관리자만 조회 가능해야 함.
- 관리자는 캘린더에서 강의 내용을 직접 편집할 수 있어야 함.
- 강의 시간 설정은 10분 단위 입력/수정만 허용해야 함.
- 설문 기능은 `설문 항목 구성 화면`과 `설문 결과 화면`을 분리해야 함.
- 설문 결과 조회 권한을 코치까지 확장해야 함.
- 기존 질문을 재활용하여 새 설문을 구성하는 기능이 필요함.
- 설문 저장/제출/제출취소 동작을 DB 상태(`Summitted`)와 정확히 동기화해야 함.
- 변경 추적을 위해 `feedback8.md`를 생성/유지하고, 변경 코드에는 `[feedback8]` 주석을 남겨야 함.

## 1. 공통 규칙 및 선행 작업

- [x] 변경 식별 주석 규칙 적용
  - Python: `# [feedback8] ...`
  - JavaScript: `// [feedback8] ...`
  - SQL/Alembic: `-- [feedback8] ...`
- [x] 변경점 기록 문서 생성/운영
  - 파일: `feedback8_changed.md`
  - 항목: `요구사항`, `수정 파일`, `핵심 로직`, `검증 결과`
- [x] 회귀/기능 테스트 기본선 확인
  - `pytest backend/tests/test_lecture_feedback7.py`
  - `pytest backend/tests/test_calendar_lecture_feedback7.py`
  - `pytest backend/tests/test_survey_feedback7.py`
- [x] 프론트 실동작 확인 방식 고정
  - 각 기능 반영 직후 Chrome DevTools 기반 수동 시나리오 검증 수행

## 2. 기능별 Task (Commit 분리 단위)

### Commit 1. 강의리스트/강의 상세 화면 분리 + 리스트 카드화

- [x] 라우팅/페이지 구조 분리
  - 후보 파일: `frontend/js/router.js`, `frontend/js/pages/courseRegistration.js`
  - `강의리스트`와 `강의 상세`를 별도 렌더링 경로로 분리
- [x] 강의리스트 카드형 UI 반영
  - 후보 파일: `frontend/js/pages/courseRegistration.js`, `frontend/css/*`
  - 표시: `총인원`, `팀별정원`, `신청인원`, `참여자 신청 여부`
- [x] API 응답 스키마 보강(필요 시)
  - 후보 파일: `backend/app/routers/lectures.py`, `backend/app/schemas/lecture.py`
  - 참여자 기준 신청 여부 필드 제공
- [x] 테스트 보강
  - 후보 파일: `backend/tests/test_lecture_feedback8_list_detail_split.py`

### Commit 2. 강의 상세 정보 라인 구성 + 캘린더 편집 + 10분 단위 시간 설정

- [x] 강의 상세 상단 지표를 한 줄로 정렬
  - 후보 파일: `frontend/js/pages/courseRegistration.js`, `frontend/css/*`
  - 지표: `총 정원`, `팀별 정원`, `신청 인원`, `승인 인원(관리자만)`
- [x] 승인 인원 관리자 전용 표시 규칙 반영
  - 후보 파일: `frontend/js/pages/courseRegistration.js`, `backend/app/routers/lectures.py`
- [x] 캘린더 내 강의 내용 편집 권한(관리자) 반영
  - 후보 파일: `frontend/js/pages/calendar.js`, `backend/app/routers/calendar.py`, `backend/app/routers/lectures.py`
- [x] 강의 시간 10분 단위 제약 적용
  - 후보 파일: `frontend/js/pages/admin.js`, `frontend/js/pages/calendar.js`, `backend/app/services/*lecture*`
  - UI 입력 제약 + 서버 검증 동시 적용
- [x] 테스트 보강
  - 후보 파일: `backend/tests/test_lecture_feedback8_time_and_calendar_edit.py`

### Commit 3. 설문 구성/결과 화면 분리 + 코치 결과 조회 + 기존 질문 재활용

- [x] 설문 화면 분리
  - 후보 파일: `frontend/js/pages/survey.js`
  - 관리자용 `구성 화면`과 `결과 화면` 분리
- [x] 설문 결과 조회 권한에 코치 추가
  - 후보 파일: `backend/app/routers/surveys.py`, `backend/app/services/survey_service.py`
- [x] 기존 질문 재활용 옵션 구현
  - 후보 파일: `frontend/js/pages/survey.js`, `backend/app/routers/surveys.py`
  - 이전 질문 불러오기/선택 후 신규 설문에 포함
- [x] 테스트 보강
  - 후보 파일: `backend/tests/test_survey_feedback8_screen_and_permission.py`

### Commit 4. 설문 저장/제출/제출취소 DB 동기화

- [x] 저장 버튼 클릭 시 설문 작성값 DB 저장 보장
  - 후보 파일: `backend/app/routers/surveys.py`, `backend/app/services/survey_service.py`
- [x] 제출 버튼 동작 반영
  - `Summitted=True` 저장
  - 제출취소 버튼 노출
- [x] 관리자 결과 기준을 제출완료(`Summitted=True`)로 통일
  - 후보 파일: `backend/app/services/survey_service.py`, `frontend/js/pages/survey.js`
- [x] 제출 취소 동작 반영
  - 응답 값 유지
  - `Summitted=False`로만 전환
- [x] 테스트 보강
  - 후보 파일: `backend/tests/test_survey_feedback8_submit_toggle.py`

### Commit 5. 변경 이력 문서화 및 마감 정리

- [x] `feedback8.md` 작성/업데이트
  - 기능별 수정 파일/핵심 로직/검증 결과 기록
- [x] 코드 내 `[feedback8]` 주석 누락 점검
  - `rg "\[feedback8\]" backend frontend`
- [x] 통합 회귀 테스트 및 수동 시나리오 검증 결과 반영

## 3. 권장 구현 순서(실행 계획)

### Phase A. 기반 정리

- [x] `[feedback8]` 주석 규칙 적용 범위 정의
- [x] `feedback8.md` 템플릿 생성
- [x] 강의/설문 기존 테스트 기준선 확인

### Phase B. 기능 구현(커밋 단위)

- [x] Commit 1: 강의리스트/상세 분리 + 카드형 리스트
- [x] Commit 2: 강의 상세 지표/권한 + 캘린더 편집 + 10분 단위 제약
- [x] Commit 3: 설문 구성/결과 분리 + 코치 결과 조회 + 질문 재활용
- [x] Commit 4: 설문 저장/제출/제출취소 DB 동기화
- [x] Commit 5: 문서화/주석 점검/최종 정리

### Phase C. 검증 및 완료

- [x] 기능 커밋마다 Chrome DevTools로 실제 시나리오 점검
- [x] 신규/수정 테스트 통과 확인
- [x] `feedback8.md` 최종 업데이트 후 완료 기준 점검

## 4. Commit 전략(예시)

- `feat(lecture): split lecture list/detail and add card metrics [feedback8]`
- `feat(lecture): add calendar edit and 10-minute scheduling validation [feedback8]`
- `feat(survey): separate builder/result views and allow coach result access [feedback8]`
- `feat(survey): persist save/submit/cancel with Summitted state sync [feedback8]`
- `docs(feedback8): track changed files, logic, and verification results [feedback8]`

## 5. 완료 기준 (Definition of Done)

- [x] 강의리스트/강의상세 화면이 분리되어 동작함
- [x] 강의리스트 카드에 요구 지표와 참여자 신청여부가 표시됨
- [x] 강의상세 지표가 한 줄 배치되고 승인인원은 관리자에게만 노출됨
- [x] 관리자가 캘린더에서 강의 내용을 편집할 수 있음
- [x] 강의 시간 설정이 10분 단위로 검증됨(UI + 서버)
- [x] 설문 구성/결과 화면이 분리되고 코치 결과 조회가 가능함
- [x] 기존 질문 재활용으로 신규 설문 생성이 가능함
- [x] 설문 저장/제출/제출취소가 `Summitted` 상태와 정확히 동기화됨
- [x] `feedback8_changed.md`에 변경 파일/내용/검증 결과가 기록됨
- [x] 변경 코드에 `[feedback8]` 주석이 일관되게 추가됨
