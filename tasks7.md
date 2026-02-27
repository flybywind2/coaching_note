# Feedback7 반영 Task 정리 및 실행 계획

## 0. 요구사항 분석 요약

- 회사 내부 Git 기준으로 재작업이 필요하며, 변경 구간을 빠르게 식별할 수 있어야 함.
- 코드에는 동일한 식별 주석을 남기고, 변경점 요약 MD를 별도로 유지해야 함.
- 회사 MySQL 스키마(일부 변경) 데이터를 현재 프로젝트 SQLite로 이관하는 코드가 필요함.
- 기능 1~5는 반드시 기능별로 분리된 Git commit으로 관리해야 함.

## 1. 공통 규칙 및 선행 작업

- [x] 변경 식별 주석 규칙 확정
  - Python: `# [FEEDBACK7] ...`
  - JavaScript: `// [FEEDBACK7] ...`
  - SQL/Alembic: `-- [FEEDBACK7] ...`
- [x] 변경점 기록 문서 생성/운영
  - 파일: `feedback7_changes.md`
  - 기능별로 `추가/수정 파일`, `핵심 로직`, `테스트 결과`를 누적 기록
- [ ] 회사 코드 대비 스키마/도메인 차이표 작성
  - 파일: `docs/feedback7_schema_gap.md`
- [ ] MySQL -> SQLite 마이그레이션 유틸 구현
  - 파일: `backend/scripts/migrate_mysql_to_sqlite.py`
  - 옵션: `--mysql-url`, `--sqlite-path`, `--truncate`, `--tables`, `--dry-run`
  - FK 순서/참조 무결성/타입 변환(`DATETIME`, `JSON`, `BOOLEAN`) 처리
- [ ] 회귀 테스트 기본선 확보
  - `pytest backend/tests/test_about.py`
  - `pytest backend/tests/test_permissions.py`
  - `pytest backend/tests/test_calendar_schedule_policy.py`
  - `pytest backend/tests/test_calendar_participant.py`

## 2. 기능별 Task (Commit 분리 단위)

### Commit 1. SSP+ 소개 > 소식 메뉴 추가

- [x] 데이터 모델 추가
  - 후보 파일: `backend/app/models/about_news.py`, `backend/app/schemas/about_news.py`
  - 필드: `news_id`, `title`, `content`, `published_at`, `is_visible`, `created_by`, `updated_at`
- [x] API 구현
  - 후보 파일: `backend/app/routers/about_news.py`, `backend/app/main.py`
  - 목록: 최신순 정렬
  - 조회 기본값: 최신 소식 자동 선택
  - 작성/수정: 관리자만 허용
- [x] 프론트 탭/화면 구현
  - 후보 파일: `frontend/js/pages/about.js`, `frontend/js/components/header.js`, `frontend/js/api.js`
  - `SSP+ 소개 / 소식 / 코치 소개` 탭 구조로 변경
  - 좌측 리스트, 우측 본문 상세
  - 소개 탭 버튼 밑줄 제거 (`.tab-btn { text-decoration: none; }`)
- [x] 테스트 추가
  - 후보 파일: `backend/tests/test_about_news_feedback7.py`
  - 권한/정렬/기본 선택 검증

### Commit 2. 게시판 차수 분리 + 차수 공개 옵션

- [x] 게시글 스키마 확장
  - 후보 파일: `backend/app/models/board.py`, `backend/app/schemas/board.py`
  - 필드: `batch_id`, `is_batch_private`(해당 차수 공개 여부), `author_batch_id`
- [x] 권한 규칙 반영
  - 후보 파일: `backend/app/services/board_service.py`, `backend/app/utils/permissions.py`
  - 관리자/코치: 전 차수 작성 가능
  - 참여자: 본인 차수만 작성 가능
  - 조회는 전체 가능, 단 `is_batch_private=true`는 대상 차수 외 비공개 처리
- [x] UI 반영
  - 후보 파일: `frontend/js/pages/board.js`, `frontend/js/api.js`
  - 글 작성/수정에 `해당 차수에게만 공개` 체크박스
  - 비공개 글 식별 말머리/배지 표시
- [x] 테스트 추가
  - 후보 파일: `backend/tests/test_board_feedback7_batch_policy.py`
  - 역할별 작성 권한, 비공개 노출 제한, 댓글 작성 제한 검증

### Commit 3. 과제별 의견 취합(조사) 페이지 추가

- [ ] 메뉴명 확정
  - 추천: `과제 조사` (짧고 목적이 명확함)
  - 대안: `의견 조사`, `과제 의견수렴`
- [ ] 도메인 모델 구현
  - 후보 파일: `backend/app/models/project_research.py`, `backend/app/schemas/project_research.py`
  - 엔티티: 조사 아이템, 조사 세부항목(객관식/주관식), 과제별 응답
- [ ] API/권한 구현
  - 후보 파일: `backend/app/routers/project_research.py`, `backend/app/services/project_research_service.py`
  - 관리자: 아이템/목적/기간/공개/세부항목 CRUD
  - 관리자/코치: 전 차수 접근
  - 참여자: 본인 차수만 접근, 본인 과제 응답만 수정
  - 참관자: 메뉴/접근 차단
  - 공개 전환 시 알림 발송
- [ ] 화면 구현
  - 후보 파일: `frontend/js/pages/projectResearch.js`(신규), `frontend/js/app.js`, `frontend/js/router.js`, `frontend/js/components/header.js`
  - 상단 차수 선택, 좌측 아이템 리스트(최신순), 우측 목적+동적 컬럼 테이블
  - 본인 과제 행 최상단 배치
