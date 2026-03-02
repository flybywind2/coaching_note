# feedback8 변경 이력

## Commit 1. 강의리스트/강의상세 분리 + 카드형 리스트

### 요구사항
- 강의리스트 화면과 강의 상세 화면 분리
- 강의리스트를 카드형으로 제공
- 카드에 총정원/팀별정원/신청인원 표시
- 참여자에게 신청 여부 표시

### 수정 파일
- `frontend/js/pages/courseRegistration.js`
- `frontend/js/app.js`
- `frontend/css/style.css`
- `backend/app/schemas/lecture.py`
- `backend/app/services/lecture_service.py`
- `backend/app/routers/calendar.py`
- `backend/tests/test_lecture_feedback8_list_detail_split.py`
- `tasks8.md`

### 핵심 변경
- [feedback8] `/course-registration`(리스트)와 `/course-registration/lecture/:lectureId`(상세) 라우트 분리
- [feedback8] 강의리스트 카드에서 정원/신청인원/참여자 신청 상태 렌더링
- [feedback8] 강의 목록 API 응답에 `my_registration_status` 필드 추가
- [feedback8] 캘린더 강의 링크를 강의 상세 경로로 변경

### 검증 결과
- 자동 테스트
  - `python -m pytest tests/test_lecture_feedback8_list_detail_split.py` 통과
  - `python -m pytest tests/test_lecture_feedback7.py` 통과
  - `python -m pytest tests/test_calendar_lecture_feedback7.py` 통과
- Chrome DevTools 실동작
  - 참여자 로그인 후 `#/course-registration` 진입 확인
  - 카드형 리스트 + 지표 + `내 상태: 미신청` 표시 확인
  - 카드 클릭 시 `#/course-registration/lecture/{id}?batch_id={id}` 상세 이동 확인
  - 상세 화면 `목록으로` 버튼으로 리스트 복귀 확인

## Commit 2. 강의 상세 지표/권한 + 캘린더 편집 + 10분 단위 제약

### 요구사항
- 강의 상세에서 정원/신청/승인 정보를 한 줄 표시
- 승인 인원은 관리자만 표시
- 관리자는 캘린더에서 강의 내용을 편집 가능
- 강의 시간 입력/수정은 10분 단위만 허용

### 수정 파일
- `frontend/js/pages/courseRegistration.js`
- `frontend/css/style.css`
- `frontend/js/pages/calendar.js`
- `frontend/js/pages/admin.js`
- `backend/app/services/lecture_service.py`
- `backend/tests/test_lecture_feedback8_time_and_calendar_edit.py`
- `tasks8.md`

### 핵심 변경
- [feedback8] 강의 상세 지표를 `cr-summary-line` 한 줄 구조로 변경
- [feedback8] 비관리자 상세 화면에서 승인 인원 숨김
- [feedback8] 캘린더 강의 상세 모달에 `강의 수정` 버튼 및 편집 모달 추가(관리자)
- [feedback8] 강의 생성/수정/일괄수정 시 시작/종료 시각 10분 단위 서버 검증 추가
- [feedback8] 관리자/캘린더 강의 수정 UI에 `datetime-local step=600` + 10분 단위 프런트 검증 추가
- [feedback8] 관리자/캘린더 강의 시간 입력 UI를 `날짜 + 10분 단위 시간 선택(select)` 구조로 변경

### 검증 결과
- 자동 테스트
  - `python -m pytest tests/test_lecture_feedback8_time_and_calendar_edit.py` 통과
  - `python -m pytest tests/test_lecture_feedback8_list_detail_split.py` 통과
  - `python -m pytest tests/test_lecture_feedback7.py` 통과
  - `python -m pytest tests/test_calendar_lecture_feedback7.py` 통과
- Chrome DevTools 실동작
  - 참여자 강의 상세에서 승인 인원 미노출 확인
  - 관리자 강의 상세에서 승인 인원 노출 확인
  - 관리자 캘린더 강의 일정 상세에서 `강의 수정` 버튼 노출/진입 확인
  - 강의 수정 모달에서 `10:05` 입력 시 브라우저 step 검증으로 invalid 상태 확인

