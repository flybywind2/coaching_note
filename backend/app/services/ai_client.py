"""AI Client 도메인 서비스 레이어입니다. 비즈니스 규칙과 데이터 접근 흐름을 캡슐화합니다."""

import uuid
from typing import Optional, List, Dict, Any
from app.config import settings


class AIClient:
    """생성형 AI 모델 클라이언트 (OpenAI 호환 API 직접 호출)"""

    MODEL_URLS = {
        "qwen3": settings.AI_MODEL_QWEN3_URL,
        "gemma3": settings.AI_MODEL_GEMMA3_URL,
        "deepseek-r1": settings.AI_MODEL_DEEPSEEK_URL,
        "gpt-oss": settings.AI_MODEL_GPT_OSS_URL,
    }

    def __init__(self, model_name: Optional[str] = None, user_id: Optional[str] = None):
        self.model_name = model_name or settings.AI_DEFAULT_MODEL
        self.user_id = user_id or "system"
        self._clients = {}

    def _resolve_base_url(self, model_name: str) -> str:
        key = (model_name or "").strip().lower()
        if key in self.MODEL_URLS:
            return self.MODEL_URLS[key]
        if "qwen" in key:
            return self.MODEL_URLS["qwen3"]
        if "gemma" in key:
            return self.MODEL_URLS["gemma3"]
        if "deepseek" in key:
            return self.MODEL_URLS["deepseek-r1"]
        if "gpt-oss" in key or "gpt_oss" in key:
            return self.MODEL_URLS["gpt-oss"]
        return self.MODEL_URLS["qwen3"]

    def _build_headers(self) -> Dict[str, str]:
        return {
            "x-dep-ticket": settings.AI_CREDENTIAL_KEY,
            "Send-System-Name": settings.AI_SYSTEM_NAME,
            "User-ID": self.user_id,
            "User-Type": "AD",
            "Prompt-Msg-Id": str(uuid.uuid4()),
            "Completion-Msg-Id": str(uuid.uuid4()),
        }

    def _get_client(self, model_name: Optional[str] = None):
        base_url = self._resolve_base_url(model_name or self.model_name)
        if base_url not in self._clients:
            try:
                from openai import OpenAI
            except ImportError:
                raise RuntimeError("openai is not installed.")
            self._clients[base_url] = OpenAI(
                api_key=settings.OPENAI_API_KEY,
                base_url=base_url,
                default_headers=self._build_headers(),
            )
        return self._clients[base_url]

    def _normalize_content(self, content: Any) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            chunks: List[str] = []
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    chunks.append(str(part.get("text", "")))
            return "".join(chunks)
        return str(content or "")

    def invoke(self, prompt: str, system_prompt: Optional[str] = None) -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        fallback_models = [
            settings.AI_DEFAULT_MODEL,
            settings.AI_QA_MODEL,
            "qwen3",
        ]
        tried = []
        candidates = [self.model_name] + [m for m in fallback_models if m and m != self.model_name]

        for candidate in candidates:
            tried.append(candidate)
            try:
                client = self._get_client(candidate)
                response = client.chat.completions.create(
                    model=candidate,
                    messages=messages,
                    temperature=0.7,
                    max_tokens=2048,
                    extra_headers=self._build_headers(),
                )
                if not response.choices:
                    return ""
                message = response.choices[0].message
                return self._normalize_content(message.content if message else "")
            except Exception as exc:
                text = str(exc)
                invalid_model_error = (
                    "does not exist" in text
                    or '"code":404' in text
                    or "NotFoundError" in text
                )
                if invalid_model_error and candidate != candidates[-1]:
                    continue
                raise RuntimeError(
                    f"AI 모델 호출 실패(시도 모델: {', '.join(tried)}): {text}"
                ) from exc
        return ""

    @classmethod
    def get_client(cls, purpose: str, user_id: Optional[str] = None) -> "AIClient":
        mapping = {
            "summary": settings.AI_SUMMARY_MODEL,
            "qa": settings.AI_QA_MODEL,
            "code": settings.AI_CODE_MODEL,
            "general": settings.AI_DEFAULT_MODEL,
        }
        return cls(model_name=mapping.get(purpose, settings.AI_DEFAULT_MODEL), user_id=user_id)