- [ ] 테스트 추가
  - 후보 파일: `backend/tests/test_project_research_feedback7.py`
  - 기간 제어, 공개 제어, 역할 제어, 동적 컬럼 저장 검증

### Commit 4. 설문 페이지 추가

- [ ] 설문 모델 구현
  - 후보 파일: `backend/app/models/survey.py`, `backend/app/schemas/survey.py`
  - 엔티티: 설문, 질문, 선택지, 응답, 응답 상세
  - 제약: 동시에 공개 가능한 설문은 1개
- [ ] API 구현
  - 후보 파일: `backend/app/routers/surveys.py`, `backend/app/services/survey_service.py`
  - 관리자: 생성/수정/삭제/공개/결과조회/CSV 추출
  - 참여자: 대상 차수 + 기간 내 제출/제출취소(재수정)
  - 공개 시 대상 차수 알림
- [ ] 질문 유형/검증 구현
  - 주관식, 객관식(항목형/점수형), 필수 여부, 항목형 다중선택
  - 필수 미응답 시 제출 불가/하이라이트
- [ ] 통계 구현
  - 과제별 응답률
  - 점수형 평균(전체/과제별)
- [ ] 프론트 화면 구현
  - 후보 파일: `frontend/js/pages/survey.js`(신규), `frontend/js/api.js`, `frontend/js/components/header.js`
  - 메뉴 노출: 관리자/참여자만
  - 비대상 참여자 문구: `현재 진행중인 설문이 없습니다.`
- [ ] 테스트 추가
  - 후보 파일: `backend/tests/test_survey_feedback7.py`

### Commit 5. 수강신청 페이지 + 강의관리/캘린더 연동

- [ ] 강의/신청 도메인 모델 구현
  - 후보 파일: `backend/app/models/lecture.py`, `backend/app/schemas/lecture.py`
  - 엔티티: 강의, 신청기간, 정원/팀별정원, 신청자(팀원 다중선택), 승인상태
- [ ] API 구현
  - 후보 파일: `backend/app/routers/lectures.py`, `backend/app/services/lecture_service.py`
  - 조회: 전 사용자, 전 차수 열람 가능
  - 신청: 해당 차수 참여자만, 기간 내만 가능, 팀별 정원 초과 방지
  - 관리자: 강의 CRUD/일괄수정/입과 승인
- [ ] 수강신청 UI 구현
  - 후보 파일: `frontend/js/pages/courseRegistration.js`(신규), `frontend/js/app.js`, `frontend/js/router.js`, `frontend/js/components/header.js`
  - 상단: 커리큘럼 소개
  - 하단: 카드형 강의 리스트 + 상세 페이지
  - 태그: `신청 중`, `입과 승인`
- [ ] 관리자 UI 구현
  - 후보 파일: `frontend/js/pages/admin.js`
  - `강의 관리` 탭 추가 + 복수 선택 일괄수정
- [ ] 캘린더 연동
  - 후보 파일: `backend/app/routers/calendar.py`, `backend/app/routers/schedules.py`, `frontend/js/pages/calendar.js`
  - 일정 구분에 `강의일정` 추가
  - 강의 관리에서 생성/수정한 강의를 캘린더 날짜에 노출
  - 캘린더 상세에서 강의 소개 페이지 이동 링크 제공
- [ ] 테스트 추가
  - 후보 파일: `backend/tests/test_lecture_feedback7.py`, `backend/tests/test_calendar_lecture_feedback7.py`

## 3. 권장 구현 순서(실행 계획)

### Phase A. 기반 정리 (0.5~1일)

- [ ] 주석 규칙/변경 기록 문서/스키마 갭 문서 준비
- [ ] MySQL -> SQLite 마이그레이션 스크립트 완성 + dry-run 검증

### Phase B. 기능 커밋 진행 (기능당 1 commit)

- [x] Commit 1: 소식 메뉴
- [x] Commit 2: 게시판 차수 정책
- [ ] Commit 3: 과제 조사 페이지
- [ ] Commit 4: 설문 페이지
- [ ] Commit 5: 수강신청/강의관리/캘린더 연동

### Phase C. 통합 검증 (1~2일)

- [ ] 기능별 신규 테스트 + 기존 회귀 테스트 통과 확인
- [ ] `feedback7_changes.md` 최종 업데이트
- [ ] 회사 Git 반영용 전달 패키지 정리

## 4. Commit 전략(요구사항 반영)

- `chore(feedback7): add shared marker rules and mysql-to-sqlite migration utility`
- `feat(about): add news tab and newsletter management`
- `feat(board): add batch-scoped posting and private-by-batch visibility`
- `feat(research): add project research page with dynamic question table`
- `feat(survey): add survey management/respond/statistics/csv`
- `feat(lecture): add course registration page and calendar-linked lecture management`

## 5. 완료 기준 (Definition of Done)

- [ ] 코드 변경 위치마다 `[FEEDBACK7]` 주석이 일관되게 포함됨
- [ ] `feedback7_changes.md`에 기능별 변경 파일/핵심 동작/테스트 결과가 기록됨
- [ ] MySQL -> SQLite 마이그레이션 스크립트가 샘플 데이터 기준으로 정상 동작함
- [ ] 기능 1~5가 각각 독립 commit으로 분리됨
- [ ] 신규/수정 테스트가 모두 통과함
