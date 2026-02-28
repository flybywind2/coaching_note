"""AI Client 모델 선택/재시도 동작을 검증합니다."""

import sys
import types

from app.services.ai_client import AIClient
from app.config import settings


class _FakeMessage:
    def __init__(self, content):
        self.content = content


class _FakeChoice:
    def __init__(self, content):
        self.message = _FakeMessage(content)


class _FakeResponse:
    def __init__(self, content):
        self.choices = [_FakeChoice(content)]


def test_ai_client_resolves_base_url_with_model_hint():
    client = AIClient(model_name="openai/gpt-oss-120b", user_id="1")
    assert client._resolve_base_url("openai/gpt-oss-120b") == settings.AI_MODEL4_BASE_URL


def test_ai_client_fallbacks_when_model_not_found():
    class _Recorder:
        def __init__(self):
            self.calls = []

        def create(self, **kwargs):
            self.calls.append(kwargs)
            if len(self.calls) == 1:
                raise Exception('Error code: 404 - {"error":{"message":"The model `openai/gpt-oss-120b` does not exist.","type":"NotFoundError","param":"model","code":404}}')
            return _FakeResponse("fallback result")

    recorder = _Recorder()

    class _FakeSDKClient:
        def __init__(self, **kwargs):
            self.chat = types.SimpleNamespace(
                completions=types.SimpleNamespace(create=recorder.create)
            )

    fake_module = types.SimpleNamespace(OpenAI=_FakeSDKClient)
    original = sys.modules.get("openai")
    sys.modules["openai"] = fake_module
    try:
        client = AIClient(model_name="openai/gpt-oss-120b", user_id="1")
        result = client.invoke("테스트 프롬프트", "시스템 프롬프트")
        assert result == "fallback result"
        assert len(recorder.calls) == 2
        assert recorder.calls[0]["model"] == "openai/gpt-oss-120b"
        assert recorder.calls[1]["model"] == settings.AI_DEFAULT_MODEL
    finally:
        if original is None:
            del sys.modules["openai"]
        else:
            sys.modules["openai"] = original


def test_ai_client_uses_slot_model_name_for_api_call(monkeypatch):
    class _Recorder:
        def __init__(self):
            self.calls = []

        def create(self, **kwargs):
            self.calls.append(kwargs)
            return _FakeResponse("ok")

    recorder = _Recorder()

    class _FakeSDKClient:
        def __init__(self, **kwargs):
            self.chat = types.SimpleNamespace(
                completions=types.SimpleNamespace(create=recorder.create)
            )

    fake_module = types.SimpleNamespace(OpenAI=_FakeSDKClient)
    original = sys.modules.get("openai")
    sys.modules["openai"] = fake_module
    monkeypatch.setattr(settings, "AI_MODEL1", "openai/qwen3-32b", raising=False)
    try:
        client = AIClient(model_name="model1", user_id="1")
        out = client.invoke("테스트")
        assert out == "ok"
        assert recorder.calls
        assert recorder.calls[0]["model"] == "openai/qwen3-32b"
    finally:
        if original is None:
            del sys.modules["openai"]
        else:
            sys.modules["openai"] = original
