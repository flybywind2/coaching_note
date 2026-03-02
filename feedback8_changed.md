# feedback8_changed 변경 기록

## 요구사항
- 설문 화면을 관리자 `구성/결과`로 분리하고 코치 결과 조회를 허용
- 기존 질문 재활용 기능 추가
- 설문 저장/제출/제출취소를 `Summitted` 상태와 동기화

## 수정 파일
- 프론트
  - `frontend/js/pages/survey.js`
  - `frontend/js/api.js`
  - `frontend/js/router.js`
  - `frontend/js/components/header.js`
  - `frontend/css/style.css`
- 백엔드
  - `backend/app/models/survey.py`
  - `backend/app/schemas/survey.py`
  - `backend/app/services/survey_service.py`
  - `backend/app/routers/surveys.py`
  - `backend/app/main.py`
- 테스트/문서
  - `backend/tests/test_survey_feedback8_screen_and_permission.py`
  - `backend/tests/test_survey_feedback8_submit_toggle.py`
  - `backend/tests/test_survey_feedback7.py`
  - `feedback8.md`
  - `tasks8.md`

## 핵심 로직
- [feedback8] 관리자 설문 페이지 모드 분리(`구성 화면`/`결과 화면`)
- [feedback8] 코치 설문 결과 조회 허용(목록/상세/통계/CSV), 생성/수정은 관리자 전용 유지
- [feedback8] 질문 뱅크 API(`/api/surveys/question-bank`) + 기존 질문 복제 UI 추가
- [feedback8] `survey_response.summitted` 컬럼 추가
- [feedback8] 저장(`summitted=false`), 제출(`summitted=true`), 제출취소(`summitted=false` + 답변 유지) 동기화
- [feedback8] 결과 집계/표시는 제출완료 응답만 사용

## 검증 결과
- 자동 테스트
  - `python -m pytest tests/test_lecture_feedback7.py tests/test_calendar_lecture_feedback7.py tests/test_lecture_feedback8_list_detail_split.py tests/test_lecture_feedback8_time_and_calendar_edit.py tests/test_survey_feedback7.py tests/test_survey_feedback8_screen_and_permission.py tests/test_survey_feedback8_submit_toggle.py`
  - 결과: 20 passed
- Chrome DevTools 실동작
  - 관리자: 설문 `구성/결과` 분리, 질문 재활용 모달 확인
  - 참여자: 저장→제출→제출취소 흐름 및 상태 전환 확인
  - 코치: 설문 결과 화면 접근 및 CSV 버튼 확인
