# RAG Metadata Guide

## 목적
- `doc_id`가 동일하면 RAG가 기존 문서를 덮어쓴다는 전제에 맞춰, 게시글/코칭노트의 본문 변경과 댓글 변경을 **같은 문서 ID**로 재입력합니다.
- 댓글 생성/수정/삭제가 발생하면 본문+댓글을 합친 content를 다시 upsert 합니다.

## 챗봇 응답 경로
- 기본: RAG 기반 답변
- 관리자 질문: LLM이 `{"route":"sql|rag","reason":"..."}` JSON으로 SQL/RAG 경로를 결정
- 비관리자 질문: RAG 경로 고정
- SQL 경로는 `SELECT/ WITH` 조회문만 허용하며, 안전성 검사 실패 시 RAG로 폴백합니다.

## 문서 ID 규칙
- 게시글: `board_post:{post_id}`
- 코칭노트: `coaching_note:{note_id}`

## 동기화 트리거(event_type)
- 게시글: `create`, `update`, `restore`, `comment_create`, `comment_update`, `comment_delete`
- 코칭노트: `create`, `update`, `restore`, `comment_create`, `comment_delete`

## RAG data 메타데이터(Top-level)

- insert 시 메타데이터는 `data.additional_field`에 넣지 않고, `data.doc_id`, `data.content`와 동일 레벨에 넣습니다.
- `ai_summary`도 동일하게 `data.ai_summary`에 저장합니다.

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
- `image_urls`: 문서에서 추출한 이미지 URL 목록
- `image_descriptions`: 이미지 URL + 한국어 설명 목록

예시(`data` 하위):
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
  "image_urls": ["/uploads/editor_images/boards/3/board_post/sample.png"],
  "image_descriptions": [
    {
      "url": "/uploads/editor_images/boards/3/board_post/sample.png",
      "caption": "대시보드 화면에서 진행률이 표시된 이미지입니다."
    }
  ],
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
- `image_urls`: 문서에서 추출한 이미지 URL 목록
- `image_descriptions`: 이미지 URL + 한국어 설명 목록

예시(`data` 하위):
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
  "image_urls": ["/uploads/editor_images/projects/5/note/sample.jpg"],
  "image_descriptions": [
    {
      "url": "/uploads/editor_images/projects/5/note/sample.jpg",
      "caption": "프로세스 다이어그램이 포함된 코칭노트 이미지입니다."
    }
  ],
  "ai_summary": "..."
}
```

# image인식 llm
```python
def get_image_base64(file_path):
  with open(file_path, "rb") as reader:
    image_bytes = reader.read()
    base64_bytes = base64.b64encode(image_bytes)
    base64_string = base64_bytes.decode("utf-8")
    return base64_string

image_base64 = get_image_base64("./data/sample.jpg") #이미지파일 경로 기입

human_message = HumanMessage(
    content=[
      {"type" : "text", "text" : "이미지를 상세히 한글로 설명해주세요."},
      {"type" : "image", "image" : {"url" : f"data:image/jpeg;base64,{image_base64}"}}
    ]
)
```

## 이미지 인식 LLM 환경변수
- `AI_IMAGE_MODEL_BASE_URL`: 이미지 인식 모델 전용 Base URL
- `AI_IMAGE_MODEL_NAME`: 이미지 인식 모델명
- `AI_IMAGE_MODEL_PROMPT`: 이미지 설명 프롬프트(기본: `이미지를 상세히 한글로 설명해주세요.`)
- `AI_IMAGE_MODEL_MAX_IMAGES`: 문서당 이미지 설명 생성 최대 개수

## content 구성 원칙
- 게시글: `제목 + 본문 + 댓글 목록`을 하나의 텍스트로 구성
- 코칭노트: `핵심 필드 + 공개댓글 목록`을 하나의 텍스트로 구성
- 코칭노트의 `is_coach_only=true` 댓글은 content에 넣지 않습니다.
- 이미지가 있으면 `이미지설명(n)` 블록을 content에 추가해 RAG 문맥에 함께 저장합니다.
