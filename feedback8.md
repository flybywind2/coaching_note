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
