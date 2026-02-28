# RAG Metadata Guide

## 목적
- `doc_id`가 동일하면 RAG가 기존 문서를 덮어쓴다는 전제에 맞춰, 게시글/코칭노트/과제기록 변경을 같은 문서 ID로 재입력합니다.
- 댓글 생성/수정/삭제가 발생하면 본문+댓글을 합친 content를 다시 upsert 합니다.
- RAG 입력 시 LLM이 요약과 엔티티/관계를 함께 추출하여 graph-rag 형태 메타데이터를 저장합니다.

## 챗봇 응답 경로
- 기본: RAG 기반 답변
- 관리자 질문: LLM이 `{"route":"sql|rag","reason":"..."}` JSON으로 SQL/RAG 경로를 결정
- 비관리자 질문: RAG 경로 고정
- SQL 경로는 `SELECT/WITH` 조회문만 허용하며, 안전성 검사 실패 시 RAG로 폴백합니다.

## 문서 ID 규칙
- 게시글: `board_post:{post_id}`
- 코칭노트: `coaching_note:{note_id}`
- 과제기록: `project_document:{doc_id}`

## 동기화 트리거(event_type)
- 게시글: `create`, `update`, `restore`, `comment_create`, `comment_update`, `comment_delete`
- 코칭노트: `create`, `update`, `restore`, `comment_create`, `comment_delete`
- 과제기록: `create`, `update`, `restore`, `manual_sync`

## RAG data 메타데이터(Top-level)
- insert 시 메타데이터는 `data.additional_field`가 아닌 `data` top-level에 저장합니다.
- `ai_summary`와 graph-rag 확장 메타도 top-level에 저장합니다.
  - `entity_nodes`: 엔티티 목록 (`name`, `type`, `description`)
  - `entity_relations`: 관계 목록 (`source`, `relation`, `target`)
  - `entity_names`: 엔티티 이름 배열
  - `entity_count`, `relation_count`: 엔티티/관계 개수

### 1) board_post.v2
공통 필드:
- `source_type`: `board_post`
- `event_type`, `doc_schema`
- `post_id`, `board_id`, `board_type`, `board_name`
- `batch_id`, `batch_name`
- `author_id`
- `comment_count`, `last_comment_at`, `updated_at`
- `image_urls`, `image_descriptions`
- `entity_nodes`, `entity_relations`, `entity_names`, `entity_count`, `relation_count`
- `ai_summary`

예시(`data` 하위):
```json
{
  "doc_id": "board_post:12",
  "title": "게시글",
  "content": "...",
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
  "entity_nodes": [
    {"name": "N2SQL", "type": "technology", "description": "텍스트-투-SQL 기술"}
  ],
  "entity_relations": [
    {"source": "A프로젝트", "relation": "uses", "target": "N2SQL"}
  ],
  "entity_names": ["N2SQL", "A프로젝트"],
  "entity_count": 2,
  "relation_count": 1,
  "ai_summary": "..."
}
```

### 2) coaching_note.v2
공통 필드:
- `source_type`: `coaching_note`
- `event_type`, `doc_schema`
- `note_id`, `project_id`, `project_name`
- `batch_id`, `batch_name`
- `week_number`, `coaching_date`
- `author_id`
- `public_comment_count`, `coach_only_comment_count`
- `last_public_comment_at`, `updated_at`
- `image_urls`, `image_descriptions`
- `entity_nodes`, `entity_relations`, `entity_names`, `entity_count`, `relation_count`
- `ai_summary`

### 3) project_document.v1
공통 필드:
- `source_type`: `project_document`
- `event_type`, `doc_schema`
- `document_id`, `doc_type`, `doc_type_label`
- `project_id`, `project_name`
- `batch_id`, `batch_name`
- `author_id`
- `attachment_count`, `updated_at`
- `image_urls`, `image_descriptions`
- `entity_nodes`, `entity_relations`, `entity_names`, `entity_count`, `relation_count`
- `ai_summary`

## image인식 llm
```python
def get_image_base64(file_path):
  with open(file_path, "rb") as reader:
    image_bytes = reader.read()
    base64_bytes = base64.b64encode(image_bytes)
    base64_string = base64_bytes.decode("utf-8")
    return base64_string

image_base64 = get_image_base64("./data/sample.jpg")  # 이미지파일 경로

human_message = HumanMessage(
    content=[
      {"type": "text", "text": "이미지를 상세히 한글로 설명해주세요."},
      {"type": "image", "image": {"url": f"data:image/jpeg;base64,{image_base64}"}}
    ]
)
```

## 이미지 인식 LLM 환경변수
- `AI_IMAGE_MODEL_BASE_URL`: 이미지 인식 모델 전용 Base URL
- `AI_IMAGE_MODEL_NAME`: 이미지 인식 모델명
- `AI_IMAGE_MODEL_PROMPT`: 이미지 설명 프롬프트 (기본: `이미지를 상세히 한글로 설명해주세요.`)
- `AI_IMAGE_MODEL_MAX_IMAGES`: 문서당 이미지 설명 생성 최대 개수

## content 구성 원칙
- 게시글: `제목 + 본문 + 댓글 목록`을 하나의 텍스트로 구성
- 코칭노트: `핵심 필드 + 공개댓글 목록`을 하나의 텍스트로 구성
- 과제기록: `과제명 + 문서유형 + 제목 + 본문 + 첨부목록`을 하나의 텍스트로 구성
- 코칭노트의 `is_coach_only=true` 댓글은 content에 넣지 않습니다.
- 이미지가 있으면 `이미지설명(n)` 블록을 content에 추가해 RAG 문맥에 함께 저장합니다.

## graph-rag 메타 추출 원칙
- LLM 응답 형식은 JSON (`summary`, `entities`, `relations`)입니다.
- `entities`는 `name` 기준 중복 제거/길이 제한 후 저장합니다.
- `relations`는 `source/relation/target`이 모두 있을 때만 저장합니다.
- 요약/엔티티 추출 실패 시 요약만 fallback 저장하고 엔티티 메타는 빈 값으로 저장합니다.
