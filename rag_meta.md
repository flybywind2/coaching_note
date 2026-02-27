# RAG Metadata Guide

## 목적
- `doc_id`가 동일하면 RAG가 기존 문서를 덮어쓴다는 전제에 맞춰, 게시글/코칭노트의 본문 변경과 댓글 변경을 **같은 문서 ID**로 재입력합니다.
- 댓글 생성/수정/삭제가 발생하면 본문+댓글을 합친 content를 다시 upsert 합니다.

## 문서 ID 규칙
- 게시글: `board_post:{post_id}`
- 코칭노트: `coaching_note:{note_id}`

## 동기화 트리거(event_type)
- 게시글: `create`, `update`, `restore`, `comment_create`, `comment_update`, `comment_delete`
- 코칭노트: `create`, `update`, `restore`, `comment_create`, `comment_delete`

## additional_field 메타데이터

### 1) board_post.v2
공통 필드:
- `source_type`: `board_post`
- `event_type`: 동기화 이벤트 타입
- `doc_schema`: `board_post.v2`
- `post_id`, `board_id`, `board_type`, `board_name`
- `batch_id`, `batch_name`
- `author_id`
- `comment_count`: 댓글 수
- `last_comment_at`: 마지막 댓글 시각(ISO)
- `updated_at`: 게시글 최신 시각(ISO)
- `ai_summary`: content 기반 AI 요약

예시:
```json
{
  "source_type": "board_post",
  "event_type": "comment_create",
  "doc_schema": "board_post.v2",
  "post_id": 12,
  "board_id": 3,
  "board_type": "tip",
  "board_name": "팁공유",
  "batch_id": 2,
  "batch_name": "2026년 2차",
  "author_id": 7,
  "comment_count": 3,
  "last_comment_at": "2026-02-27T15:10:00+00:00",
  "updated_at": "2026-02-27T15:12:00+00:00",
  "ai_summary": "..."
}
```

### 2) coaching_note.v2
공통 필드:
- `source_type`: `coaching_note`
- `event_type`: 동기화 이벤트 타입
- `doc_schema`: `coaching_note.v2`
- `note_id`, `project_id`, `project_name`
- `batch_id`, `batch_name`
- `week_number`, `coaching_date`
- `author_id`
- `public_comment_count`: 공개 댓글 수
- `coach_only_comment_count`: 코치전용 댓글 수(본문에는 미포함)
- `last_public_comment_at`: 마지막 공개 댓글 시각(ISO)
- `updated_at`: 코칭노트 최신 시각(ISO)
- `ai_summary`: content 기반 AI 요약

예시:
```json
{
  "source_type": "coaching_note",
  "event_type": "update",
  "doc_schema": "coaching_note.v2",
  "note_id": 21,
  "project_id": 5,
  "project_name": "A 프로젝트",
  "batch_id": 1,
  "batch_name": "2026년 1차",
  "week_number": 4,
  "coaching_date": "2026-02-25",
  "author_id": 3,
  "public_comment_count": 2,
  "coach_only_comment_count": 1,
  "last_public_comment_at": "2026-02-27T10:20:00+00:00",
  "updated_at": "2026-02-27T10:21:00+00:00",
  "ai_summary": "..."
}
```

## content 구성 원칙
- 게시글: `제목 + 본문 + 댓글 목록`을 하나의 텍스트로 구성
- 코칭노트: `핵심 필드 + 공개댓글 목록`을 하나의 텍스트로 구성
- 코칭노트의 `is_coach_only=true` 댓글은 content에 넣지 않습니다.
