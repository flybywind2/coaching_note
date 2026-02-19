# SSP+ 코칭노트 관리 시스템 - 프로젝트 구현 문서

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [시스템 아키텍처](#2-시스템-아키텍처)
3. [사용자 역할 및 권한](#3-사용자-역할-및-권한)
4. [데이터베이스 설계](#4-데이터베이스-설계)
5. [API 설계](#5-api-설계)
6. [화면 설계](#6-화면-설계)
7. [프로젝트 구조](#7-프로젝트-구조)
8. [핵심 코드 구현](#8-핵심-코드-구현)
9. [개발 일정 및 MVP 범위](#9-개발-일정-및-mvp-범위)
10. [용어 정의](#10-용어-정의)

---sp

## 1. 프로젝트 개요

### 1.1 프로젝트 정보

| 항목 | 내용 |
|------|------|
| **프로젝트명** | SSP+ 코칭노트 관리 시스템 |
| **목적** | AI활용 과제 코칭 프로그램의 지식/노하우를 구조화하여 조직 자산으로 축적 |
| **개발 기간** | 4주 |
| **개발 방식** | 내부 자체 개발 |
| **기술 스택** | Python (FastAPI) + Vanilla JavaScript |

### 1.2 핵심 문제 및 목표

| 현재 문제 | 목표 상태 |
|----------|----------|
| 코칭 내용이 휘발되어 조직 자산으로 남지 않음 | 모든 코칭 기록이 구조화되어 검색/재사용 가능 |
| 과제 진행 상황 파악 어려움 | 실시간 진행 현황 대시보드 제공 |
| 같은 시행착오 반복 | 유사 과제 참고로 성공률 향상 |
| 코칭이 개인 경험으로 종료 | Q&A Set, Summary로 자산화 |

### 1.3 성공 기준

- 코칭을 받아 1차 결과물을 일정 내 완성
- 이후 코칭 없이 참여자 스스로 결과물 완성 가능
- 축적된 지식이 다음 과제의 성공 확률을 높이는 선순환 구조

### 1.4 시스템 주요 기능

| 번호 | 기능 | 설명 |
|:----:|------|------|
| 1 | 참여 과제 리스트 | 과제명, 조직, 대표자, 분류별 과제 목록 관리 |
| 2 | 과제별 공간 | 기본정보, 지원서, 컨설팅, 워크샵, 발표자료, 코칭노트 |
| 3 | 스케줄 관리 | 프로그램 일정, 코칭 세션, Task/마일스톤 |
| 4 | 소통 게시판 | 공지사항, Q&A, 자유게시판 |
| 5 | SSP+ 소개 | 과정 소개, 코치 소개 (사내/사외) |
| 6 | 대시보드 | 과제 진행률, 코칭 현황 (관리자/코치 전용) |
| 7 | 관리자 메뉴 | 차수/과제/사용자/권한 관리 |

---

## 2. 시스템 아키텍처

### 2.1 기술 스택

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                             │
│                   Vanilla JavaScript                        │
│                      HTML5 / CSS3                           │
└─────────────────────────┬───────────────────────────────────┘
                          │ REST API (JSON)
┌─────────────────────────▼───────────────────────────────────┐
│                        Backend                              │
│                  Python 3.11+ (FastAPI)                     │
│              Uvicorn (ASGI Server)                          │
└─────────────────────────┬───────────────────────────────────┘
                          │ SQLAlchemy ORM
┌─────────────────────────▼───────────────────────────────────┐
│                       Database                              │
│                 SQLite (개발/초기)                           │
│              → PostgreSQL (운영/확장)                        │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 배포 환경

| 항목 | 내용 |
|------|------|
| 네트워크 | 사내망 전용 |
| 인증 | SSO 연동 (사내 계정) |
| 동시 접속 | 최대 50명 |
| 외부 라이브러리 | 최소화 |
| 모바일 대응 | 불필요 |

### 2.3 시스템 구성도

```
┌─────────────────────────────────────────────────────────────────┐
│                         사내망                                  │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │   Client    │────▶│   Nginx     │────▶│   FastAPI   │       │
│  │  (Browser)  │     │  (Reverse   │     │   Server    │       │
│  │             │◀────│   Proxy)    │◀────│             │       │
│  └─────────────┘     └─────────────┘     └──────┬──────┘       │
│                                                  │              │
│                             ┌────────────────────┼──────────┐  │
│                             │                    ▼          │  │
│  ┌─────────────┐           │  ┌─────────────────────────┐  │  │
│  │     SSO     │◀──────────┼──│       Database          │  │  │
│  │   Server    │           │  │   (SQLite/PostgreSQL)   │  │  │
│  └─────────────┘           │  └─────────────────────────┘  │  │
│                             │                               │  │
│                             │  ┌─────────────────────────┐  │  │
│                             │  │     File Storage        │  │  │
│                             │  │      (uploads/)         │  │  │
│                             │  └─────────────────────────┘  │  │
│                             └───────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 사용자 역할 및 권한

### 3.1 사용자 유형 (4종)

| 역할 | 설명 | 주요 작업 |
|------|------|----------|
| **관리자 (코디네이터)** | 프로그램 전체 운영 | 코치-과제 매칭, 권한/일정 관리, 공지 |
| **코치** | 다수 과제를 번갈아 코칭 | 코칭노트 작성, 피드백, Task 관리 |
| **과제 참여자** | 본인 과제 수행 | 진행상황 기록, 질문, Task 체크 |
| **참관자** | 공개 과제 열람 | 타 과제 코칭 기록 참고 |

### 3.2 권한 매트릭스

| 기능 | 관리자 | 코치 | 참여자 | 참관자 |
|------|:------:|:----:|:------:|:------:|
| **과제 목록 조회** | ✅ | ✅ | ✅ | ✅ (공개만) |
| **과제 생성/수정** | ✅ | ❌ | ❌ | ❌ |
| **과제 공간 - 본인 과제** | 열람/작성 | 열람/작성 | 열람/작성 | - |
| **과제 공간 - 타 과제 (공개)** | 열람/작성 | 열람/작성 | 열람/댓글 | 열람/댓글 |
| **과제 공간 - 타 과제 (비공개)** | 열람/작성 | 열람/작성 | 권한시만 | 권한시만 |
| **코칭노트 작성** | ✅ | ✅ | ❌ | ❌ |
| **코칭 의견 작성** | ✅ | ✅ | ✅ (본인 과제) | ❌ |
| **코치 전용 메모** | 열람 | 열람/작성 | ❌ | ❌ |
| **Task/마일스톤 생성** | ✅ | ✅ | ✅ (본인 과제) | ❌ |
| **마일스톤 순서 변경** | ✅ | ✅ | ❌ | ❌ |
| **프로그램 일정 관리** | ✅ | ❌ | ❌ | ❌ |
| **코칭 세션 배정** | ✅ | ❌ | ❌ | ❌ |
| **코칭 세션 상태 변경** | ✅ | ✅ | ❌ | ❌ |
| **통합 캘린더 조회** | ✅ | ✅ | ✅ (본인 관련) | ✅ (공개만) |
| **소통 게시판** | 열람/작성/공지 | 열람/작성 | 열람/작성 | 열람 |
| **대시보드** | ✅ | ✅ | ❌ | ❌ |
| **관리자 메뉴** | ✅ | ❌ | ❌ | ❌ |
| **SSP+ 소개** | 열람/수정 | 열람 | 열람 | 열람 |

---

## 4. 데이터베이스 설계

### 4.1 ERD (Entity Relationship Diagram)

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│     Batch       │       │      User       │       │     Coach       │
│     (차수)      │       │    (사용자)     │       │   (코치정보)    │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ PK batch_id     │       │ PK user_id      │       │ PK coach_id     │
│ batch_name      │       │ emp_id (사번)   │       │ FK user_id      │
│ start_date      │       │ name            │       │ photo_url       │
│ end_date        │       │ department      │       │ coach_type      │
│ status          │       │ role            │       │ specialty       │
│ created_at      │       │ email           │       │ career          │
└────────┬────────┘       │ is_active       │       │ affiliation     │
         │                │ created_at      │       └─────────────────┘
         │                └────────┬────────┘
         │                         │
         │    ┌────────────────────┴────────────────────┐
         │    │                                         │
┌────────▼────▼───────┐                    ┌────────────▼────────────┐
│      Project        │                    │     ProjectMember       │
│       (과제)        │                    │     (과제 참여자)       │
├─────────────────────┤                    ├─────────────────────────┤
│ PK project_id       │◄───────────────────│ PK member_id            │
│ FK batch_id         │                    │ FK project_id           │
│ project_name        │                    │ FK user_id              │
│ organization        │                    │ role                    │
│ representative      │                    │ is_representative       │
│ category            │                    └─────────────────────────┘
│ visibility          │
│ progress_rate       │
│ status              │
│ ai_summary          │
│ created_at          │
│ updated_at          │
└──────────┬──────────┘
           │
     ┌─────┴─────┬─────────────────┬─────────────────┐
     │           │                 │                 │
     ▼           ▼                 ▼                 ▼
┌─────────┐ ┌─────────┐     ┌───────────┐     ┌───────────┐
│Project  │ │Coaching │     │ Coaching  │     │ Project   │
│Document │ │  Note   │     │  Session  │     │   Task    │
└─────────┘ └────┬────┘     └─────┬─────┘     └───────────┘
                 │                │
                 ▼                ▼
           ┌───────────┐   ┌───────────┐
           │ Coaching  │   │  Session  │
           │ Comment   │   │ Attendee  │
           └───────────┘   └───────────┘


┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ ProgramSchedule │       │      Board      │       │   Notification  │
│ (프로그램 일정) │       │    (게시판)     │       │     (알림)      │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ PK schedule_id  │       │ PK board_id     │       │ PK noti_id      │
│ FK batch_id     │       │ board_name      │       │ FK user_id      │
│ title           │       │ board_type      │       │ noti_type       │
│ schedule_type   │       │ description     │       │ title           │
│ start_datetime  │       └────────┬────────┘       │ message         │
│ end_datetime    │                │                │ link_url        │
│ location        │                ▼                │ is_read         │
│ is_all_day      │       ┌─────────────────┐       │ created_at      │
│ created_by      │       │    BoardPost    │       └─────────────────┘
│ created_at      │       │    (게시글)     │
└─────────────────┘       ├─────────────────┤
                          │ PK post_id      │
                          │ FK board_id     │
                          │ FK author_id    │
                          │ title           │
                          │ content         │
                          │ is_notice       │
                          │ attachments     │
                          │ created_at      │
                          └────────┬────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │   PostComment   │
                          │  (게시글 댓글)  │
                          ├─────────────────┤
                          │ PK comment_id   │
                          │ FK post_id      │
                          │ FK author_id    │
                          │ content         │
                          │ created_at      │
                          └─────────────────┘
```

### 4.2 테이블 상세 정의

#### 4.2.1 Batch (차수)

```sql
CREATE TABLE batch (
    batch_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_name      VARCHAR(100) NOT NULL,          -- "2026년 1차"
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    status          VARCHAR(20) DEFAULT 'planned',  -- planned/ongoing/completed
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 4.2.2 User (사용자)

```sql
CREATE TABLE user (
    user_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_id          VARCHAR(20) UNIQUE NOT NULL,    -- 사번 (SSO 연동)
    name            VARCHAR(50) NOT NULL,
    department      VARCHAR(100),
    role            VARCHAR(20) NOT NULL,           -- admin/coach/participant/observer
    email           VARCHAR(100),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 4.2.3 Coach (코치 정보)

```sql
CREATE TABLE coach (
    coach_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER,                        -- 사내 코치인 경우 연결
    name            VARCHAR(50) NOT NULL,
    photo_url       VARCHAR(500),
    coach_type      VARCHAR(20) NOT NULL,           -- internal/external
    department      VARCHAR(100),                   -- 사내: 부서
    affiliation     VARCHAR(100),                   -- 사외: 소속
    specialty       VARCHAR(200),                   -- 코칭 분야
    career          TEXT,                           -- 경력 (사외)
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(user_id)
);
```

#### 4.2.4 Project (과제)

```sql
CREATE TABLE project (
    project_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id        INTEGER NOT NULL,
    project_name    VARCHAR(200) NOT NULL,
    organization    VARCHAR(100) NOT NULL,          -- 참여 조직
    representative  VARCHAR(50),                    -- 대표자명
    category        VARCHAR(50),                    -- 과제 분류
    visibility      VARCHAR(20) DEFAULT 'public',   -- public/restricted
    progress_rate   INTEGER DEFAULT 0,              -- 0~100 (마일스톤 기반 자동 계산)
    status          VARCHAR(20) DEFAULT 'preparing',
    ai_summary      TEXT,                           -- AI 핵심 요약
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP,
    FOREIGN KEY (batch_id) REFERENCES batch(batch_id)
);

CREATE INDEX idx_project_batch ON project(batch_id);
```

#### 4.2.5 ProjectMember (과제 참여자)

```sql
CREATE TABLE project_member (
    member_id           INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id          INTEGER NOT NULL,
    user_id             INTEGER NOT NULL,
    role                VARCHAR(20) DEFAULT 'member',   -- leader/member
    is_representative   BOOLEAN DEFAULT FALSE,
    joined_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES project(project_id),
    FOREIGN KEY (user_id) REFERENCES user(user_id),
    UNIQUE(project_id, user_id)
);
```

#### 4.2.6 ProjectDocument (과제 문서)

```sql
CREATE TABLE project_document (
    doc_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      INTEGER NOT NULL,
    doc_type        VARCHAR(30) NOT NULL,           -- application/basic_consulting/workshop_result/mid_presentation/final_presentation
    title           VARCHAR(200),
    content         TEXT,
    attachments     TEXT,                           -- JSON: [{filename, url, size}]
    created_by      INTEGER NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES project(project_id),
    FOREIGN KEY (created_by) REFERENCES user(user_id)
);

CREATE INDEX idx_document_project ON project_document(project_id, doc_type);
```

#### 4.2.7 CoachingNote (코칭노트)

```sql
CREATE TABLE coaching_note (
    note_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      INTEGER NOT NULL,
    author_id       INTEGER NOT NULL,               -- 작성자 (코치)
    coaching_date   DATE NOT NULL,
    week_number     INTEGER,                        -- 몇 주차
    current_status  TEXT,                           -- 현재 과제 진행 상태
    progress_rate   INTEGER,                        -- 진행률 (0~100)
    main_issue      TEXT,                           -- 당면한 문제
    next_action     TEXT,                           -- 다음 작업
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES project(project_id),
    FOREIGN KEY (author_id) REFERENCES user(user_id)
);

CREATE INDEX idx_note_project ON coaching_note(project_id, coaching_date DESC);
```

#### 4.2.8 CoachingComment (코칭 의견)

```sql
CREATE TABLE coaching_comment (
    comment_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id         INTEGER NOT NULL,
    author_id       INTEGER NOT NULL,
    content         TEXT NOT NULL,
    code_snippet    TEXT,                           -- 참조 코드
    is_coach_only   BOOLEAN DEFAULT FALSE,          -- 코치 전용 여부
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (note_id) REFERENCES coaching_note(note_id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES user(user_id)
);

CREATE INDEX idx_comment_note ON coaching_comment(note_id);
```

#### 4.2.9 ProgramSchedule (프로그램 일정)

```sql
CREATE TABLE program_schedule (
    schedule_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id        INTEGER NOT NULL,
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    schedule_type   VARCHAR(30) NOT NULL,           -- orientation/workshop/mid_presentation/final_presentation/networking/other
    start_datetime  DATETIME NOT NULL,
    end_datetime    DATETIME,
    location        VARCHAR(200),
    is_all_day      BOOLEAN DEFAULT FALSE,
    created_by      INTEGER NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP,
    FOREIGN KEY (batch_id) REFERENCES batch(batch_id),
    FOREIGN KEY (created_by) REFERENCES user(user_id)
);

CREATE INDEX idx_schedule_batch ON program_schedule(batch_id, start_datetime);
```

#### 4.2.10 CoachingSession (코칭 세션)

```sql
CREATE TABLE coaching_session (
    session_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id        INTEGER NOT NULL,
    project_id      INTEGER NOT NULL,
    session_date    DATE NOT NULL,
    start_time      TIME NOT NULL,
    end_time        TIME NOT NULL,
    location        VARCHAR(200),
    session_status  VARCHAR(20) DEFAULT 'scheduled',    -- scheduled/completed/cancelled/rescheduled
    note            TEXT,
    created_by      INTEGER NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP,
    FOREIGN KEY (batch_id) REFERENCES batch(batch_id),
    FOREIGN KEY (project_id) REFERENCES project(project_id),
    FOREIGN KEY (created_by) REFERENCES user(user_id)
);

CREATE INDEX idx_session_date ON coaching_session(batch_id, session_date);
CREATE INDEX idx_session_project ON coaching_session(project_id);
```

#### 4.2.11 SessionAttendee (세션 참석자)

```sql
CREATE TABLE session_attendee (
    attendee_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id          INTEGER NOT NULL,
    user_id             INTEGER NOT NULL,
    attendee_role       VARCHAR(20) NOT NULL,           -- coach/participant
    attendance_status   VARCHAR(20) DEFAULT 'scheduled',-- scheduled/attended/absent/cancelled
    FOREIGN KEY (session_id) REFERENCES coaching_session(session_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES user(user_id),
    UNIQUE(session_id, user_id)
);
```

#### 4.2.12 ProjectTask (과제 Task/마일스톤)

```sql
CREATE TABLE project_task (
    task_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      INTEGER NOT NULL,
    assigned_to     INTEGER,                            -- 담당자 (NULL이면 과제 전체)
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    due_date        DATE,
    priority        VARCHAR(10) DEFAULT 'medium',       -- high/medium/low
    status          VARCHAR(20) DEFAULT 'todo',         -- todo/in_progress/completed/cancelled
    is_milestone    BOOLEAN DEFAULT FALSE,              -- 마일스톤 여부
    milestone_order INTEGER,                            -- 마일스톤 순서
    created_by      INTEGER NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP,
    completed_at    TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES project(project_id),
    FOREIGN KEY (assigned_to) REFERENCES user(user_id),
    FOREIGN KEY (created_by) REFERENCES user(user_id)
);

CREATE INDEX idx_task_project ON project_task(project_id);
CREATE INDEX idx_task_milestone ON project_task(project_id, is_milestone, milestone_order);
CREATE INDEX idx_task_due_date ON project_task(due_date);
CREATE INDEX idx_task_assigned ON project_task(assigned_to);
```

#### 4.2.13 Board (게시판)

```sql
CREATE TABLE board (
    board_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    board_name      VARCHAR(100) NOT NULL,
    board_type      VARCHAR(30) NOT NULL,               -- notice/qna/free
    description     TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 4.2.14 BoardPost (게시글)

```sql
CREATE TABLE board_post (
    post_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id        INTEGER NOT NULL,
    author_id       INTEGER NOT NULL,
    title           VARCHAR(200) NOT NULL,
    content         TEXT NOT NULL,
    is_notice       BOOLEAN DEFAULT FALSE,              -- 공지 여부
    attachments     TEXT,                               -- JSON
    view_count      INTEGER DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP,
    FOREIGN KEY (board_id) REFERENCES board(board_id),
    FOREIGN KEY (author_id) REFERENCES user(user_id)
);

CREATE INDEX idx_post_board ON board_post(board_id, created_at DESC);
```

#### 4.2.15 PostComment (게시글 댓글)

```sql
CREATE TABLE post_comment (
    comment_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id         INTEGER NOT NULL,
    author_id       INTEGER NOT NULL,
    content         TEXT NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES board_post(post_id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES user(user_id)
);

CREATE INDEX idx_post_comment ON post_comment(post_id);
```

#### 4.2.16 Notification (알림)

```sql
CREATE TABLE notification (
    noti_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    noti_type       VARCHAR(30) NOT NULL,               -- question_registered/notice_posted/coaching_feedback
    title           VARCHAR(200) NOT NULL,
    message         TEXT,
    link_url        VARCHAR(500),
    is_read         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(user_id)
);

CREATE INDEX idx_notification_user ON notification(user_id, is_read, created_at DESC);
```

---

## 5. API 설계

### 5.1 API 엔드포인트 전체 목록

#### 5.1.1 인증 (Auth)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| POST | `/api/auth/login` | SSO 로그인 | 전체 |
| POST | `/api/auth/logout` | 로그아웃 | 전체 |
| GET | `/api/auth/me` | 현재 사용자 정보 | 전체 |

#### 5.1.2 차수 관리 (Batch)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/api/batches` | 차수 목록 조회 | 전체 |
| GET | `/api/batches/{batch_id}` | 차수 상세 조회 | 전체 |
| POST | `/api/batches` | 차수 생성 | 관리자 |
| PUT | `/api/batches/{batch_id}` | 차수 수정 | 관리자 |
| DELETE | `/api/batches/{batch_id}` | 차수 삭제 | 관리자 |

#### 5.1.3 과제 관리 (Project)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/api/batches/{batch_id}/projects` | 과제 목록 조회 | 전체 |
| GET | `/api/projects/{project_id}` | 과제 상세 조회 | 권한별 |
| POST | `/api/batches/{batch_id}/projects` | 과제 생성 | 관리자 |
| PUT | `/api/projects/{project_id}` | 과제 수정 | 관리자/코치 |
| DELETE | `/api/projects/{project_id}` | 과제 삭제 | 관리자 |
| GET | `/api/projects/{project_id}/summary` | AI 요약 조회 | 권한별 |
| POST | `/api/projects/{project_id}/summary` | AI 요약 생성 | 코치/관리자 |

#### 5.1.4 과제 문서 (Project Document)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/api/projects/{project_id}/documents` | 문서 목록 | 권한별 |
| GET | `/api/documents/{doc_id}` | 문서 상세 | 권한별 |
| POST | `/api/projects/{project_id}/documents` | 문서 등록 | 참여자/코치/관리자 |
| PUT | `/api/documents/{doc_id}` | 문서 수정 | 작성자/관리자 |
| DELETE | `/api/documents/{doc_id}` | 문서 삭제 | 작성자/관리자 |

#### 5.1.5 코칭노트 (Coaching Note)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/api/projects/{project_id}/notes` | 코칭노트 목록 | 권한별 |
| GET | `/api/notes/{note_id}` | 코칭노트 상세 | 권한별 |
| POST | `/api/projects/{project_id}/notes` | 코칭노트 작성 | 코치/관리자 |
| PUT | `/api/notes/{note_id}` | 코칭노트 수정 | 작성자 |
| DELETE | `/api/notes/{note_id}` | 코칭노트 삭제 | 작성자/관리자 |

#### 5.1.6 코칭 의견 (Coaching Comment)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/api/notes/{note_id}/comments` | 의견 목록 | 권한별 (coach_only 필터) |
| POST | `/api/notes/{note_id}/comments` | 의견 작성 | 코치/참여자 |
| PUT | `/api/comments/{comment_id}` | 의견 수정 | 작성자 |
| DELETE | `/api/comments/{comment_id}` | 의견 삭제 | 작성자/관리자 |

#### 5.1.7 프로그램 일정 (Program Schedule)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/api/batches/{batch_id}/schedules` | 프로그램 일정 목록 | 전체 |
| GET | `/api/schedules/{schedule_id}` | 일정 상세 | 전체 |
| POST | `/api/batches/{batch_id}/schedules` | 일정 등록 | 관리자 |
| PUT | `/api/schedules/{schedule_id}` | 일정 수정 | 관리자 |
| DELETE | `/api/schedules/{schedule_id}` | 일정 삭제 | 관리자 |

#### 5.1.8 코칭 세션 (Coaching Session)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/api/batches/{batch_id}/sessions` | 코칭 세션 목록 | 관리자/코치 |
| GET | `/api/projects/{project_id}/sessions` | 과제별 코칭 세션 | 권한별 |
| GET | `/api/sessions/{session_id}` | 세션 상세 | 권한별 |
| POST | `/api/batches/{batch_id}/sessions` | 세션 등록 (단건) | 관리자 |
| POST | `/api/batches/{batch_id}/sessions/bulk` | 세션 일괄 등록 | 관리자 |
| PUT | `/api/sessions/{session_id}` | 세션 수정 | 관리자 |
| DELETE | `/api/sessions/{session_id}` | 세션 삭제 | 관리자 |
| PUT | `/api/sessions/{session_id}/status` | 세션 상태 변경 | 관리자/코치 |
| PUT | `/api/sessions/{session_id}/attendees` | 참석자 관리 | 관리자 |

#### 5.1.9 Task/마일스톤 (Project Task)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/api/projects/{project_id}/tasks` | Task 목록 (마일스톤 포함) | 권한별 |
| GET | `/api/projects/{project_id}/milestones` | 마일스톤만 조회 | 권한별 |
| GET | `/api/tasks/{task_id}` | Task 상세 | 권한별 |
| POST | `/api/projects/{project_id}/tasks` | Task/마일스톤 등록 | 코치/참여자 |
| PUT | `/api/tasks/{task_id}` | Task 수정 | 작성자/담당자 |
| DELETE | `/api/tasks/{task_id}` | Task 삭제 | 작성자/관리자 |
| PUT | `/api/tasks/{task_id}/status` | Task 상태 변경 | 담당자/코치 |
| PUT | `/api/projects/{project_id}/milestones/reorder` | 마일스톤 순서 변경 | 관리자/코치 |
| GET | `/api/users/me/tasks` | 내 Task 목록 | 본인 |

#### 5.1.10 통합 캘린더 (Calendar)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/api/calendar` | 통합 캘린더 조회 | 권한별 |

#### 5.1.11 게시판 (Board)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/api/boards` | 게시판 목록 | 전체 |
| GET | `/api/boards/{board_id}/posts` | 게시글 목록 | 전체 |
| GET | `/api/posts/{post_id}` | 게시글 상세 | 전체 |
| POST | `/api/boards/{board_id}/posts` | 게시글 작성 | 관리자/코치/참여자 |
| PUT | `/api/posts/{post_id}` | 게시글 수정 | 작성자/관리자 |
| DELETE | `/api/posts/{post_id}` | 게시글 삭제 | 작성자/관리자 |
| POST | `/api/posts/{post_id}/comments` | 댓글 작성 | 전체 |
| DELETE | `/api/posts/comments/{comment_id}` | 댓글 삭제 | 작성자/관리자 |

#### 5.1.12 코치 정보 (Coach)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/api/coaches` | 코치 목록 | 전체 |
| GET | `/api/coaches/{coach_id}` | 코치 상세 | 전체 |
| POST | `/api/coaches` | 코치 등록 | 관리자 |
| PUT | `/api/coaches/{coach_id}` | 코치 정보 수정 | 관리자 |
| DELETE | `/api/coaches/{coach_id}` | 코치 삭제 | 관리자 |

#### 5.1.13 알림 (Notification)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/api/notifications` | 내 알림 목록 | 전체 |
| PUT | `/api/notifications/{noti_id}/read` | 읽음 처리 | 본인 |
| POST | `/api/notifications/broadcast` | 공지 발송 | 관리자 |

#### 5.1.14 대시보드 (Dashboard)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/api/dashboard/overview` | 전체 현황 | 관리자/코치 |
| GET | `/api/dashboard/projects` | 과제별 진행률 | 관리자/코치 |
| GET | `/api/dashboard/coaching-stats` | 코칭 통계 | 관리자/코치 |

#### 5.1.15 검색 (Search)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/api/search` | 통합 검색 | 권한별 |

#### 5.1.16 관리자 (Admin)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/api/admin/users` | 사용자 목록 | 관리자 |
| POST | `/api/admin/users` | 사용자 등록 | 관리자 |
| PUT | `/api/admin/users/{user_id}` | 사용자 수정 | 관리자 |
| POST | `/api/admin/projects/{project_id}/members` | 과제 멤버 배정 | 관리자 |
| POST | `/api/admin/projects/{project_id}/access` | 접근 권한 설정 | 관리자 |

#### 5.1.17 파일 업로드 (Upload)

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| POST | `/api/upload` | 파일 업로드 | 로그인 사용자 |
| DELETE | `/api/upload/{file_id}` | 파일 삭제 | 업로더/관리자 |

---

### 5.2 주요 API 상세 명세

#### 5.2.1 코칭노트 작성

```
POST /api/projects/{project_id}/notes
```

**Request Body:**
```json
{
  "coaching_date": "2026-03-15",
  "week_number": 3,
  "current_status": "데이터 전처리 완료, 모델 학습 진행 중",
  "progress_rate": 35,
  "main_issue": "GPU 메모리 부족으로 배치 사이즈 조정 필요",
  "next_action": "배치 사이즈 축소 후 재학습, 그래디언트 체크포인팅 적용 검토"
}
```

**Response (201 Created):**
```json
{
  "note_id": 127,
  "project_id": 15,
  "author": {
    "user_id": 8,
    "name": "김코치",
    "role": "coach"
  },
  "coaching_date": "2026-03-15",
  "week_number": 3,
  "current_status": "데이터 전처리 완료, 모델 학습 진행 중",
  "progress_rate": 35,
  "main_issue": "GPU 메모리 부족으로 배치 사이즈 조정 필요",
  "next_action": "배치 사이즈 축소 후 재학습, 그래디언트 체크포인팅 적용 검토",
  "created_at": "2026-03-15T14:30:00Z",
  "comments": []
}
```

#### 5.2.2 코칭 의견 추가

```
POST /api/notes/{note_id}/comments
```

**Request Body:**
```json
{
  "content": "메모리 이슈는 gradient_checkpointing=True 옵션으로 해결 가능합니다.",
  "code_snippet": "model.gradient_checkpointing_enable()\ntrainer = Trainer(\n    model=model,\n    args=training_args,\n    ...\n)",
  "is_coach_only": false
}
```

#### 5.2.3 통합 캘린더 조회

```
GET /api/calendar?batch_id=3&start_date=2026-03-01&end_date=2026-03-31&type=all&project_id=15&coach_id=8
```

**Query Parameters:**

| 파라미터 | 필수 | 설명 |
|----------|:----:|------|
| batch_id | O | 차수 ID |
| start_date | O | 조회 시작일 (YYYY-MM-DD) |
| end_date | O | 조회 종료일 (YYYY-MM-DD) |
| type | X | 일정 유형 필터 (all/program/session/task/milestone) |
| project_id | X | 과제 ID 필터 |
| coach_id | X | 코치 ID 필터 |

**Response:**
```json
{
  "batch_id": 3,
  "period": {
    "start_date": "2026-03-01",
    "end_date": "2026-03-31"
  },
  "events": [
    {
      "event_id": "program_1",
      "event_type": "program",
      "title": "중간 발표",
      "start": "2026-03-20T09:00:00",
      "end": "2026-03-20T18:00:00",
      "all_day": false,
      "location": "교육장 A",
      "color": "#4CAF50",
      "data": {
        "schedule_id": 1,
        "schedule_type": "mid_presentation",
        "description": "과제별 중간 발표 진행"
      }
    },
    {
      "event_id": "session_45",
      "event_type": "session",
      "title": "[불량 예측 모델] 코칭",
      "start": "2026-03-15T10:00:00",
      "end": "2026-03-15T11:00:00",
      "all_day": false,
      "location": "교육장 B-3",
      "color": "#2196F3",
      "data": {
        "session_id": 45,
        "project_id": 15,
        "project_name": "불량 예측 모델",
        "coaches": ["김코치", "박코치"],
        "participants": ["홍길동", "이영희"],
        "session_status": "scheduled"
      }
    },
    {
      "event_id": "milestone_78",
      "event_type": "milestone",
      "title": "🎯[불량 예측 모델] 1차 모델 학습 완료",
      "start": "2026-03-19",
      "end": "2026-03-19",
      "all_day": true,
      "color": "#9C27B0",
      "data": {
        "task_id": 78,
        "project_id": 15,
        "project_name": "불량 예측 모델",
        "milestone_order": 3,
        "status": "in_progress"
      }
    }
  ],
  "summary": {
    "total_events": 45,
    "by_type": {
      "program": 3,
      "session": 28,
      "task": 10,
      "milestone": 4
    }
  }
}
```

#### 5.2.4 코칭 세션 일괄 등록

```
POST /api/batches/{batch_id}/sessions/bulk
```

**Request Body:**
```json
{
  "session_date": "2026-03-15",
  "location": "교육장 B",
  "sessions": [
    {
      "project_id": 15,
      "start_time": "09:00",
      "end_time": "10:00",
      "coaches": [8, 12],
      "note": "데이터 전처리 리뷰"
    },
    {
      "project_id": 16,
      "start_time": "10:00",
      "end_time": "11:00",
      "coaches": [8],
      "note": ""
    }
  ]
}
```

#### 5.2.5 Task/마일스톤 목록 조회

```
GET /api/projects/{project_id}/tasks
```

**Response:**
```json
{
  "tasks": [
    {
      "task_id": 80,
      "title": "학습 데이터 레이블링",
      "due_date": "2026-03-18",
      "priority": "high",
      "status": "in_progress",
      "is_milestone": false,
      "assigned_to_name": "홍길동"
    }
  ],
  "milestones": [
    {
      "task_id": 78,
      "title": "1차 모델 학습 완료",
      "due_date": "2026-03-19",
      "priority": "high",
      "status": "in_progress",
      "is_milestone": true,
      "milestone_order": 3
    }
  ],
  "total": 10,
  "milestone_progress": {
    "total": 5,
    "completed": 2,
    "percentage": 40,
    "current_milestone": {
      "task_id": 78,
      "title": "1차 모델 학습 완료",
      "status": "in_progress",
      "due_date": "2026-03-19"
    }
  }
}
```

#### 5.2.6 대시보드 - 코칭 통계

```
GET /api/dashboard/coaching-stats?batch_id=3
```

**Response:**
```json
{
  "batch_id": 3,
  "batch_name": "2026년 1차",
  "summary": {
    "total_projects": 30,
    "avg_progress_rate": 42,
    "total_coaching_notes": 156,
    "total_coaches_active": 8
  },
  "weekly_stats": [
    {
      "week": 1,
      "notes_count": 28,
      "projects_with_notes": 26,
      "unique_coaches": 7
    },
    {
      "week": 2,
      "notes_count": 31,
      "projects_with_notes": 28,
      "unique_coaches": 8
    }
  ],
  "project_coaching_distribution": [
    {
      "project_id": 15,
      "project_name": "불량 예측 모델",
      "notes_count": 6,
      "unique_coaches": 4
    }
  ]
}
```

---

## 6. 화면 설계

### 6.1 사이트맵

```
SSP+ 코칭노트 관리 시스템
│
├── 🏠 홈 (대시보드 or 과제 리스트)
│
├── 📅 스케줄
│   ├── 캘린더 뷰 (월간/주간)
│   ├── 필터 (차수, 과제, 코치, 일정유형)
│   └── 이벤트 상세 모달
│
├── 📋 참여 과제 리스트
│   ├── 과제 카드 뷰 / 테이블 뷰
│   ├── 필터 (차수, 조직, 분류, 진행상태)
│   └── 검색
│
├── 📁 과제별 공간
│   ├── 📄 과제 기본 정보 (+ AI 핵심 요약)
│   ├── 📅 코칭 일정 (해당 과제의 코칭 세션)
│   ├── ✅ Task & 마일스톤
│   │   ├── 마일스톤 진행률
│   │   └── Task 목록
│   ├── 📝 지원서
│   ├── 📊 기초 컨설팅 결과
│   ├── 🤝 공동 워크샵 결과
│   ├── 🎤 중간 발표
│   ├── 🏆 최종 발표
│   └── 📓 코칭노트
│       ├── 노트 타임라인
│       ├── 노트 상세 (의견/댓글 포함)
│       └── 노트 작성/수정
│
├── 💬 소통 게시판
│   ├── 공지사항
│   ├── Q&A
│   └── 자유게시판
│
├── ℹ️ SSP+ 소개
│   ├── 과정 소개
│   └── 코치 소개
│       ├── 사내 코치 (사진, 이름, ID, 부서, 코칭분야)
│       └── 사외 코치 (사진, 이름, 소속, 경력)
│
├── 📊 대시보드 (관리자/코치 전용)
│   ├── 전체 현황 요약
│   ├── 과제별 진행률
│   ├── 주차별 코칭노트 현황
│   └── 코치별 활동 현황
│
├── ⚙️ 관리자 메뉴 (관리자 전용)
│   ├── 차수 관리
│   ├── 과제 관리
│   ├── 사용자 관리
│   ├── 코치 관리
│   ├── 권한 관리
│   ├── 프로그램 일정 관리
│   ├── 코칭 세션 배정
│   └── 공지 발송
│
└── 👤 내 정보
    ├── 프로필
    └── 알림 목록
```

### 6.2 주요 화면 와이어프레임

#### 6.2.1 과제 리스트 화면

```
┌─────────────────────────────────────────────────────────────────┐
│  [로고] SSP+ 코칭노트        [검색...]        [알림🔔] [프로필]  │
├─────────────────────────────────────────────────────────────────┤
│  📅스케줄 │ 📋과제리스트 │ 💬게시판 │ ℹ️SSP+소개 │ 📊대시보드    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📋 참여 과제 리스트                          [차수: 2026-1차 ▼]│
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 필터: [전체 조직 ▼] [전체 분류 ▼] [전체 상태 ▼]  [검색] │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ #  │ 과제명           │ 조직      │ 대표자 │ 분류  │진행률│   │
│  ├────┼──────────────────┼───────────┼────────┼───────┼─────┤   │
│  │ 1  │ 불량 예측 모델   │ 메모리사업│ 홍길동 │ 예측  │ 45% │   │
│  │ 2  │ 문서 자동 분류   │ 파운드리  │ 김철수 │ NLP   │ 30% │   │
│  │ 3  │ 설비 이상 탐지   │ PKG      │ 이영희 │ 이상탐지│ 60%│   │
│  │ ...│                  │           │        │       │     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│                        [1] [2] [3] ... [10]                     │
└─────────────────────────────────────────────────────────────────┘
```

#### 6.2.2 과제 상세 - 코칭노트 화면

```
┌─────────────────────────────────────────────────────────────────┐
│  [로고] SSP+ 코칭노트        [검색...]        [알림🔔] [프로필]  │
├─────────────────────────────────────────────────────────────────┤
│  ◀ 과제 리스트    │    불량 예측 모델 - 메모리사업부            │
├─────────────────────────────────────────────────────────────────┤
│         │                                                       │
│  사이드  │  [기본정보][코칭일정][Task][지원서][컨설팅][워크샵]   │
│  메뉴    │  [중간발표][최종발표][코칭노트]                       │
│         │  ════════════════════════════════════════════════════│
│ 📄기본정보│                                                      │
│ 📅코칭일정│  📓 코칭노트                    [+ 새 노트 작성]     │
│ ✅Task   │  ─────────────────────────────────────────────────── │
│ 📝지원서 │                                                       │
│ 📊컨설팅 │  ┌─ Week 3 (2026-03-15) ─────────────────────────┐   │
│ 🤝워크샵 │  │ 작성자: 김코치                                 │   │
│ 🎤중간   │  │                                                │   │
│ 🏆최종   │  │ 📍 현재 상태                                   │   │
│ 📓코칭노트│  │ 데이터 전처리 완료, 모델 학습 진행 중           │   │
│         │  │                                                │   │
│         │  │ ⚠️ 당면 문제                                    │   │
│         │  │ GPU 메모리 부족으로 배치 사이즈 조정 필요       │   │
│         │  │                                                │   │
│         │  │ ▶️ 다음 작업                                    │   │
│         │  │ 배치 사이즈 축소 후 재학습                      │   │
│         │  │                                                │   │
│         │  │ 💬 코칭 의견 (3)                    [의견 추가] │   │
│         │  │ ┌────────────────────────────────────────────┐│   │
│         │  │ │ 박코치: gradient_checkpointing 적용 권장   ││   │
│         │  │ │ [코드보기]                                 ││   │
│         │  │ └────────────────────────────────────────────┘│   │
│         │  └────────────────────────────────────────────────┘   │
│         │                                                       │
│         │  ┌─ Week 2 (2026-03-08) ─────────────────────────┐   │
│         │  │ ...                                           │   │
│         │  └────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

#### 6.2.3 과제 상세 - Task & 마일스톤 화면

```
┌─────────────────────────────────────────────────────────────────┐
│  ◀ 과제 리스트    │    불량 예측 모델 - 메모리사업부            │
├─────────────────────────────────────────────────────────────────┤
│         │                                                       │
│  사이드  │  [기본정보][코칭일정][Task][지원서]...[코칭노트]      │
│  메뉴    │  ════════════════════════════════════════════════════│
│         │                                                       │
│ 📄기본정보│  ✅ Task & 마일스톤                                  │
│ 📅코칭일정│  ─────────────────────────────────────────────────── │
│ ✅Task   │                                                       │
│ 📝지원서 │  ┌─────────────────────────────────────────────────┐ │
│ ...     │  │ 🎯 마일스톤 진행률                    2/5 (40%)  │ │
│         │  │ ████████░░░░░░░░░░░░                             │ │
│         │  │                                                   │ │
│         │  │ ✓ M1. 데이터 준비 완료         03/05 ✅ 완료     │ │
│         │  │ ✓ M2. 데이터 전처리 완료       03/12 ✅ 완료     │ │
│         │  │ ● M3. 1차 모델 학습 완료       03/19 🔄 진행중   │ │
│         │  │ ○ M4. 모델 최적화              03/26 ⏳ 예정     │ │
│         │  │ ○ M5. MVP 완성                 04/02 ⏳ 예정     │ │
│         │  │                                                   │ │
│         │  │                    [+ 마일스톤 추가] [순서 변경]  │ │
│         │  └─────────────────────────────────────────────────┘ │
│         │                                                       │
│         │  ┌─────────────────────────────────────────────────┐ │
│         │  │ 📋 Task 목록                        [+ Task 추가]│ │
│         │  │                                                   │ │
│         │  │ 필터: [전체 상태▼] [전체 담당자▼] [전체 우선순위▼]│ │
│         │  │                                                   │ │
│         │  │ ☐ 학습 데이터 레이블링                           │ │
│         │  │   🔴 높음 │ 홍길동 │ 마감: 03/18 │ ● 진행중      │ │
│         │  │                                                   │ │
│         │  │ ☐ 하이퍼파라미터 튜닝 실험                       │ │
│         │  │   🟡 보통 │ 이영희 │ 마감: 03/20 │ ○ 할일        │ │
│         │  │                                                   │ │
│         │  │ ☑ 모델 아키텍처 설계                             │ │
│         │  │   🔴 높음 │ 홍길동 │ 마감: 03/10 │ ✓ 완료        │ │
│         │  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

#### 6.2.4 통합 캘린더 화면 (월간)

```
┌─────────────────────────────────────────────────────────────────┐
│  📅 스케줄                                    [차수: 2026-1차 ▼]│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 필터:                                                    │   │
│  │ [전체 일정 유형 ▼] [전체 과제 ▼] [전체 코치 ▼]  [초기화] │   │
│  │                                                          │   │
│  │ 범례: 🟢프로그램  🔵코칭세션  🟠Task  🟣마일스톤         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [◀ 이전]     📅 2026년 3월              [다음 ▶]  [월간|주간] │
│                                                                 │
│  ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐                  │
│  │ 일  │ 월  │ 화  │ 수  │ 목  │ 금  │ 토  │                  │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤                  │
│  │ 16  │ 17  │ 18  │ 19  │ 20  │ 21  │ 22  │                  │
│  │     │     │🔵x3 │🔵x3 │🟢중간│     │     │                  │
│  │     │     │🟠x1 │🟣M3 │발표 │     │     │                  │
│  └─────┴─────┴─────┴─────┴─────┴─────┴─────┘                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 6.2.5 통합 캘린더 화면 (주간)

```
┌─────────────────────────────────────────────────────────────────┐
│  📅 스케줄 - 주간 뷰                          [차수: 2026-1차 ▼]│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [◀ 이전]   2026년 3월 3주차 (3/16 ~ 3/22)   [다음 ▶] [월간|주간]│
│                                                                 │
│  ┌──────┬────────┬────────┬────────┬────────┬────────┬────────┐│
│  │ 시간 │ 월(16) │ 화(17) │ 수(18) │ 목(19) │ 금(20) │ 토(21) ││
│  ├──────┼────────┼────────┼────────┼────────┼────────┼────────┤│
│  │09:00 │        │        │🔵불량  │🔵문서  │        │        ││
│  │      │        │        │  예측  │  자동  │🟢 중간 │        ││
│  │10:00 │        │        │🔵설비  │🔵챗봇  │   발표 │        ││
│  │      │        │        │  이상  │  PoC   │        │        ││
│  │11:00 │        │        │🔵데이터│🔵수율  │        │        ││
│  │      │        │        │  시각화│  분석  │        │        ││
│  │12:00 │        │        │        │        │        │        ││
│  │...   │        │        │        │        │        │        ││
│  └──────┴────────┴────────┴────────┴────────┴────────┴────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 6.2.6 대시보드 화면 (관리자/코치)

```
┌─────────────────────────────────────────────────────────────────┐
│  📊 대시보드                                  [차수: 2026-1차 ▼]│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────┐│
│  │ 전체 과제    │ │ 평균 진행률  │ │ 금주 코칭노트│ │활동 코치││
│  │     30      │ │    42%      │ │     28      │ │    8   ││
│  └──────────────┘ └──────────────┘ └──────────────┘ └─────────┘│
│                                                                 │
│  ┌─────────────────────────────┐ ┌─────────────────────────────┐│
│  │ 📈 주차별 코칭노트 작성 현황 │ │ 📊 과제별 진행률 분포        ││
│  │                             │ │                             ││
│  │    ■■■                      │ │  0-20%  ████  4과제         ││
│  │    ■■■■■                    │ │ 21-40%  ██████████ 12과제   ││
│  │    ■■■■■■■                  │ │ 41-60%  ████████  10과제    ││
│  │  W1  W2  W3  W4  W5        │ │ 61-80%  ████  4과제         ││
│  └─────────────────────────────┘ └─────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ ⚠️ 주의 필요 과제 (진행률 낮음 또는 코칭 기록 없음)          ││
│  │ ┌────┬──────────────────┬──────────┬─────────┬───────────┐ ││
│  │ │ #  │ 과제명           │ 진행률   │ 최근코칭│ 상태      │ ││
│  │ ├────┼──────────────────┼──────────┼─────────┼───────────┤ ││
│  │ │ 7  │ 챗봇 PoC         │ 15%      │ 2주 전  │ ⚠️ 지연   │ ││
│  │ │ 12 │ 데이터 시각화    │ 10%      │ 없음    │ 🔴 위험   │ ││
│  │ └────┴──────────────────┴──────────┴─────────┴───────────┘ ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

#### 6.2.7 관리자 - 코칭 세션 일괄 배정 화면

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚙️ 관리자 > 코칭 세션 배정                   [차수: 2026-1차 ▼]│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📅 코칭 일자 선택: [2026-03-18 ▼]     📍 장소: [교육장 B    ] │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │      시간대 배정표                              [+ 행 추가]│   │
│  ├──────┬─────────────────┬─────────────────┬──────────────┤   │
│  │ 시간 │ 과제            │ 담당 코치       │ 메모         │   │
│  ├──────┼─────────────────┼─────────────────┼──────────────┤   │
│  │09:00 │[불량 예측 모델▼]│[김코치 ☑][박☑] │[데이터 리뷰 ]│   │
│  │~10:00│                 │[이코치 ☐][최☐] │              │   │
│  ├──────┼─────────────────┼─────────────────┼──────────────┤   │
│  │10:00 │[설비 이상 탐지▼]│[김코치 ☐][박☑] │[           ]│   │
│  │~11:00│                 │[이코치 ☑][최☐] │              │   │
│  └──────┴─────────────────┴─────────────────┴──────────────┘   │
│                                                                 │
│  ⚠️ 중복 확인: 김코치 - 09:00~10:00, 11:00~12:00 배정됨        │
│                                                                 │
│                              [미리보기]  [일괄 저장]  [취소]    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. 프로젝트 구조

### 7.1 디렉토리 구조

```
ssp-coaching/
│
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI 앱 진입점
│   │   ├── config.py               # 설정 관리
│   │   ├── database.py             # DB 연결 설정
│   │   │
│   │   ├── models/                 # SQLAlchemy 모델
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── batch.py
│   │   │   ├── project.py
│   │   │   ├── coaching_note.py
│   │   │   ├── document.py
│   │   │   ├── schedule.py
│   │   │   ├── coaching_session.py
│   │   │   ├── task.py
│   │   │   ├── board.py
│   │   │   ├── coach.py
│   │   │   └── notification.py
│   │   │
│   │   ├── schemas/                # Pydantic 스키마
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── batch.py
│   │   │   ├── project.py
│   │   │   ├── coaching_note.py
│   │   │   ├── document.py
│   │   │   ├── schedule.py
│   │   │   ├── coaching_session.py
│   │   │   ├── task.py
│   │   │   ├── calendar.py
│   │   │   ├── board.py
│   │   │   ├── coach.py
│   │   │   └── notification.py
│   │   │
│   │   ├── routers/                # API 라우터
│   │   │   ├── __init__.py
│   │   │   ├── auth.py
│   │   │   ├── batches.py
│   │   │   ├── projects.py
│   │   │   ├── coaching_notes.py
│   │   │   ├── documents.py
│   │   │   ├── schedules.py
│   │   │   ├── sessions.py
│   │   │   ├── tasks.py
│   │   │   ├── calendar.py
│   │   │   ├── boards.py
│   │   │   ├── coaches.py
│   │   │   ├── notifications.py
│   │   │   ├── dashboard.py
│   │   │   ├── search.py
│   │   │   ├── admin.py
│   │   │   └── upload.py
│   │   │
│   │   ├── services/               # 비즈니스 로직
│   │   │   ├── __init__.py
│   │   │   ├── auth_service.py
│   │   │   ├── project_service.py
│   │   │   ├── coaching_service.py
│   │   │   ├── schedule_service.py
│   │   │   ├── task_service.py
│   │   │   ├── notification_service.py
│   │   │   └── ai_service.py
│   │   │
│   │   ├── middleware/             # 미들웨어
│   │   │   ├── __init__.py
│   │   │   └── auth_middleware.py
│   │   │
│   │   └── utils/                  # 유틸리티
│   │       ├── __init__.py
│   │       ├── permissions.py
│   │       └── helpers.py
│   │
│   ├── tests/                      # 테스트
│   │   ├── __init__.py
│   │   ├── test_auth.py
│   │   ├── test_projects.py
│   │   └── test_coaching_notes.py
│   │
│   ├── alembic/                    # DB 마이그레이션
│   │   ├── versions/
│   │   └── env.py
│   │
│   ├── requirements.txt
│   ├── alembic.ini
│   └── .env.example
│
├── frontend/
│   ├── index.html
│   │
│   ├── css/
│   │   ├── style.css               # 공통 스타일
│   │   ├── components.css          # 컴포넌트 스타일
│   │   ├── calendar.css            # 캘린더 스타일
│   │   └── dashboard.css           # 대시보드 스타일
│   │
│   ├── js/
│   │   ├── app.js                  # 메인 앱
│   │   ├── router.js               # SPA 라우팅
│   │   ├── api.js                  # API 호출
│   │   ├── auth.js                 # 인증 관리
│   │   ├── state.js                # 상태 관리
│   │   │
│   │   ├── pages/                  # 페이지별 JS
│   │   │   ├── home.js
│   │   │   ├── projectList.js
│   │   │   ├── projectDetail.js
│   │   │   ├── coachingNote.js
│   │   │   ├── taskList.js
│   │   │   ├── calendar.js
│   │   │   ├── board.js
│   │   │   ├── dashboard.js
│   │   │   ├── admin.js
│   │   │   ├── sessionManage.js
│   │   │   └── introduction.js
│   │   │
│   │   ├── components/             # 재사용 컴포넌트
│   │   │   ├── header.js
│   │   │   ├── sidebar.js
│   │   │   ├── modal.js
│   │   │   ├── notification.js
│   │   │   ├── pagination.js
│   │   │   ├── calendarView.js
│   │   │   ├── sessionCard.js
│   │   │   └── taskItem.js
│   │   │
│   │   └── utils/                  # 유틸리티
│   │       ├── formatter.js
│   │       └── validator.js
│   │
│   └── assets/
│       └── images/
│
├── uploads/                        # 업로드 파일 저장
│   ├── documents/
│   ├── images/
│   └── attachments/
│
├── docs/                           # 문서
│   ├── api-spec.md
│   ├── database-schema.md
│   └── user-guide.md
│
├── scripts/                        # 스크립트
│   ├── init_db.py
│   ├── seed_data.py
│   └── backup.sh
│
├── .gitignore
├── docker-compose.yml              # (추후)
└── README.md
```

---

## 8. 핵심 코드 구현

### 8.1 Backend

#### 8.1.1 FastAPI 메인 앱 (`main.py`)

```python
# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import engine, Base
from app.routers import (
    auth, batches, projects, coaching_notes, documents,
    schedules, sessions, tasks, calendar,
    boards, coaches, notifications,
    dashboard, search, admin, upload
)

# DB 테이블 생성
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="SSP+ 코칭노트 관리 시스템",
    description="AI활용 과제 코칭 프로그램 관리 시스템",
    version="1.0.0"
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(auth.router, prefix="/api/auth", tags=["인증"])
app.include_router(batches.router, prefix="/api/batches", tags=["차수"])
app.include_router(projects.router, prefix="/api/projects", tags=["과제"])
app.include_router(coaching_notes.router, prefix="/api", tags=["코칭노트"])
app.include_router(documents.router, prefix="/api", tags=["문서"])
app.include_router(schedules.router, prefix="/api", tags=["프로그램일정"])
app.include_router(sessions.router, prefix="/api", tags=["코칭세션"])
app.include_router(tasks.router, prefix="/api", tags=["Task"])
app.include_router(calendar.router, prefix="/api/calendar", tags=["캘린더"])
app.include_router(boards.router, prefix="/api", tags=["게시판"])
app.include_router(coaches.router, prefix="/api/coaches", tags=["코치"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["알림"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["대시보드"])
app.include_router(search.router, prefix="/api/search", tags=["검색"])
app.include_router(admin.router, prefix="/api/admin", tags=["관리자"])
app.include_router(upload.router, prefix="/api/upload", tags=["파일업로드"])

# 정적 파일 (업로드)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/api/health")
def health_check():
    return {"status": "healthy", "version": "1.0.0"}
```

#### 8.1.2 데이터베이스 설정 (`database.py`)

```python
# backend/app/database.py
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from app.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

#### 8.1.3 설정 (`config.py`)

```python
# backend/app/config.py
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # 앱 설정
    APP_NAME: str = "SSP+ 코칭노트 관리 시스템"
    DEBUG: bool = True
    
    # 데이터베이스
    DATABASE_URL: str = "sqlite:///./ssp_coaching.db"
    
    # 인증
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24시간
    
    # CORS
    ALLOWED_ORIGINS: List[str] = ["*"]
    
    # 파일 업로드
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE: int = 50 * 1024 * 1024  # 50MB
    ALLOWED_EXTENSIONS: List[str] = [".jpg", ".jpeg", ".png", ".gif", ".pdf", ".ppt", ".pptx", ".xls", ".xlsx", ".csv"]

    class Config:
        env_file = ".env"


settings = Settings()
```

#### 8.1.4 코칭노트 모델 (`models/coaching_note.py`)

```python
# backend/app/models/coaching_note.py
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class CoachingNote(Base):
    __tablename__ = "coaching_notes"

    note_id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.project_id"), nullable=False)
    author_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    coaching_date = Column(Date, nullable=False)
    week_number = Column(Integer)
    current_status = Column(Text)
    progress_rate = Column(Integer, default=0)
    main_issue = Column(Text)
    next_action = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    # Relationships
    project = relationship("Project", back_populates="coaching_notes")
    author = relationship("User", back_populates="authored_notes")
    comments = relationship("CoachingComment", back_populates="note", cascade="all, delete-orphan")


class CoachingComment(Base):
    __tablename__ = "coaching_comments"

    comment_id = Column(Integer, primary_key=True, index=True)
    note_id = Column(Integer, ForeignKey("coaching_notes.note_id", ondelete="CASCADE"), nullable=False)
    author_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    content = Column(Text, nullable=False)
    code_snippet = Column(Text)
    is_coach_only = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    note = relationship("CoachingNote", back_populates="comments")
    author = relationship("User", back_populates="coaching_comments")
```

#### 8.1.5 Task 모델 (`models/task.py`)

```python
# backend/app/models/task.py
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class ProjectTask(Base):
    __tablename__ = "project_tasks"

    task_id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.project_id"), nullable=False)
    assigned_to = Column(Integer, ForeignKey("users.user_id"))
    title = Column(String(200), nullable=False)
    description = Column(Text)
    due_date = Column(Date)
    priority = Column(String(10), default="medium")
    status = Column(String(20), default="todo")
    is_milestone = Column(Boolean, default=False)
    milestone_order = Column(Integer)
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    completed_at = Column(DateTime)

    # Relationships
    project = relationship("Project", back_populates="tasks")
    assignee = relationship("User", foreign_keys=[assigned_to])
    creator = relationship("User", foreign_keys=[created_by])
```

#### 8.1.6 코칭노트 라우터 (`routers/coaching_notes.py`)

```python
# backend/app/routers/coaching_notes.py
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.coaching_note import (
    CoachingNoteCreate, CoachingNoteUpdate, CoachingNoteResponse,
    CoachingCommentCreate, CoachingCommentResponse
)
from app.services.coaching_service import CoachingService
from app.middleware.auth_middleware import get_current_user, require_roles
from app.models.user import User

router = APIRouter()


@router.get("/projects/{project_id}/notes", response_model=List[CoachingNoteResponse])
def get_project_notes(
    project_id: int,
    week: Optional[int] = Query(None, description="주차 필터"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """과제별 코칭노트 목록 조회"""
    service = CoachingService(db)
    
    if not service.can_view_project(current_user, project_id):
        raise HTTPException(status_code=403, detail="접근 권한이 없습니다")
    
    return service.get_notes_by_project(project_id, week, current_user)


@router.get("/notes/{note_id}", response_model=CoachingNoteResponse)
def get_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """코칭노트 상세 조회"""
    service = CoachingService(db)
    note = service.get_note(note_id, current_user)
    
    if not note:
        raise HTTPException(status_code=404, detail="코칭노트를 찾을 수 없습니다")
    
    return note


@router.post("/projects/{project_id}/notes", response_model=CoachingNoteResponse, status_code=201)
def create_note(
    project_id: int,
    note_data: CoachingNoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """코칭노트 작성 (코치/관리자만)"""
    if current_user.role not in ["admin", "coach"]:
        raise HTTPException(status_code=403, detail="코칭노트 작성 권한이 없습니다")
    
    service = CoachingService(db)
    return service.create_note(project_id, note_data, current_user)


@router.put("/notes/{note_id}", response_model=CoachingNoteResponse)
def update_note(
    note_id: int,
    note_data: CoachingNoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """코칭노트 수정"""
    service = CoachingService(db)
    note = service.update_note(note_id, note_data, current_user)
    
    if not note:
        raise HTTPException(status_code=404, detail="코칭노트를 찾을 수 없습니다")
    
    return note


@router.delete("/notes/{note_id}", status_code=204)
def delete_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """코칭노트 삭제"""
    service = CoachingService(db)
    if not service.delete_note(note_id, current_user):
        raise HTTPException(status_code=404, detail="코칭노트를 찾을 수 없습니다")


@router.post("/notes/{note_id}/comments", response_model=CoachingCommentResponse, status_code=201)
def add_comment(
    note_id: int,
    comment_data: CoachingCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """코칭 의견 추가"""
    if comment_data.is_coach_only and current_user.role not in ["admin", "coach"]:
        raise HTTPException(status_code=403, detail="코치 전용 의견은 코치만 작성할 수 있습니다")
    
    service = CoachingService(db)
    return service.add_comment(note_id, comment_data, current_user)


@router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """코칭 의견 삭제"""
    service = CoachingService(db)
    if not service.delete_comment(comment_id, current_user):
        raise HTTPException(status_code=404, detail="의견을 찾을 수 없습니다")
```

#### 8.1.7 Task 서비스 (`services/task_service.py`)

```python
# backend/app/services/task_service.py
from datetime import datetime
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.models.task import ProjectTask
from app.models.project import Project, ProjectMember
from app.models.user import User
from app.schemas.task import TaskCreate, TaskUpdate, TaskListResponse


class TaskService:
    def __init__(self, db: Session):
        self.db = db

    def get_tasks_by_project(
        self,
        project_id: int,
        status: Optional[str] = None,
        include_milestones: bool = True
    ) -> TaskListResponse:
        """과제별 Task 및 마일스톤 조회"""
        query = self.db.query(ProjectTask).filter(
            ProjectTask.project_id == project_id,
            ProjectTask.status != "cancelled"
        )
        
        if status:
            query = query.filter(ProjectTask.status == status)
        
        all_tasks = query.order_by(ProjectTask.due_date, ProjectTask.created_at).all()
        
        # 마일스톤과 일반 Task 분리
        milestones = sorted(
            [t for t in all_tasks if t.is_milestone],
            key=lambda x: x.milestone_order or 999
        )
        tasks = [t for t in all_tasks if not t.is_milestone]
        
        # 마일스톤 진행률 계산
        milestone_progress = self._calculate_milestone_progress(milestones)
        
        return TaskListResponse(
            tasks=tasks,
            milestones=milestones if include_milestones else [],
            total=len(all_tasks),
            milestone_progress=milestone_progress
        )

    def _calculate_milestone_progress(self, milestones: List[ProjectTask]) -> dict:
        """마일스톤 기반 진행률 계산"""
        if not milestones:
            return {"total": 0, "completed": 0, "percentage": 0, "current_milestone": None}
        
        total = len(milestones)
        completed = len([m for m in milestones if m.status == "completed"])
        
        current = next((m for m in milestones if m.status in ["todo", "in_progress"]), None)
        
        return {
            "total": total,
            "completed": completed,
            "percentage": round((completed / total) * 100) if total > 0 else 0,
            "current_milestone": {
                "task_id": current.task_id,
                "title": current.title,
                "status": current.status,
                "due_date": current.due_date.isoformat() if current.due_date else None
            } if current else None
        }

    def create_task(self, project_id: int, task_data: TaskCreate, user: User) -> ProjectTask:
        """Task/마일스톤 생성"""
        # 마일스톤인 경우 순서 자동 부여
        milestone_order = None
        if task_data.is_milestone:
            milestone_order = task_data.milestone_order or self._get_next_milestone_order(project_id)
        
        task = ProjectTask(
            project_id=project_id,
            title=task_data.title,
            description=task_data.description,
            due_date=task_data.due_date,
            priority=task_data.priority,
            assigned_to=task_data.assigned_to,
            is_milestone=task_data.is_milestone,
            milestone_order=milestone_order,
            created_by=user.user_id
        )
        
        self.db.add(task)
        self.db.commit()
        self.db.refresh(task)
        
        # 마일스톤 생성 시 과제 진행률 업데이트
        if task.is_milestone:
            self._update_project_progress(project_id)
        
        return task

    def update_task_status(self, task_id: int, status: str, user: User) -> Optional[ProjectTask]:
        """Task 상태 변경"""
        task = self.db.query(ProjectTask).filter(ProjectTask.task_id == task_id).first()
        if not task:
            return None
        
        task.status = status
        task.updated_at = datetime.now()
        
        if status == "completed":
            task.completed_at = datetime.now()
        
        self.db.commit()
        
        # 마일스톤인 경우 과제 진행률 업데이트
        if task.is_milestone:
            self._update_project_progress(task.project_id)
        
        return task

    def _get_next_milestone_order(self, project_id: int) -> int:
        """다음 마일스톤 순서"""
        count = self.db.query(ProjectTask).filter(
            ProjectTask.project_id == project_id,
            ProjectTask.is_milestone == True
        ).count()
        return count + 1

    def _update_project_progress(self, project_id: int):
        """마일스톤 기반 과제 진행률 자동 업데이트"""
        milestones = self.db.query(ProjectTask).filter(
            ProjectTask.project_id == project_id,
            ProjectTask.is_milestone == True,
            ProjectTask.status != "cancelled"
        ).all()
        
        if not milestones:
            return
        
        completed = len([m for m in milestones if m.status == "completed"])
        total = len(milestones)
        progress = round((completed / total) * 100)
        
        self.db.query(Project).filter(
            Project.project_id == project_id
        ).update({"progress_rate": progress})
        
        self.db.commit()
```

---

### 8.2 Frontend

#### 8.2.1 API 클라이언트 (`api.js`)

```javascript
// frontend/js/api.js
const API_BASE = '/api';

class ApiClient {
    constructor() {
        this.token = localStorage.getItem('auth_token');
    }

    setToken(token) {
        this.token = token;
        localStorage.setItem('auth_token', token);
    }

    clearToken() {
        this.token = null;
        localStorage.removeItem('auth_token');
    }

    async request(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...(this.token && { 'Authorization': `Bearer ${this.token}` }),
            ...options.headers
        };

        try {
            const response = await fetch(url, { ...options, headers });

            if (response.status === 401) {
                this.clearToken();
                window.location.href = '/login';
                return;
            }

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || '요청 처리 중 오류가 발생했습니다');
            }

            if (response.status === 204) return null;
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    get(endpoint, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = queryString ? `${endpoint}?${queryString}` : endpoint;
        return this.request(url, { method: 'GET' });
    }

    post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    put(endpoint, data) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    async upload(endpoint, formData) {
        const url = `${API_BASE}${endpoint}`;
        const headers = this.token ? { 'Authorization': `Bearer ${this.token}` } : {};

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '파일 업로드 실패');
        }

        return await response.json();
    }
}

// API 인스턴스
const api = new ApiClient();

// 도메인별 API
const coachingNoteApi = {
    getByProject: (projectId, params = {}) => api.get(`/projects/${projectId}/notes`, params),
    get: (noteId) => api.get(`/notes/${noteId}`),
    create: (projectId, data) => api.post(`/projects/${projectId}/notes`, data),
    update: (noteId, data) => api.put(`/notes/${noteId}`, data),
    delete: (noteId) => api.delete(`/notes/${noteId}`),
    addComment: (noteId, data) => api.post(`/notes/${noteId}/comments`, data),
    deleteComment: (commentId) => api.delete(`/comments/${commentId}`)
};

const projectApi = {
    getByBatch: (batchId, params = {}) => api.get(`/batches/${batchId}/projects`, params),
    get: (projectId) => api.get(`/projects/${projectId}`),
    create: (batchId, data) => api.post(`/batches/${batchId}/projects`, data),
    update: (projectId, data) => api.put(`/projects/${projectId}`, data)
};

const taskApi = {
    getByProject: (projectId, params = {}) => api.get(`/projects/${projectId}/tasks`, params),
    getMilestones: (projectId) => api.get(`/projects/${projectId}/milestones`),
    create: (projectId, data) => api.post(`/projects/${projectId}/tasks`, data),
    update: (taskId, data) => api.put(`/tasks/${taskId}`, data),
    updateStatus: (taskId, status) => api.put(`/tasks/${taskId}/status`, { status }),
    delete: (taskId) => api.delete(`/tasks/${taskId}`),
    reorderMilestones: (projectId, ids) => api.put(`/projects/${projectId}/milestones/reorder`, { milestone_ids: ids })
};

const calendarApi = {
    getEvents: (params) => api.get('/calendar', params)
};

const dashboardApi = {
    getOverview: (batchId) => api.get('/dashboard/overview', { batch_id: batchId }),
    getCoachingStats: (batchId) => api.get('/dashboard/coaching-stats', { batch_id: batchId })
};

export { api, coachingNoteApi, projectApi, taskApi, calendarApi, dashboardApi };
```

#### 8.2.2 유틸리티 - 포맷터 (`utils/formatter.js`)

```javascript
// frontend/js/utils/formatter.js

export function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatDateTime(dateTimeString) {
    if (!dateTimeString) return '-';
    const date = new Date(dateTimeString);
    return `${formatDate(dateTimeString)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatTime(dateTimeString) {
    if (!dateTimeString) return '-';
    const date = new Date(dateTimeString);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function truncate(text, maxLength = 100) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}
```

---

## 9. 개발 일정 및 MVP 범위

### 9.1 MVP 기능 범위

#### Phase 1: 핵심 기능 (1~2주차)

| 우선순위 | 기능 | 상세 |
|:--------:|------|------|
| P0 | 사용자 인증 | SSO 연동 (초기: 토큰 기반) |
| P0 | 과제 리스트 | 차수별 과제 목록, 필터, 검색 |
| P0 | 과제 기본 정보 | 과제 상세 정보 조회/수정 |
| P0 | 코칭노트 CRUD | 작성, 조회, 수정, 삭제 |
| P0 | 코칭 의견 | 의견 추가, 코치전용 플래그 |

#### Phase 2: 확장 기능 (3주차)

| 우선순위 | 기능 | 상세 |
|:--------:|------|------|
| P1 | 통합 캘린더 | 월간/주간 뷰, 필터링 |
| P1 | 코칭 세션 관리 | 세션 조회, 일괄 배정 |
| P1 | Task/마일스톤 | Task CRUD, 마일스톤 진행률 |
| P1 | 소통 게시판 | 게시글 CRUD, 댓글, 공지 |
| P1 | 파일 첨부 | 이미지, PPT, PDF 업로드 |

#### Phase 3: 관리 기능 (4주차)

| 우선순위 | 기능 | 상세 |
|:--------:|------|------|
| P2 | 프로그램 일정 관리 | 마일스톤 등록/수정 |
| P2 | 대시보드 | 진행률, 코칭현황 시각화 |
| P2 | 관리자 메뉴 | 사용자/과제/차수 관리 |
| P2 | 과제 문서 | 지원서, 발표자료 관리 |
| P2 | SSP+ 소개 | 과정/코치 소개 페이지 |

#### 추후 개발 (Backlog)

| 기능 | 상세 |
|------|------|
| AI 요약 | 코칭노트 자동 요약, Q&A Set 생성 |
| 자연어 검색 | AI 기반 시맨틱 검색 |
| 패턴 분석 | 코칭 패턴 인사이트 |
| 감사 로그 | 활동 이력 추적 |
| 데이터 내보내기 | Excel, PDF 출력 |
| 시스템 연동 | HR, 메신저 연동 |

### 9.2 개발 일정 (4주)

```
Week 1: 기반 구축 + 핵심 기능 시작
├── Day 1-2: 프로젝트 셋업, DB 스키마 구현
├── Day 3-4: 인증 기본 구조, 사용자 모델
└── Day 5: 과제 리스트 API + 화면

Week 2: 핵심 기능 완성
├── Day 1-2: 코칭노트 CRUD API
├── Day 3-4: 코칭노트 화면, 코칭 의견 기능
└── Day 5: 과제 상세 화면 완성, 권한 체크

Week 3: 확장 기능
├── Day 1-2: 캘린더 API + 화면
├── Day 3: 코칭 세션 관리
├── Day 4: Task/마일스톤 기능
└── Day 5: 소통 게시판, 파일 업로드

Week 4: 관리 기능 + 마무리
├── Day 1-2: 대시보드
├── Day 3: 관리자 메뉴
├── Day 4: SSP+ 소개, 프로그램 일정
└── Day 5: 테스트, 버그 수정, 배포
```

### 9.3 리스크 및 대응 방안

| 리스크 | 영향도 | 대응 방안 |
|--------|:------:|----------|
| **일정 지연** | 높음 | MVP 범위 엄격 관리, 추후 개발 항목 명확 분리 |
| SSO 연동 지연 | 중간 | 초기 단순 토큰 인증, SSO는 별도 모듈화 |
| 사용자 적응 실패 | 중간 | 단순한 UI, 사용자 교육 자료 준비 |
| 데이터 파편화 | 중간 | 코칭노트 템플릿 강제화, 입력 가이드 |
| 성능 이슈 | 낮음 | 50명 동시접속 기준, 인덱싱 최적화 |

---

## 10. 용어 정의

| 용어 | 정의 |
|------|------|
| **SSP+** | AI활용 과제 코칭 프로그램명 |
| **차수(Batch)** | 프로그램 회차 (예: 2026년 1차, 2026년 2차) |
| **과제(Project)** | 코칭 대상이 되는 AI 활용 과제 |
| **코칭노트** | 코칭 세션 후 작성하는 구조화된 기록 |
| **코칭 의견** | 코칭노트에 추가되는 피드백, 코드 등 |
| **코치 전용 의견** | 공동 코치들만 볼 수 있는 비공개 의견 |
| **마일스톤** | 과제의 주요 단계/목표 (Task 중 `is_milestone=true`) |
| **Task** | 과제 수행을 위한 세부 할일 |
| **코칭 세션** | 코치-과제 간 예약된 코칭 시간 |
| **프로그램 일정** | 차수 전체 공통 일정 (OT, 워크샵, 발표 등) |
| **피코칭자** | 코칭을 받는 과제 참여자 |
| **참관자** | 직접 참여하지 않으나 열람 권한이 있는 사용자 |

---

## 부록

### A. 환경 변수 예시 (`.env.example`)

```env
# App
APP_NAME=SSP+ 코칭노트 관리 시스템
DEBUG=True

# Database
DATABASE_URL=sqlite:///./ssp_coaching.db
# DATABASE_URL=postgresql://user:password@localhost/ssp_coaching

# Auth
SECRET_KEY=your-secret-key-change-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# CORS
ALLOWED_ORIGINS=["http://localhost:8000", "http://localhost:3000"]

# Upload
UPLOAD_DIR=uploads
MAX_UPLOAD_SIZE=52428800
```

### B. 의존성 패키지 (`requirements.txt`)

```
fastapi==0.109.0
uvicorn[standard]==0.27.0
sqlalchemy==2.0.25
pydantic==2.5.3
pydantic-settings==2.1.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.6
aiofiles==23.2.1
```

### C. 실행 방법

```bash
# 1. 가상환경 생성 및 활성화
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 2. 의존성 설치
cd backend
pip install -r requirements.txt

# 3. 환경 변수 설정
cp .env.example .env
# .env 파일 수정

# 4. 데이터베이스 초기화
python scripts/init_db.py

# 5. 서버 실행
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 6. 브라우저에서 접속
# http://localhost:8000
```