## Commit 3. 설문 구성/결과 화면 분리 + 코치 결과 조회 + 기존 질문 재활용

### 요구사항
- 관리자 설문 화면을 `구성 화면`/`결과 화면`으로 분리
- 코치(legacy/internal/external)가 설문 결과를 조회할 수 있도록 확장
- 기존 질문을 불러와 신규 설문에 재활용 가능하도록 구현

### 수정 파일
- `frontend/js/pages/survey.js`
- `frontend/js/router.js`
- `frontend/js/components/header.js`
- `frontend/js/api.js`
- `frontend/css/style.css`
- `backend/app/routers/surveys.py`
- `backend/app/services/survey_service.py`
- `backend/app/schemas/survey.py`
- `backend/tests/test_survey_feedback8_screen_and_permission.py`

### 핵심 변경
- [feedback8] 관리자 화면에 `구성/결과` 모드 탭을 추가하고 화면을 역할별로 분리
- [feedback8] 코치에게 설문 접근/결과 조회/CSV 다운로드 권한 부여(관리 권한은 유지: 관리자 전용)
- [feedback8] `GET /api/surveys/question-bank` API 추가 및 `기존 질문 가져오기` 모달 구현

### 검증 결과
- 자동 테스트
  - `python -m pytest tests/test_survey_feedback8_screen_and_permission.py` 통과
- Chrome DevTools 실동작
  - 관리자: `구성 화면`에서 질문 관리 + `기존 질문 가져오기` 모달 확인
  - 관리자: `결과 화면`에서 집계/상태 테이블 확인
  - 코치: 설문 메뉴 접근 및 결과 화면 조회/CSV 버튼 노출 확인

## Commit 4. 설문 저장/제출/제출취소 DB 동기화(Summitted)

### 요구사항
- 저장은 초안 저장(제출 아님), 제출은 `Summitted=True`
- 제출취소는 응답값 유지 + `Summitted=False`
- 관리자/코치 결과 집계는 제출완료 기준으로만 집계

### 수정 파일
- `backend/app/models/survey.py`
- `backend/app/main.py`
- `backend/app/services/survey_service.py`
- `backend/app/schemas/survey.py`
- `frontend/js/pages/survey.js`
- `frontend/js/api.js`
- `backend/tests/test_survey_feedback8_submit_toggle.py`
- `backend/tests/test_survey_feedback7.py`

### 핵심 변경
- [feedback8] `survey_response.summitted` 컬럼 추가 및 SQLite startup 자동 컬럼 보정
- [feedback8] 응답 저장 API에서 `summitted=false/true`를 받아 저장/제출을 분기 처리
- [feedback8] 제출취소 API는 delete 대신 `summitted=false` 업데이트로 변경(응답값 유지)
- [feedback8] 상세/통계/결과표시는 제출완료(summitted=true) 기준으로 정렬

### 검증 결과
- 자동 테스트
  - `python -m pytest tests/test_survey_feedback8_submit_toggle.py` 통과
  - `python -m pytest tests/test_survey_feedback7.py` 통과
- Chrome DevTools 실동작
  - 참여자: `저장` → 상태 `저장중(미제출)` 확인
  - 참여자: 필수 응답 입력 후 `제출` → 상태 `제출완료` + `제출취소` 버튼 노출 확인
  - 참여자: `제출취소` → 입력값 유지 + 입력 재활성화 + 상태 `저장중(미제출)` 복귀 확인

## Commit 5. 문서화/점검/최종 정리

### 수정 파일
- `feedback8.md`
- `feedback8_changed.md`
- `tasks8.md`

### 점검 항목
- [feedback8] 주석 검색: `rg "\[feedback8\]" backend frontend`
- 통합 회귀 테스트:
  - `python -m pytest tests/test_lecture_feedback7.py tests/test_calendar_lecture_feedback7.py tests/test_lecture_feedback8_list_detail_split.py tests/test_lecture_feedback8_time_and_calendar_edit.py tests/test_survey_feedback7.py tests/test_survey_feedback8_screen_and_permission.py tests/test_survey_feedback8_submit_toggle.py`

### 검증 결과
- 테스트 20건 통과
- Chrome DevTools 관리자/참여자/코치 시나리오 검증 완료
