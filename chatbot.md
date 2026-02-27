# Chatbot 기능 설명

## 1. 개요
- 챗봇은 `RAG 경로`와 `SQL 경로`를 함께 사용합니다.
- `RAG 경로`: 게시글/코칭노트 등 문서 기반 질의 응답
- `SQL 경로`: 관리자 질문 중 DB 집계/조회가 필요한 질의 응답
- 관리자 질문은 LLM이 JSON 라우팅(`sql|rag`)으로 경로를 선택합니다.

## 2. 환경변수(.env)
```env
CHATBOT_ENABLED=True
RAG_ENABLED=True
RAG_BASE_URL=http://localhost:8000
RAG_INSERT_ENDPOINT=/insert-doc
RAG_RETRIEVE_RRF_ENDPOINT=/retrieve-rrf
RAG_API_KEY=your_rag_api_key
RAG_INDEX_NAME=rp-ssp
RAG_PERMISSION_GROUP=rag-public
RAG_TIMEOUT_SECONDS=10

AI_IMAGE_MODEL_BASE_URL=
AI_IMAGE_MODEL_NAME=
AI_IMAGE_MODEL_PROMPT=이미지를 상세히 한글로 설명해주세요.
AI_IMAGE_MODEL_MAX_IMAGES=3
```

## 3. 토글/권한 동작
- `CHATBOT_ENABLED=False`
- 일반 사용자: 챗봇 UI 숨김 + `POST /api/chatbot/ask` 503
- 관리자: UI 노출/질의 허용 (운영 점검 예외)
- `RAG_ENABLED=True`이면 `CHATBOT_ENABLED`와 무관하게 RAG 입력 동기화는 계속 수행
- `RAG_ENABLED=False`면 RAG insert/retrieve 비활성화

## 4. API
### 4.1 설정 조회
- `GET /api/chatbot/config`
- 응답:
```json
{"enabled": true}
```

### 4.2 질문
- `POST /api/chatbot/ask`
- 요청:
```json
{"question":"이번주 진행률이 가장 낮은 과제가 뭐야?","num_result_doc":5}
```
- 응답:
```json
{
  "answer": "...",
  "references": [
    {
      "doc_id": "...",
      "title": "...",
      "score": 0.9,
      "source_type": "sql|board_post|coaching_note|...",
      "batch_id": 1,
      "image_urls": ["/uploads/editor_images/..."]
    }
  ]
}
```

## 5. 라우팅 규칙
- 관리자 질문: LLM이 JSON 한 줄(`{"route":"sql|rag","reason":"..."}`)로 경로를 선택
- 관리자 질문 `route=sql`: SQL 경로 우선
- 관리자 질문 `route=rag`: RAG 경로 사용
- 관리자 질문에서 JSON 파싱 실패: 기본 `rag`
- 비관리자 질문: 항상 RAG 경로
- 관리자 질문에서 RAG 실패: SQL 경로 1회 재시도

## 6. SQL 경로 상세
- SQL 생성: LLM 프롬프트에 DB 동적 스키마 메타데이터(테이블/컬럼/FK) 포함
- SQL 생성 힌트: `users -> project_member -> projects` 조인 힌트 포함
- 안전성 검사: `SELECT`/`WITH`만 허용, DML/DDL/다중문/주석 차단
- 결과 제한: 기본 LIMIT 보정(최대 50)
- SQL 폴백: LLM SQL 미생성 시 규칙 기반 SQL 폴백 사용
- SQL 폴백 예시: `OOO 과제 뭐야?` 유형은 사용자-과제 조인 조회로 처리

## 7. RAG 경로 상세
- `retrieve-rrf`로 문서 검색
- 검색 문맥(`content`, `source_type`, `batch_id`, `image_urls`)을 LLM 프롬프트에 포함
- 답변 생성 후 references 반환
- 메타 파싱 호환: 신규 top-level 메타데이터 우선 사용
- 메타 파싱 호환: 구형 `additional_field` fallback 파싱 지원

## 8. RAG 입력 자동 동기화
- 트리거: 게시글/코칭노트 create/update/restore/comment 변경 시 동기화
- 문서 ID: 게시글 `board_post:{post_id}`
- 문서 ID: 코칭노트 `coaching_note:{note_id}`
- 동일 `doc_id`는 upsert(덮어쓰기)
- 메타데이터 저장 위치: `data` top-level (`doc_id`, `content`와 동일 레벨)
- 이미지 처리: 문서 HTML/본문/댓글에서 이미지 URL 추출
- 이미지 처리: 추출 URL을 `image_urls` 메타데이터에 저장
- 이미지 처리: 이미지 인식 LLM 설정이 있으면 한글 설명을 생성해 `image_descriptions`에 저장
- 이미지 처리: 설명 텍스트를 content 하단 `이미지설명(n)` 블록으로 추가
- 이미지 처리: 이미지 모델 설정이 없거나 실패하면 기본 문구로 대체
- 상세 메타 스키마는 `rag_meta.md` 참고

## 9. 프론트 UI 동작
- 우하단 원형 `AI` 버튼 + 모달 UI
- 로그인 상태에서 `enabled=true` 또는 관리자면 노출
- 질문 응답 시 references 렌더링
- `references.image_urls`가 있으면 썸네일 이미지와 링크를 함께 표시

## 10. 주요 코드 위치
- 백엔드:
- `backend/app/routers/chatbot.py`
- `backend/app/services/chatbot_service.py`
- `backend/app/schemas/chatbot.py`
- `backend/app/config.py`
- 동기화 훅:
- `backend/app/services/board_service.py`
- `backend/app/services/coaching_service.py`
- 프론트:
- `frontend/js/components/chatbot.js`
- `frontend/css/style.css`
- 문서:
- `rag_meta.md`
- `chatbot.md`
