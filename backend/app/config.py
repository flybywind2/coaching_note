"""환경 변수 기반 애플리케이션 설정을 중앙에서 관리합니다."""

from pydantic_settings import BaseSettings
from typing import Dict, List
from pathlib import Path


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./ssp_coaching.db"
    SECRET_KEY: str = "change-me-to-a-random-secret-key"
    DEBUG: bool = True
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:8000"]

    # JWT
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # File upload
    MAX_UPLOAD_SIZE: int = 50 * 1024 * 1024  # 50 MB
    ALLOWED_EXTENSIONS: List[str] = [
        "jpg", "jpeg", "png", "gif",
        "pdf", "ppt", "pptx", "xls", "xlsx", "csv",
        "doc", "docx", "hwp", "hwpx", "txt", "zip",
    ]
    UPLOAD_DIR: str = "uploads"

    # AI Model Settings
    OPENAI_API_KEY: str = "your_openai_api_key"
    AI_CREDENTIAL_KEY: str = "your_credential_key"
    AI_SYSTEM_NAME: str = "SSP_COACHING"
    # [chatbot] 모델 엔드포인트는 model1~model4 슬롯으로 관리한다.
    AI_MODEL1_BASE_URL: str = "https://model1.openai.com/v1"
    AI_MODEL2_BASE_URL: str = "https://model2.openai.com/v1"
    AI_MODEL3_BASE_URL: str = "https://model3.openai.com/v1"
    AI_MODEL4_BASE_URL: str = "https://model4.openai.com/v1"
    # [chatbot] 슬롯별 실제 모델 식별자(model 파라미터)
    AI_MODEL1: str = "model1"
    AI_MODEL2: str = "model2"
    AI_MODEL3: str = "model3"
    AI_MODEL4: str = "model4"
    # Backward compatibility (deprecated)
    AI_MODEL_QWEN3_URL: str = ""
    AI_MODEL_GEMMA3_URL: str = ""
    AI_MODEL_DEEPSEEK_URL: str = ""
    AI_MODEL_GPT_OSS_URL: str = ""
    # [chatbot] 목적별 모델 선택은 model1~model4 슬롯과 1:1로 매핑한다.
    AI_DEFAULT_MODEL: str = "model1"
    AI_SUMMARY_MODEL: str = "model1"
    AI_QA_MODEL: str = "model1"
    AI_CODE_MODEL: str = "model1"
    # [chatbot] 이미지 인식 LLM 설정 (RAG 입력 시 이미지 설명 생성)
    AI_IMAGE_MODEL_BASE_URL: str = ""
    AI_IMAGE_MODEL_NAME: str = ""
    AI_IMAGE_MODEL_PROMPT: str = "이미지를 상세히 한글로 설명해주세요."
    AI_IMAGE_MODEL_MAX_IMAGES: int = 3
    AI_FEATURES_ENABLED: bool = True

    # [chatbot] RAG/챗봇 설정
    CHATBOT_ENABLED: bool = False
    CHAT_DEBUG_MODE: bool = False
    RAG_ENABLED: bool = False
    RAG_INPUT_ENABLED: bool = True
    RAG_BASE_URL: str = "http://localhost:8000"
    RAG_INSERT_ENDPOINT: str = "/insert-doc"
    RAG_RETRIEVE_RRF_ENDPOINT: str = "/retrieve-rrf"
    RAG_API_KEY: str = ""
    RAG_INDEX_NAME: str = "rp-ssp"
    RAG_PERMISSION_GROUP: str = "rag-public"
    RAG_TIMEOUT_SECONDS: float = 10.0

    def ai_model_base_urls(self) -> Dict[str, str]:
        # [chatbot] 신규 슬롯 우선, 레거시 변수는 비어있지 않을 때만 fallback으로 사용
        model1 = str(self.AI_MODEL1_BASE_URL or "").strip() or str(self.AI_MODEL_QWEN3_URL or "").strip()
        model2 = str(self.AI_MODEL2_BASE_URL or "").strip() or str(self.AI_MODEL_GEMMA3_URL or "").strip()
        model3 = str(self.AI_MODEL3_BASE_URL or "").strip() or str(self.AI_MODEL_DEEPSEEK_URL or "").strip()
        model4 = str(self.AI_MODEL4_BASE_URL or "").strip() or str(self.AI_MODEL_GPT_OSS_URL or "").strip()
        return {
            "model1": model1,
            "model2": model2,
            "model3": model3,
            "model4": model4,
        }

    def ai_model_names(self) -> Dict[str, str]:
        # [chatbot] 슬롯별 모델명(model 파라미터) 매핑
        return {
            "model1": str(self.AI_MODEL1 or "model1").strip() or "model1",
            "model2": str(self.AI_MODEL2 or "model2").strip() or "model2",
            "model3": str(self.AI_MODEL3 or "model3").strip() or "model3",
            "model4": str(self.AI_MODEL4 or "model4").strip() or "model4",
        }

    class Config:
        # [chatbot] 실행 cwd와 무관하게 backend/.env를 로드한다.
        env_file = str(Path(__file__).resolve().parents[1] / ".env")


settings = Settings()


