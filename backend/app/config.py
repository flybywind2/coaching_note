"""환경 변수 기반 애플리케이션 설정을 중앙에서 관리합니다."""

from pydantic_settings import BaseSettings
from typing import List


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
    AI_MODEL_QWEN3_URL: str = "https://model1.openai.com/v1"
    AI_MODEL_GEMMA3_URL: str = "https://model2.openai.com/v1"
    AI_MODEL_DEEPSEEK_URL: str = "https://model3.openai.com/v1"
    AI_MODEL_GPT_OSS_URL: str = "https://model4.openai.com/v1"
    AI_DEFAULT_MODEL: str = "qwen3"
    AI_SUMMARY_MODEL: str = "gpt-oss"
    AI_QA_MODEL: str = "qwen3"
    AI_CODE_MODEL: str = "deepseek-r1"
    # [chatbot] 이미지 인식 LLM 설정 (RAG 입력 시 이미지 설명 생성)
    AI_IMAGE_MODEL_BASE_URL: str = ""
    AI_IMAGE_MODEL_NAME: str = ""
    AI_IMAGE_MODEL_PROMPT: str = "이미지를 상세히 한글로 설명해주세요."
    AI_IMAGE_MODEL_MAX_IMAGES: int = 3
    AI_FEATURES_ENABLED: bool = True

    # [chatbot] RAG/챗봇 설정
    CHATBOT_ENABLED: bool = False
    RAG_ENABLED: bool = False
    RAG_BASE_URL: str = "http://localhost:8000"
    RAG_INSERT_ENDPOINT: str = "/insert-doc"
    RAG_RETRIEVE_RRF_ENDPOINT: str = "/retrieve-rrf"
    RAG_API_KEY: str = ""
    RAG_INDEX_NAME: str = "rp-ssp"
    RAG_PERMISSION_GROUP: str = "rag-public"
    RAG_TIMEOUT_SECONDS: float = 10.0

    class Config:
        env_file = ".env"


settings = Settings()


