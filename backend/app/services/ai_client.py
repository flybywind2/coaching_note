"""AI Client 도메인 서비스 레이어입니다. 비즈니스 규칙과 데이터 접근 흐름을 캡슐화합니다."""

import uuid
import os
from typing import Optional
from app.config import settings


class AIClient:
    """생성형 AI 모델 클라이언트 (LangChain OpenAI 호환)"""

    MODEL_URLS = {
        "qwen3": settings.AI_MODEL_QWEN3_URL,
        "gemma3": settings.AI_MODEL_GEMMA3_URL,
        "deepseek-r1": settings.AI_MODEL_DEEPSEEK_URL,
        "gpt-oss": settings.AI_MODEL_GPT_OSS_URL,
    }

    def __init__(self, model_name: Optional[str] = None, user_id: Optional[str] = None):
        self.model_name = model_name or settings.AI_DEFAULT_MODEL
        self.user_id = user_id or "system"
        self._llm = None

    def _get_llm(self):
        if self._llm is None:
            try:
                from langchain_openai import ChatOpenAI
            except ImportError:
                raise RuntimeError("langchain-openai is not installed.")
            os.environ["OPENAI_API_KEY"] = settings.OPENAI_API_KEY
            base_url = self.MODEL_URLS.get(self.model_name, self.MODEL_URLS["qwen3"])
            self._llm = ChatOpenAI(
                base_url=base_url,
                model=self.model_name,
                default_headers={
                    "x-dep-ticket": settings.AI_CREDENTIAL_KEY,
                    "Send-System-Name": settings.AI_SYSTEM_NAME,
                    "User-ID": self.user_id,
                    "User-Type": "AD",
                    "Prompt-Msg-Id": str(uuid.uuid4()),
                    "Completion-Msg-Id": str(uuid.uuid4()),
                },
                temperature=0.7,
                max_tokens=2048,
            )
        return self._llm

    def invoke(self, prompt: str, system_prompt: Optional[str] = None) -> str:
        from langchain.schema import HumanMessage, SystemMessage
        llm = self._get_llm()
        messages = []
        if system_prompt:
            messages.append(SystemMessage(content=system_prompt))
        messages.append(HumanMessage(content=prompt))
        llm.default_headers["Prompt-Msg-Id"] = str(uuid.uuid4())
        llm.default_headers["Completion-Msg-Id"] = str(uuid.uuid4())
        response = llm.invoke(messages)
        return response.content

    @classmethod
    def get_client(cls, purpose: str, user_id: Optional[str] = None) -> "AIClient":
        mapping = {
            "summary": settings.AI_SUMMARY_MODEL,
            "qa": settings.AI_QA_MODEL,
            "code": settings.AI_CODE_MODEL,
            "general": settings.AI_DEFAULT_MODEL,
        }
        return cls(model_name=mapping.get(purpose, settings.AI_DEFAULT_MODEL), user_id=user_id)


