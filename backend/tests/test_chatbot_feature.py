"""[chatbot] 챗봇/RAG 연동 기능을 검증하는 테스트입니다."""
from datetime import date

from tests.conftest import auth_headers


def test_chatbot_ask_endpoint_returns_answer_and_references(client, seed_users, monkeypatch):
    # [chatbot] 챗봇 질의 API는 answer/references를 반환해야 한다.
    from app.config import settings
    from app.services.chatbot_service import ChatbotService

    monkeypatch.setattr(settings, "CHATBOT_ENABLED", True, raising=False)

    def _fake_answer_with_rag(self, *, current_user, question, num_result_doc):  # noqa: ANN001
        assert question == "테스트 질문"
        assert num_result_doc == 3
        assert int(current_user.user_id) == int(seed_users["participant"].user_id)
        return {
            "answer": "테스트 답변",
            "references": [{"doc_id": "board_post:1", "title": "게시글", "score": 0.9}],
        }

    monkeypatch.setattr(ChatbotService, "answer_with_rag", _fake_answer_with_rag)

    headers = auth_headers(client, "user001")
    resp = client.post(
        "/api/chatbot/ask",
        json={"question": "테스트 질문", "num_result_doc": 3},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["answer"] == "테스트 답변"
    assert len(body["references"]) == 1
    assert body["references"][0]["doc_id"] == "board_post:1"


def test_chatbot_config_endpoint_reflects_env(client, monkeypatch):
    # [chatbot] .env 토글값이 프론트 설정 API로 그대로 노출되어야 한다.
    from app.config import settings

    monkeypatch.setattr(settings, "CHATBOT_ENABLED", False, raising=False)
    disabled = client.get("/api/chatbot/config")
    assert disabled.status_code == 200, disabled.text
    assert disabled.json()["enabled"] is False

    monkeypatch.setattr(settings, "CHATBOT_ENABLED", True, raising=False)
    enabled = client.get("/api/chatbot/config")
    assert enabled.status_code == 200, enabled.text
    assert enabled.json()["enabled"] is True


def test_chatbot_ask_endpoint_disabled_when_feature_off(client, seed_users, monkeypatch):
    # [chatbot] 챗봇 기능 토글이 꺼지면 질문 API는 503을 반환해야 한다.
    from app.config import settings

    monkeypatch.setattr(settings, "CHATBOT_ENABLED", False, raising=False)
    headers = auth_headers(client, "user001")
    resp = client.post(
        "/api/chatbot/ask",
        json={"question": "테스트 질문", "num_result_doc": 3},
        headers=headers,
    )
    assert resp.status_code == 503, resp.text
    assert "비활성화" in resp.json().get("detail", "")


def test_chatbot_ask_endpoint_allows_admin_when_feature_off(client, seed_users, monkeypatch):
    # [chatbot] CHATBOT_ENABLED=false여도 admin은 질문 API를 사용할 수 있어야 한다.
    from app.config import settings
    from app.services.chatbot_service import ChatbotService

    monkeypatch.setattr(settings, "CHATBOT_ENABLED", False, raising=False)

    def _fake_answer_with_rag(self, *, current_user, question, num_result_doc):  # noqa: ANN001
        assert int(current_user.user_id) == int(seed_users["admin"].user_id)
        assert question == "관리자 질문"
        return {"answer": "admin ok", "references": []}

    monkeypatch.setattr(ChatbotService, "answer_with_rag", _fake_answer_with_rag)

    headers = auth_headers(client, "admin001")
    resp = client.post(
        "/api/chatbot/ask",
        json={"question": "관리자 질문", "num_result_doc": 5},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["answer"] == "admin ok"


def test_chatbot_upsert_rag_document_includes_metadata_and_ai_summary(db, monkeypatch):
    # [chatbot] RAG 입력 payload의 data 최상위 레벨에 메타데이터 + AI요약이 포함되어야 한다.
    from app.config import settings
    from app.services.chatbot_service import ChatbotService

    monkeypatch.setattr(settings, "CHATBOT_ENABLED", True, raising=False)
    monkeypatch.setattr(settings, "RAG_ENABLED", True, raising=False)
    monkeypatch.setattr(settings, "RAG_BASE_URL", "http://rag.local", raising=False)
    monkeypatch.setattr(settings, "RAG_INSERT_ENDPOINT", "/insert-doc", raising=False)
    monkeypatch.setattr(settings, "RAG_API_KEY", "rag-api-key", raising=False)
    monkeypatch.setattr(settings, "AI_CREDENTIAL_KEY", "credential-key", raising=False)
    monkeypatch.setattr(settings, "RAG_INDEX_NAME", "rp-ssp", raising=False)

    captured = {}

    class _FakeResponse:
        def raise_for_status(self):
            return None

    def _fake_post(url, headers=None, json=None, timeout=None):  # noqa: ANN001
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        captured["timeout"] = timeout
        return _FakeResponse()

    monkeypatch.setattr("httpx.post", _fake_post)

    svc = ChatbotService(db)
    svc.upsert_rag_document(
        doc_id="board_post:77",
        title="제목",
        content="본문 내용입니다.",
        metadata={
            "source_type": "board_post",
            "batch_id": 2,
            "board_type": "tip",
        },
        user_id="1",
        ai_summary="요약 텍스트",
        permission_groups=["rag-public", "batch-2"],
    )

    assert captured["url"] == "http://rag.local/insert-doc"
    payload = captured["json"]
    assert payload["index_name"] == "rp-ssp"
    assert payload["data"]["doc_id"] == "board_post:77"
    assert payload["data"]["permission_groups"] == ["rag-public", "batch-2"]
    assert payload["data"]["source_type"] == "board_post"
    assert payload["data"]["batch_id"] == 2
    assert payload["data"]["board_type"] == "tip"
    assert payload["data"]["ai_summary"] == "요약 텍스트"


def test_chatbot_upsert_rag_document_works_when_chatbot_disabled(db, monkeypatch):
    # [chatbot] CHATBOT_ENABLED=false여도 RAG_ENABLED=true면 RAG insert 동기화는 동작해야 한다.
    from app.config import settings
    from app.services.chatbot_service import ChatbotService

    monkeypatch.setattr(settings, "CHATBOT_ENABLED", False, raising=False)
    monkeypatch.setattr(settings, "RAG_ENABLED", True, raising=False)
    monkeypatch.setattr(settings, "RAG_BASE_URL", "http://rag.local", raising=False)
    monkeypatch.setattr(settings, "RAG_INSERT_ENDPOINT", "/insert-doc", raising=False)
    monkeypatch.setattr(settings, "RAG_API_KEY", "rag-api-key", raising=False)
    monkeypatch.setattr(settings, "AI_CREDENTIAL_KEY", "credential-key", raising=False)
    monkeypatch.setattr(settings, "RAG_INDEX_NAME", "rp-ssp", raising=False)

    called = {"count": 0}

    class _FakeResponse:
        def raise_for_status(self):
            return None

    def _fake_post(url, headers=None, json=None, timeout=None):  # noqa: ANN001
        called["count"] += 1
        return _FakeResponse()

    monkeypatch.setattr("httpx.post", _fake_post)

    svc = ChatbotService(db)
    svc.upsert_rag_document(
        doc_id="board_post:88",
        title="제목",
        content="본문",
        metadata={"source_type": "board_post"},
        user_id="1",
    )
    assert called["count"] == 1


def test_chatbot_upsert_rag_document_blocked_when_rag_input_disabled(db, monkeypatch):
    # [chatbot] RAG_INPUT_ENABLED=false면 RAG 입력(upsert)은 비활성화되어야 한다.
    from fastapi import HTTPException
    from app.config import settings
    from app.services.chatbot_service import ChatbotService

    monkeypatch.setattr(settings, "RAG_ENABLED", True, raising=False)
    monkeypatch.setattr(settings, "RAG_INPUT_ENABLED", False, raising=False)
    monkeypatch.setattr(settings, "RAG_BASE_URL", "http://rag.local", raising=False)
    monkeypatch.setattr(settings, "RAG_INSERT_ENDPOINT", "/insert-doc", raising=False)
    monkeypatch.setattr(settings, "RAG_API_KEY", "rag-api-key", raising=False)
    monkeypatch.setattr(settings, "AI_CREDENTIAL_KEY", "credential-key", raising=False)
    monkeypatch.setattr(settings, "RAG_INDEX_NAME", "rp-ssp", raising=False)

    svc = ChatbotService(db)
    try:
        svc.upsert_rag_document(
            doc_id="board_post:99",
            title="제목",
            content="본문",
            metadata={"source_type": "board_post"},
            user_id="1",
        )
        assert False, "HTTPException expected"
    except HTTPException as exc:
        assert exc.status_code == 503
        assert "입력" in str(exc.detail)


def test_chatbot_board_create_triggers_rag_sync(client, seed_users, seed_boards, monkeypatch):
    # [chatbot] 게시글 생성 시 safe_sync_board_post가 호출되어야 한다.
    from app.services.chatbot_service import ChatbotService

    calls = []

    def _fake_sync(self, *, post_id, user_id, event_type):  # noqa: ANN001
        calls.append({"post_id": post_id, "user_id": user_id, "event_type": event_type})

    monkeypatch.setattr(ChatbotService, "safe_sync_board_post", _fake_sync)

    headers = auth_headers(client, "coach001")
    board_id = seed_boards[2].board_id
    resp = client.post(
        f"/api/boards/{board_id}/posts",
        json={"title": "RAG 연동 테스트", "content": "본문", "is_notice": False},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert calls and calls[0]["event_type"] == "create"


def test_chatbot_board_comment_create_triggers_rag_sync(client, seed_users, seed_boards, monkeypatch):
    # [chatbot] 게시글 댓글 등록 시에도 같은 게시글 doc_id를 재동기화해야 한다.
    from app.services.chatbot_service import ChatbotService

    calls = []

    def _fake_sync(self, *, post_id, user_id, event_type):  # noqa: ANN001
        calls.append({"post_id": post_id, "user_id": user_id, "event_type": event_type})

    monkeypatch.setattr(ChatbotService, "safe_sync_board_post", _fake_sync)

    headers = auth_headers(client, "coach001")
    board_id = seed_boards[2].board_id
    post_resp = client.post(
        f"/api/boards/{board_id}/posts",
        json={"title": "댓글 훅 테스트", "content": "본문", "is_notice": False},
        headers=headers,
    )
    assert post_resp.status_code == 200, post_resp.text
    post_id = int(post_resp.json()["post_id"])

    comment_resp = client.post(
        f"/api/boards/posts/{post_id}/comments",
        json={"content": "첫 댓글"},
        headers=headers,
    )
    assert comment_resp.status_code == 200, comment_resp.text
    assert any(row["event_type"] == "comment_create" and int(row["post_id"]) == post_id for row in calls)


def test_chatbot_note_create_triggers_rag_sync(client, db, seed_users, seed_batch, monkeypatch):
    # [chatbot] 코칭노트 생성 시 safe_sync_coaching_note가 호출되어야 한다.
    from app.models.project import Project
    from app.services.chatbot_service import ChatbotService

    calls = []

    def _fake_sync(self, *, note_id, user_id, event_type):  # noqa: ANN001
        calls.append({"note_id": note_id, "user_id": user_id, "event_type": event_type})

    monkeypatch.setattr(ChatbotService, "safe_sync_coaching_note", _fake_sync)

    project = Project(
        batch_id=seed_batch.batch_id,
        project_name="챗봇 훅 테스트 과제",
        organization="테스트팀",
        visibility="public",
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    headers = auth_headers(client, "coach001")
    resp = client.post(
        f"/api/projects/{project.project_id}/notes",
        json={"coaching_date": str(date.today()), "current_status": "진행중"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert calls and calls[0]["event_type"] == "create"


def test_chatbot_note_comment_create_triggers_rag_sync(client, db, seed_users, seed_batch, monkeypatch):
    # [chatbot] 코칭노트 댓글 등록 시에도 같은 코칭노트 doc_id를 재동기화해야 한다.
    from app.models.project import Project
    from app.services.chatbot_service import ChatbotService

    calls = []

    def _fake_sync(self, *, note_id, user_id, event_type):  # noqa: ANN001
        calls.append({"note_id": note_id, "user_id": user_id, "event_type": event_type})

    monkeypatch.setattr(ChatbotService, "safe_sync_coaching_note", _fake_sync)

    project = Project(
        batch_id=seed_batch.batch_id,
        project_name="챗봇 댓글 훅 테스트 과제",
        organization="테스트팀",
        visibility="public",
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    coach_headers = auth_headers(client, "coach001")
    note_resp = client.post(
        f"/api/projects/{project.project_id}/notes",
        json={"coaching_date": str(date.today()), "current_status": "진행중"},
        headers=coach_headers,
    )
    assert note_resp.status_code == 200, note_resp.text
    note_id = int(note_resp.json()["note_id"])

    participant_headers = auth_headers(client, "user001")
    comment_resp = client.post(
        f"/api/notes/{note_id}/comments",
        json={"content": "참여자 메모"},
        headers=participant_headers,
    )
    assert comment_resp.status_code == 200, comment_resp.text
    assert any(row["event_type"] == "comment_create" and int(row["note_id"]) == note_id for row in calls)


def test_chatbot_safe_sync_board_post_merges_comments_into_same_doc_id(db, seed_users, seed_boards, monkeypatch):
    # [chatbot] 댓글이 붙어도 동일한 board_post:{post_id} doc_id로 덮어써야 한다.
    from app.config import settings
    from app.models.board import BoardPost, PostComment
    from app.services.chatbot_service import ChatbotService

    monkeypatch.setattr(settings, "CHATBOT_ENABLED", True, raising=False)
    monkeypatch.setattr(settings, "RAG_ENABLED", True, raising=False)
    monkeypatch.setattr(settings, "RAG_BASE_URL", "http://rag.local", raising=False)
    monkeypatch.setattr(settings, "RAG_API_KEY", "rag-api-key", raising=False)
    monkeypatch.setattr(settings, "AI_CREDENTIAL_KEY", "credential-key", raising=False)

    post = BoardPost(
        board_id=seed_boards[1].board_id,
        author_id=seed_users["coach"].user_id,
        title="문서 통합 테스트",
        content="본문",
    )
    db.add(post)
    db.commit()
    db.refresh(post)

    db.add(
        PostComment(
            post_id=post.post_id,
            author_id=seed_users["participant"].user_id,
            content="댓글 내용",
        )
    )
    db.commit()

    captured = {}

    def _fake_upsert(self, **kwargs):  # noqa: ANN001
        captured.update(kwargs)

    monkeypatch.setattr(ChatbotService, "upsert_rag_document", _fake_upsert)

    svc = ChatbotService(db)
    svc.safe_sync_board_post(post_id=int(post.post_id), user_id=str(seed_users["coach"].user_id), event_type="comment_create")

    assert captured["doc_id"] == f"board_post:{post.post_id}"
    assert "댓글(1)" in captured["content"]
    assert "댓글 내용" in captured["content"]
    assert captured["metadata"]["comment_count"] == 1


def test_chatbot_safe_sync_board_post_includes_image_metadata_and_caption(db, seed_users, seed_boards, monkeypatch):
    # [chatbot] 게시글 이미지가 있으면 URL 메타 + 한국어 이미지 설명이 content에 포함되어야 한다.
    from app.config import settings
    from app.models.board import BoardPost
    from app.services.chatbot_service import ChatbotService

    monkeypatch.setattr(settings, "RAG_ENABLED", True, raising=False)
    monkeypatch.setattr(settings, "RAG_BASE_URL", "http://rag.local", raising=False)
    monkeypatch.setattr(settings, "RAG_API_KEY", "rag-api-key", raising=False)
    monkeypatch.setattr(settings, "AI_CREDENTIAL_KEY", "credential-key", raising=False)

    post = BoardPost(
        board_id=seed_boards[1].board_id,
        author_id=seed_users["coach"].user_id,
        title="이미지 포함 글",
        content='<p>본문</p><img src="/uploads/editor_images/boards/1/board_post/sample.png" alt="x" />',
    )
    db.add(post)
    db.commit()
    db.refresh(post)

    captured = {}

    def _fake_upsert(self, **kwargs):  # noqa: ANN001
        captured.update(kwargs)

    def _fake_caption(self, image_urls, *, user_id):  # noqa: ANN001
        return [{"url": image_urls[0], "caption": "샘플 화면이 담긴 이미지입니다."}]

    monkeypatch.setattr(ChatbotService, "upsert_rag_document", _fake_upsert)
    monkeypatch.setattr(ChatbotService, "_build_image_caption_entries", _fake_caption)

    svc = ChatbotService(db)
    svc.safe_sync_board_post(post_id=int(post.post_id), user_id=str(seed_users["coach"].user_id), event_type="update")

    assert captured["doc_id"] == f"board_post:{post.post_id}"
    assert "/uploads/editor_images/boards/1/board_post/sample.png" in captured["metadata"]["image_urls"]
    assert "샘플 화면이 담긴 이미지입니다." in captured["content"]
    assert "이미지설명(1)" in captured["content"]


def test_chatbot_admin_route_sql_selected_by_llm_json(db, seed_users, monkeypatch):
    # [chatbot] 관리자 질문은 LLM JSON 라우팅(route=sql)에 따라 SQL 경로를 사용해야 한다.
    from app.config import settings
    from app.services.chatbot_service import ChatbotService

    monkeypatch.setattr(settings, "CHATBOT_ENABLED", True, raising=False)
    monkeypatch.setattr(settings, "RAG_ENABLED", True, raising=False)
    monkeypatch.setattr(settings, "RAG_BASE_URL", "http://rag.local", raising=False)
    monkeypatch.setattr(settings, "RAG_API_KEY", "rag-api-key", raising=False)
    monkeypatch.setattr(settings, "AI_CREDENTIAL_KEY", "credential-key", raising=False)

    called = {"sql": 0, "rag": 0}

    def _fake_sql(self, *, current_user, question):  # noqa: ANN001
        called["sql"] += 1
        return {"answer": "SQL 답변", "references": [{"title": "SQL 결과", "source_type": "sql"}]}

    def _fake_rag(self, *, current_user, question, num_result_doc):  # noqa: ANN001
        called["rag"] += 1
        return {"answer": "RAG 답변", "references": []}

    def _fake_route(self, *, question, user_id):  # noqa: ANN001
        return "sql"

    monkeypatch.setattr(ChatbotService, "_decide_route_with_llm", _fake_route, raising=False)
    monkeypatch.setattr(ChatbotService, "_answer_with_sql", _fake_sql, raising=False)
    monkeypatch.setattr(ChatbotService, "_answer_with_rag", _fake_rag, raising=False)

    svc = ChatbotService(db)
    out = svc.answer_with_rag(
        current_user=seed_users["admin"],
        question="이번주 진행률이 가장 낮은 과제가 뭐야?",
        num_result_doc=5,
    )
    assert out["answer"] == "SQL 답변"
    assert called["sql"] == 1
    assert called["rag"] == 0


def test_chatbot_admin_route_rag_selected_by_llm_json(db, seed_users, monkeypatch):
    # [chatbot] 관리자 질문은 LLM JSON 라우팅(route=rag)에 따라 RAG 경로를 사용해야 한다.
    from app.config import settings
    from app.services.chatbot_service import ChatbotService

    monkeypatch.setattr(settings, "CHATBOT_ENABLED", True, raising=False)
    monkeypatch.setattr(settings, "RAG_ENABLED", True, raising=False)
    monkeypatch.setattr(settings, "RAG_BASE_URL", "http://rag.local", raising=False)
    monkeypatch.setattr(settings, "RAG_API_KEY", "rag-api-key", raising=False)
    monkeypatch.setattr(settings, "AI_CREDENTIAL_KEY", "credential-key", raising=False)

    called = {"sql": 0, "rag": 0}

    def _fake_sql(self, *, current_user, question):  # noqa: ANN001
        called["sql"] += 1
        return {"answer": "SQL 답변", "references": []}

    def _fake_rag(self, *, current_user, question, num_result_doc):  # noqa: ANN001
        called["rag"] += 1
        return {"answer": "RAG 답변", "references": []}

    def _fake_route(self, *, question, user_id):  # noqa: ANN001
        return "rag"

    monkeypatch.setattr(ChatbotService, "_decide_route_with_llm", _fake_route, raising=False)
    monkeypatch.setattr(ChatbotService, "_answer_with_sql", _fake_sql, raising=False)
    monkeypatch.setattr(ChatbotService, "_answer_with_rag", _fake_rag, raising=False)

    svc = ChatbotService(db)
    out = svc.answer_with_rag(
        current_user=seed_users["admin"],
        question="A과제 이번주 코칭 노트 요약해줘",
        num_result_doc=5,
    )
    assert out["answer"] == "RAG 답변"
    assert called["sql"] == 0
    assert called["rag"] == 1


def test_chatbot_non_admin_question_does_not_use_sql_path(db, seed_users, monkeypatch):
    # [chatbot] SQL 경로는 관리자 질문에서만 사용되어야 하며 비관리자는 RAG 고정이다.
    from app.config import settings
    from app.services.chatbot_service import ChatbotService

    monkeypatch.setattr(settings, "CHATBOT_ENABLED", True, raising=False)
    monkeypatch.setattr(settings, "RAG_ENABLED", True, raising=False)
    monkeypatch.setattr(settings, "RAG_BASE_URL", "http://rag.local", raising=False)
    monkeypatch.setattr(settings, "RAG_API_KEY", "rag-api-key", raising=False)
    monkeypatch.setattr(settings, "AI_CREDENTIAL_KEY", "credential-key", raising=False)

    called = {"sql": 0, "rag": 0}

    def _fake_sql(self, *, current_user, question):  # noqa: ANN001
        called["sql"] += 1
        return {"answer": "SQL 답변", "references": []}

    def _fake_rag(self, *, current_user, question, num_result_doc):  # noqa: ANN001
        called["rag"] += 1
        return {"answer": "RAG 답변", "references": []}

    def _fake_route(self, *, question, user_id):  # noqa: ANN001
        called["sql"] += 100  # non-admin에서 호출되면 안됨
        return "sql"

    monkeypatch.setattr(ChatbotService, "_decide_route_with_llm", _fake_route, raising=False)
    monkeypatch.setattr(ChatbotService, "_answer_with_sql", _fake_sql, raising=False)
    monkeypatch.setattr(ChatbotService, "_answer_with_rag", _fake_rag, raising=False)

    svc = ChatbotService(db)
    out = svc.answer_with_rag(
        current_user=seed_users["participant"],
        question="이번주 진행률이 가장 낮은 과제가 뭐야?",
        num_result_doc=5,
    )
    assert out["answer"] == "RAG 답변"
    assert called["sql"] == 0
    assert called["rag"] == 1


def test_chatbot_route_json_parser_handles_fenced_json(db):
    # [chatbot] 라우팅 JSON 파서는 코드블록/문자열에서도 route 값을 올바르게 읽어야 한다.
    from app.services.chatbot_service import ChatbotService

    svc = ChatbotService(db)
    route = svc._parse_route_decision("""```json\n{"route":"sql","reason":"집계 질문"}\n```""")
    assert route == "sql"


def test_chatbot_extract_references_reads_top_level_metadata(db):
    # [chatbot] 검색 응답 메타데이터는 additional_field 없이 top-level에서도 읽혀야 한다.
    from app.services.chatbot_service import ChatbotService

    svc = ChatbotService(db)
    raw = {
        "hits": {
            "hits": [
                {
                    "_score": 1.23,
                    "_source": {
                        "doc_id": "board_post:10",
                        "title": "테스트",
                        "content": "본문",
                        "source_type": "board_post",
                        "batch_id": 2,
                        "image_urls": ["/uploads/editor_images/a.png"],
                    },
                }
            ]
        }
    }
    refs = svc._extract_references(raw)
    assert len(refs) == 1
    assert refs[0]["source_type"] == "board_post"
    assert refs[0]["batch_id"] == 2
    assert refs[0]["image_urls"] == ["/uploads/editor_images/a.png"]


def test_chatbot_extract_references_keeps_additional_field_compat(db):
    # [chatbot] 레거시 additional_field 구조도 계속 파싱되어야 한다.
    from app.services.chatbot_service import ChatbotService

    svc = ChatbotService(db)
    raw = {
        "result_docs": [
            {
                "doc_id": "coaching_note:1",
                "title": "노트",
                "content": "내용",
                "additional_field": '{"source_type":"coaching_note","batch_id":1,"image_urls":["/uploads/editor_images/b.png"]}',
            }
        ]
    }
    refs = svc._extract_references(raw)
    assert len(refs) == 1
    assert refs[0]["source_type"] == "coaching_note"
    assert refs[0]["batch_id"] == 1
    assert refs[0]["image_urls"] == ["/uploads/editor_images/b.png"]


def test_chatbot_sql_schema_metadata_includes_project_member(db):
    # [chatbot] SQL 메타데이터에는 사용자-과제 매핑용 project_member 테이블이 포함되어야 한다.
    from app.services.chatbot_service import ChatbotService

    svc = ChatbotService(db)
    schema = svc._sql_schema_guide()
    assert "project_member(" in schema
    assert "users(" in schema
    assert "projects(" in schema


def test_chatbot_admin_rag_failure_falls_back_to_sql(db, seed_users, monkeypatch):
    # [chatbot] 관리자 질문에서 RAG 실패 시 SQL 경로 재시도로 답변해야 한다.
    from fastapi import HTTPException
    from app.config import settings
    from app.services.chatbot_service import ChatbotService

    monkeypatch.setattr(settings, "CHATBOT_ENABLED", True, raising=False)
    monkeypatch.setattr(settings, "RAG_ENABLED", True, raising=False)
    monkeypatch.setattr(settings, "RAG_BASE_URL", "http://rag.local", raising=False)
    monkeypatch.setattr(settings, "RAG_API_KEY", "rag-api-key", raising=False)
    monkeypatch.setattr(settings, "AI_CREDENTIAL_KEY", "credential-key", raising=False)

    def _fake_route(self, *, question, user_id):  # noqa: ANN001
        return "rag"

    def _fake_rag(self, *, current_user, question, num_result_doc):  # noqa: ANN001
        raise HTTPException(status_code=500, detail="rag failed")

    def _fake_sql(self, *, current_user, question):  # noqa: ANN001
        return {"answer": "SQL fallback", "references": [{"source_type": "sql", "title": "DB 조회"}]}

    monkeypatch.setattr(ChatbotService, "_decide_route_with_llm", _fake_route, raising=False)
    monkeypatch.setattr(ChatbotService, "_answer_with_rag", _fake_rag, raising=False)
    monkeypatch.setattr(ChatbotService, "_answer_with_sql", _fake_sql, raising=False)

    svc = ChatbotService(db)
    out = svc.answer_with_rag(
        current_user=seed_users["admin"],
        question="정수연 과제 뭐야?",
        num_result_doc=5,
    )
    assert out["answer"] == "SQL fallback"
    assert out["references"][0]["source_type"] == "sql"


def test_chatbot_sql_fallback_rule_generates_user_project_query(db):
    # [chatbot] 'OOO 과제' 질문은 users-project_member-projects 조인 SQL을 생성해야 한다.
    from app.services.chatbot_service import ChatbotService

    svc = ChatbotService(db)
    sql = svc._generate_sql_with_fallback_rules("정수연 과제 뭐야?")
    assert sql is not None
    assert "FROM users u" in sql
    assert "JOIN project_member pm" in sql
    assert "JOIN projects p" in sql


def test_chatbot_answer_with_sql_uses_fallback_rule_when_llm_sql_missing(db, seed_users, seed_batch, monkeypatch):
    # [chatbot] SQL 생성 LLM이 실패해도 fallback rule로 사용자-과제 조회 답변이 가능해야 한다.
    from app.config import settings
    from app.models.project import Project, ProjectMember
    from app.services.chatbot_service import ChatbotService

    monkeypatch.setattr(settings, "AI_FEATURES_ENABLED", False, raising=False)

    project = Project(
        batch_id=seed_batch.batch_id,
        project_name="정수연 테스트 과제",
        organization="테스트팀",
        visibility="public",
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    db.add(
        ProjectMember(
            project_id=project.project_id,
            user_id=seed_users["participant"].user_id,
            role="member",
            is_representative=True,
        )
    )
    db.commit()

    svc = ChatbotService(db)
    out = svc._answer_with_sql(
        current_user=seed_users["admin"],
        question="Participant 과제 뭐야?",
    )
    assert out is not None
    assert out["references"][0]["source_type"] == "sql"
    assert "정수연 테스트 과제" in out["answer"]


def test_chatbot_debug_mode_logs_rag_result_and_llm_history(db, seed_users, monkeypatch):
    # [chatbot] CHAT_DEBUG_MODE=true면 RAG 결과와 LLM 호출 이력이 터미널 로그에 남아야 한다.
    from app.config import settings
    from app.services.ai_client import AIClient
    from app.services.chatbot_service import ChatbotService

    logs: list[str] = []

    def _fake_info(msg, *args, **kwargs):  # noqa: ANN001
        text = str(msg)
        if args:
            try:
                text = text % args
            except Exception:
                text = f"{text} | args={args}"
        logs.append(text)

    class _FakeClient:
        model_name = "qwen3"

        def invoke(self, prompt, system_prompt=None):  # noqa: ANN001
            return "테스트 LLM 답변"

    def _fake_retrieve(self, *, query_text, num_result_doc, permission_groups):  # noqa: ANN001
        return {
            "hits": {
                "hits": [
                    {
                        "_score": 1.1,
                        "_source": {
                            "doc_id": "board_post:1",
                            "title": "RAG 문서",
                            "content": "검색 문맥",
                            "source_type": "board_post",
                            "batch_id": 1,
                        },
                    }
                ]
            }
        }

    monkeypatch.setattr(settings, "CHAT_DEBUG_MODE", True, raising=False)
    monkeypatch.setattr(settings, "AI_FEATURES_ENABLED", True, raising=False)
    monkeypatch.setattr(ChatbotService, "_retrieve_rag_documents", _fake_retrieve, raising=False)
    monkeypatch.setattr("app.services.chatbot_service.logger.info", _fake_info)
    monkeypatch.setattr(AIClient, "get_client", staticmethod(lambda purpose, user_id=None: _FakeClient()))

    svc = ChatbotService(db)
    out = svc.answer_with_rag(
        current_user=seed_users["participant"],
        question="테스트 질문",
        num_result_doc=5,
    )

    assert out["answer"] == "테스트 LLM 답변"
    assert any("[chatbot][debug] rag_result=" in row for row in logs)
    assert any("board_post:1" in row for row in logs)
    assert any("[chatbot][debug][llm 1]" in row for row in logs)
