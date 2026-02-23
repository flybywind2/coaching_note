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
        self._client = None

    def _build_headers(self) -> Dict[str, str]:
        return {
            "x-dep-ticket": settings.AI_CREDENTIAL_KEY,
            "Send-System-Name": settings.AI_SYSTEM_NAME,
            "User-ID": self.user_id,
            "User-Type": "AD",
            "Prompt-Msg-Id": str(uuid.uuid4()),
            "Completion-Msg-Id": str(uuid.uuid4()),
        }

    def _get_client(self):
        if self._client is None:
            try:
                from openai import OpenAI
            except ImportError:
                raise RuntimeError("openai is not installed.")

            base_url = self.MODEL_URLS.get(self.model_name, self.MODEL_URLS["qwen3"])
            self._client = OpenAI(
                api_key=settings.OPENAI_API_KEY,
                base_url=base_url,
                default_headers=self._build_headers(),
            )
        return self._client

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
        client = self._get_client()
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            temperature=0.7,
            max_tokens=2048,
            extra_headers=self._build_headers(),
        )
        if not response.choices:
            return ""
        message = response.choices[0].message
        return self._normalize_content(message.content if message else "")

    @classmethod
    def get_client(cls, purpose: str, user_id: Optional[str] = None) -> "AIClient":
        mapping = {
            "summary": settings.AI_SUMMARY_MODEL,
            "qa": settings.AI_QA_MODEL,
            "code": settings.AI_CODE_MODEL,
            "general": settings.AI_DEFAULT_MODEL,
        }
        return cls(model_name=mapping.get(purpose, settings.AI_DEFAULT_MODEL), user_id=user_id)


