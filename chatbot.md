# Chatbot 기능 설명

## 1. 개요
이 시스템의 챗봇은 다음 두 경로를 사용합니다.
- `SQL 경로`: 관리자 질문에 한해, LLM이 질문을 분석해 SQL 조회가 적합하다고 판단한 경우
- `RAG 경로`: 문서/코칭노트 기반 답변 또는 비관리자 질문

핵심 목표:
- 관리자 통계성 질의는 DB 직접 조회로 정확한 수치 제공
- 코칭노트/게시글 요약/해석 질의는 RAG 문맥 기반 답변 제공

---

## 2. 기능 토글(.env)
챗봇은 환경변수로 ON/OFF 할 수 있습니다.

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
```

동작:
- `CHATBOT_ENABLED=False`:
  - 프론트 우하단 챗봇 버튼 숨김
  - `POST /api/chatbot/ask` 는 `503` 반환
- `CHATBOT_ENABLED=True` + `RAG_ENABLED=True`:
  - 챗봇 UI 표시
  - 질의 처리 가능(SQL 또는 RAG)

---

## 3. API

### 3.1 설정 조회
- `GET /api/chatbot/config`
- 응답 예시:
```json
{"enabled": true}
```

### 3.2 질문
- `POST /api/chatbot/ask`
- 요청 예시:
```json
{"question":"이번주 진행률이 가장 낮은 과제가 뭐야?","num_result_doc":5}
```
- 응답 형식:
```json
{
  "answer": "...",
  "references": [
    {
      "doc_id": "...",
      "title": "...",
      "score": 0.9,
      "source_type": "sql|board_post|coaching_note|...",
      "batch_id": 1
    }
  ]
}
```

---

## 4. 질문 라우팅 방식

### 4.1 관리자 질문
관리자 질문은 LLM이 아래 JSON으로 라우팅을 결정합니다.

```json
{"route":"sql|rag","reason":"..."}
```

- `route=sql`: SQL 경로 시도
- `route=rag`: RAG 경로 사용
- 파싱 실패/예외 발생: 기본 `rag`

### 4.2 비관리자 질문
- 항상 RAG 경로 사용

---

## 5. SQL 경로

관리자 질문에서 `route=sql`일 때 실행됩니다.

동작 순서:
1. LLM으로 SQL 생성(JSON: `{"sql":"..."}`)
2. 안전성 검사
   - `SELECT/ WITH`만 허용
   - DML/DDL/주석/다중문 차단
3. LIMIT 보정(미지정 시 최대 50건)
4. SQL 실행 후 결과 요약 생성
5. 응답 references에 `source_type="sql"` 포함

실패 시:
- SQL 생성 실패/안전성 실패/실행 실패 -> RAG 경로로 폴백

---

## 6. RAG 경로

동작 순서:
1. `retrieve-rrf` 호출로 문서 검색
2. 검색 결과를 문맥으로 LLM 답변 생성
3. references에 문서 메타 정보 반환

권한 범위:
- 관리자/코치: 전체 batch scope 포함
- 참여자: 본인 접근 가능한 batch scope만 포함

---

## 7. RAG 입력 자동 동기화

게시글/코칭노트 등록/수정/댓글 변경 시 RAG 문서를 자동 갱신합니다.

- 게시글 doc_id: `board_post:{post_id}`
- 코칭노트 doc_id: `coaching_note:{note_id}`

`doc_id`가 동일하면 덮어쓰기(upsert)되므로,
댓글 생성/수정/삭제 시에도 같은 문서 ID로 최신 본문+댓글을 다시 입력합니다.

상세 메타데이터 구조는 `rag_meta.md` 참고.

---

## 8. 프론트 UI

- 우하단 원형 `AI` 버튼
- 클릭 시 챗봇 모달
- 로그인 상태 + `enabled=true`일 때만 노출

질문 전송 시:
- `API.askChatbot()` 호출
- 응답 answer + 참고 문서 표시
- 오류 메시지 버블 표시

---

## 9. 주요 코드 위치

백엔드:
- `backend/app/services/chatbot_service.py`
- `backend/app/routers/chatbot.py`
- `backend/app/schemas/chatbot.py`

RAG 동기화 훅:
- `backend/app/services/board_service.py`
- `backend/app/services/coaching_service.py`

프론트:
- `frontend/js/components/chatbot.js`
- `frontend/js/api.js`

문서:
- `rag_meta.md`
- `chatbot.md` (본 문서)
