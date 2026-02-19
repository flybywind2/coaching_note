# SSP+ 코칭노트 관리 시스템 - 생성형 AI 활용 기능 추가

---

## 11. 생성형 AI 활용 기능

### 11.1 AI 기능 개요

| 기능 | 설명 | 우선순위 | 적용 시점 |
|------|------|:--------:|----------|
| **코칭노트 자동 요약** | 과제별 전체 코칭노트를 요약하여 핵심 내용 제공 | P1 | Phase 2 |
| **Q&A Set 생성** | 코칭 기록에서 주요 질문-답변 쌍 자동 추출 | P1 | Phase 2 |
| **코칭노트 작성 보조** | 작성 중인 내용 기반 문장 완성/제안 | P2 | 추후 |
| **자연어 검색** | 코칭 기록을 자연어로 검색 | P3 | 추후 |
| **패턴 분석/인사이트** | 코칭 데이터 기반 패턴 분석 및 추천 | P3 | 추후 |

### 11.2 사용 가능한 AI 모델

| 모델 | Base URL | 용도 |
|------|----------|------|
| `qwen3` | `model1_base_url` | 범용 (요약, Q&A) |
| `gemma3` | `model2_base_url` | 범용 (요약, 작성 보조) |
| `deepseek-r1` | `model3_base_url` | 코드 관련 분석 |
| `gpt-oss` | `model4_base_url` | 고품질 요약/분석 |

---

### 11.3 시스템 아키텍처 (AI 포함)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend                                 │
│                   Vanilla JavaScript                            │
└─────────────────────────┬───────────────────────────────────────┘
                          │ REST API
┌─────────────────────────▼───────────────────────────────────────┐
│                        Backend                                  │
│                  Python (FastAPI)                               │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Routers   │  │  Services   │  │      AI Service         │ │
│  │             │──│             │──│  (LangChain + OpenAI)   │ │
│  └─────────────┘  └─────────────┘  └───────────┬─────────────┘ │
└────────────────────────────────────────────────┼────────────────┘
                                                 │
                    ┌────────────────────────────┼────────────────┐
                    │         AI Models          │                │
                    │  ┌─────────┐ ┌─────────┐  │  ┌───────────┐ │
                    │  │  qwen3  │ │ gemma3  │  │  │deepseek-r1│ │
                    │  └─────────┘ └─────────┘  │  └───────────┘ │
                    │              ┌─────────┐  │                │
                    │              │ gpt-oss │  │                │
                    │              └─────────┘  │                │
                    └─────────────────────────────────────────────┘
```

---

### 11.4 데이터베이스 추가 테이블

#### 11.4.1 AI 생성 콘텐츠 저장

```sql
CREATE TABLE ai_generated_content (
    content_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      INTEGER NOT NULL,
    content_type    VARCHAR(30) NOT NULL,           -- summary/qa_set/insight
    title           VARCHAR(200),
    content         TEXT NOT NULL,                  -- JSON 또는 텍스트
    model_used      VARCHAR(50),                    -- 사용된 AI 모델
    source_notes    TEXT,                           -- 참조한 코칭노트 ID 목록 (JSON)
    generated_by    INTEGER NOT NULL,               -- 생성 요청한 사용자
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP,
    is_active       BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (project_id) REFERENCES project(project_id),
    FOREIGN KEY (generated_by) REFERENCES user(user_id)
);

CREATE INDEX idx_ai_content_project ON ai_generated_content(project_id, content_type);
```

---

### 11.5 설정 추가 (`config.py`)

```python
# backend/app/config.py
from pydantic_settings import BaseSettings
from typing import List, Optional


class Settings(BaseSettings):
    # ... 기존 설정 ...
    
    # AI 모델 설정
    OPENAI_API_KEY: str = "your_openai_api_key"
    AI_CREDENTIAL_KEY: str = "your_credential_key"
    AI_SYSTEM_NAME: str = "SSP_COACHING"
    
    # 모델별 Base URL
    AI_MODEL_QWEN3_URL: str = "https://model1.openai.com/v1"
    AI_MODEL_GEMMA3_URL: str = "https://model2.openai.com/v1"
    AI_MODEL_DEEPSEEK_URL: str = "https://model3.openai.com/v1"
    AI_MODEL_GPT_OSS_URL: str = "https://model4.openai.com/v1"
    
    # 기본 모델
    AI_DEFAULT_MODEL: str = "qwen3"
    AI_SUMMARY_MODEL: str = "gpt-oss"
    AI_QA_MODEL: str = "qwen3"
    AI_CODE_MODEL: str = "deepseek-r1"
    
    # AI 기능 활성화 여부
    AI_FEATURES_ENABLED: bool = True

    class Config:
        env_file = ".env"


settings = Settings()
```

---

### 11.6 AI 서비스 구현

#### 11.6.1 AI 클라이언트 (`services/ai_client.py`)

```python
# backend/app/services/ai_client.py
import uuid
import os
from typing import Optional
from langchain_openai import ChatOpenAI
from langchain.schema import HumanMessage, SystemMessage

from app.config import settings


class AIClient:
    """생성형 AI 모델 클라이언트"""
    
    # 모델별 Base URL 매핑
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
    
    def _get_llm(self) -> ChatOpenAI:
        """LLM 인스턴스 생성 (지연 로딩)"""
        if self._llm is None:
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
        """AI 모델 호출"""
        llm = self._get_llm()
        
        messages = []
        if system_prompt:
            messages.append(SystemMessage(content=system_prompt))
        messages.append(HumanMessage(content=prompt))
        
        # 새로운 요청마다 고유 ID 생성
        llm.default_headers["Prompt-Msg-Id"] = str(uuid.uuid4())
        llm.default_headers["Completion-Msg-Id"] = str(uuid.uuid4())
        
        response = llm.invoke(messages)
        return response.content
    
    @classmethod
    def get_client(cls, purpose: str, user_id: Optional[str] = None) -> "AIClient":
        """용도별 최적 모델로 클라이언트 생성"""
        model_mapping = {
            "summary": settings.AI_SUMMARY_MODEL,
            "qa": settings.AI_QA_MODEL,
            "code": settings.AI_CODE_MODEL,
            "general": settings.AI_DEFAULT_MODEL,
        }
        model_name = model_mapping.get(purpose, settings.AI_DEFAULT_MODEL)
        return cls(model_name=model_name, user_id=user_id)
```

#### 11.6.2 AI 서비스 (`services/ai_service.py`)

```python
# backend/app/services/ai_service.py
import json
from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session

from app.models.coaching_note import CoachingNote, CoachingComment
from app.models.project import Project
from app.models.ai_content import AIGeneratedContent
from app.services.ai_client import AIClient
from app.config import settings


class AIService:
    """AI 기반 코칭노트 분석 및 생성 서비스"""
    
    def __init__(self, db: Session):
        self.db = db
    
    # =========================================================================
    # 1. 코칭노트 자동 요약
    # =========================================================================
    
    def generate_project_summary(
        self, 
        project_id: int, 
        user_id: str,
        force_regenerate: bool = False
    ) -> Dict[str, Any]:
        """과제별 코칭노트 전체 요약 생성"""
        
        if not settings.AI_FEATURES_ENABLED:
            raise ValueError("AI 기능이 비활성화되어 있습니다")
        
        # 기존 요약이 있고 재생성 요청이 아니면 기존 반환
        if not force_regenerate:
            existing = self._get_existing_content(project_id, "summary")
            if existing:
                return existing
        
        # 코칭노트 조회
        notes = self.db.query(CoachingNote).filter(
            CoachingNote.project_id == project_id
        ).order_by(CoachingNote.coaching_date).all()
        
        if not notes:
            raise ValueError("요약할 코칭노트가 없습니다")
        
        # 프로젝트 정보 조회
        project = self.db.query(Project).filter(
            Project.project_id == project_id
        ).first()
        
        # 코칭노트 텍스트 구성
        notes_text = self._format_notes_for_summary(notes)
        
        # AI 요약 생성
        ai_client = AIClient.get_client("summary", user_id)
        
        system_prompt = """당신은 AI 과제 코칭 프로그램의 전문 분석가입니다.
주어진 코칭노트들을 분석하여 다음 형식으로 요약해주세요:

1. **과제 개요**: 과제의 목표와 현재 상태 (2-3문장)
2. **주요 진행 경과**: 시간순으로 핵심 마일스톤과 성과 (bullet points)
3. **핵심 기술 이슈**: 겪었던 주요 기술적 문제와 해결 방안 (bullet points)
4. **성장 포인트**: 참여자들이 배운 핵심 내용 (bullet points)
5. **다음 단계 제안**: 향후 진행 방향 권고 (2-3문장)

전문적이면서도 이해하기 쉽게 작성해주세요."""

        prompt = f"""다음은 '{project.project_name}' 과제의 코칭노트 기록입니다.
이 내용을 분석하여 요약해주세요.

=== 코칭노트 기록 ===
{notes_text}
"""
        
        summary_text = ai_client.invoke(prompt, system_prompt)
        
        # 결과 저장
        content = self._save_ai_content(
            project_id=project_id,
            content_type="summary",
            title=f"{project.project_name} - AI 요약",
            content=summary_text,
            model_used=ai_client.model_name,
            source_notes=[n.note_id for n in notes],
            generated_by=int(user_id) if user_id.isdigit() else 0
        )
        
        # 프로젝트 ai_summary 필드 업데이트
        project.ai_summary = summary_text
        self.db.commit()
        
        return {
            "content_id": content.content_id,
            "project_id": project_id,
            "content_type": "summary",
            "title": content.title,
            "content": summary_text,
            "model_used": ai_client.model_name,
            "created_at": content.created_at.isoformat(),
            "source_notes_count": len(notes)
        }
    
    # =========================================================================
    # 2. Q&A Set 생성
    # =========================================================================
    
    def generate_qa_set(
        self, 
        project_id: int, 
        user_id: str,
        max_qa_pairs: int = 10
    ) -> Dict[str, Any]:
        """코칭노트에서 Q&A Set 자동 추출"""
        
        if not settings.AI_FEATURES_ENABLED:
            raise ValueError("AI 기능이 비활성화되어 있습니다")
        
        # 코칭노트 및 의견 조회
        notes = self.db.query(CoachingNote).filter(
            CoachingNote.project_id == project_id
        ).order_by(CoachingNote.coaching_date).all()
        
        if not notes:
            raise ValueError("분석할 코칭노트가 없습니다")
        
        # 코칭노트와 의견 텍스트 구성
        content_text = self._format_notes_with_comments(notes)
        
        # AI Q&A 추출
        ai_client = AIClient.get_client("qa", user_id)
        
        system_prompt = """당신은 AI 과제 코칭 기록을 분석하여 핵심 Q&A를 추출하는 전문가입니다.

코칭노트에서 다음 기준으로 Q&A 쌍을 추출해주세요:
1. 실제로 제기된 문제/질문과 그에 대한 해결책/답변
2. 다른 유사 과제에서도 참고할 만한 범용적인 내용
3. 기술적으로 의미있는 노하우나 팁

결과는 반드시 다음 JSON 형식으로 반환해주세요:
{
  "qa_pairs": [
    {
      "category": "카테고리 (데이터/모델/성능/배포/기타)",
      "question": "질문 내용",
      "answer": "답변 내용",
      "keywords": ["키워드1", "키워드2"],
      "difficulty": "난이도 (초급/중급/고급)"
    }
  ]
}"""

        prompt = f"""다음 코칭노트 기록에서 핵심 Q&A {max_qa_pairs}개를 추출해주세요.

=== 코칭노트 기록 ===
{content_text}
"""
        
        response_text = ai_client.invoke(prompt, system_prompt)
        
        # JSON 파싱 시도
        try:
            # JSON 블록 추출
            if "```json" in response_text:
                json_str = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                json_str = response_text.split("```")[1].split("```")[0]
            else:
                json_str = response_text
            
            qa_data = json.loads(json_str.strip())
        except json.JSONDecodeError:
            qa_data = {"qa_pairs": [], "raw_response": response_text}
        
        # 결과 저장
        project = self.db.query(Project).filter(Project.project_id == project_id).first()
        
        content = self._save_ai_content(
            project_id=project_id,
            content_type="qa_set",
            title=f"{project.project_name} - Q&A Set",
            content=json.dumps(qa_data, ensure_ascii=False),
            model_used=ai_client.model_name,
            source_notes=[n.note_id for n in notes],
            generated_by=int(user_id) if user_id.isdigit() else 0
        )
        
        return {
            "content_id": content.content_id,
            "project_id": project_id,
            "content_type": "qa_set",
            "title": content.title,
            "qa_pairs": qa_data.get("qa_pairs", []),
            "model_used": ai_client.model_name,
            "created_at": content.created_at.isoformat(),
            "source_notes_count": len(notes)
        }
    
    # =========================================================================
    # 3. 코칭노트 작성 보조
    # =========================================================================
    
    def assist_note_writing(
        self,
        project_id: int,
        user_id: str,
        partial_content: Dict[str, str],
        assist_type: str = "complete"  # complete/suggest/improve
    ) -> Dict[str, Any]:
        """코칭노트 작성 보조 - 문장 완성/제안/개선"""
        
        if not settings.AI_FEATURES_ENABLED:
            raise ValueError("AI 기능이 비활성화되어 있습니다")
        
        project = self.db.query(Project).filter(Project.project_id == project_id).first()
        
        # 이전 코칭노트 컨텍스트 가져오기
        recent_notes = self.db.query(CoachingNote).filter(
            CoachingNote.project_id == project_id
        ).order_by(CoachingNote.coaching_date.desc()).limit(3).all()
        
        context = self._format_notes_for_context(recent_notes)
        
        ai_client = AIClient.get_client("general", user_id)
        
        system_prompts = {
            "complete": """당신은 AI 과제 코칭노트 작성을 돕는 어시스턴트입니다.
사용자가 작성 중인 내용을 바탕으로 문장을 완성해주세요.
- 기존 맥락과 일관성 유지
- 전문적이고 구체적인 표현 사용
- 실행 가능한 내용 위주로 작성""",
            
            "suggest": """당신은 AI 과제 코칭노트 작성을 돕는 어시스턴트입니다.
현재 상황을 바탕으로 작성할 만한 내용을 제안해주세요.
- 3-5개의 구체적인 제안 제공
- 각 제안은 2-3문장으로 구성
- 실질적으로 도움이 되는 내용 위주""",
            
            "improve": """당신은 AI 과제 코칭노트 작성을 돕는 어시스턴트입니다.
작성된 내용을 더 명확하고 전문적으로 개선해주세요.
- 모호한 표현을 구체화
- 기술 용어 정확하게 사용
- 실행 가능한 형태로 수정"""
        }
        
        prompt = f"""과제: {project.project_name}

=== 이전 코칭 맥락 ===
{context}

=== 현재 작성 중인 내용 ===
- 현재 상태: {partial_content.get('current_status', '')}
- 당면 문제: {partial_content.get('main_issue', '')}
- 다음 작업: {partial_content.get('next_action', '')}

위 내용을 바탕으로 {'문장을 완성' if assist_type == 'complete' else '제안을 제공' if assist_type == 'suggest' else '내용을 개선'}해주세요."""
        
        suggestion = ai_client.invoke(prompt, system_prompts.get(assist_type, system_prompts["complete"]))
        
        return {
            "assist_type": assist_type,
            "suggestion": suggestion,
            "model_used": ai_client.model_name
        }
    
    # =========================================================================
    # 4. 코드 분석/설명 (코칭 의견 작성 보조)
    # =========================================================================
    
    def analyze_code_snippet(
        self,
        code: str,
        user_id: str,
        analysis_type: str = "explain"  # explain/review/improve
    ) -> Dict[str, Any]:
        """코드 스니펫 분석/설명/개선안 제공"""
        
        if not settings.AI_FEATURES_ENABLED:
            raise ValueError("AI 기능이 비활성화되어 있습니다")
        
        ai_client = AIClient.get_client("code", user_id)
        
        system_prompts = {
            "explain": """당신은 AI/ML 코드를 설명하는 전문가입니다.
주어진 코드를 초중급 개발자도 이해할 수 있도록 설명해주세요.
- 코드의 목적과 전체 흐름
- 주요 함수/클래스의 역할
- 핵심 로직 설명
- 사용된 라이브러리/기법 소개""",
            
            "review": """당신은 AI/ML 코드 리뷰 전문가입니다.
주어진 코드를 리뷰하고 피드백을 제공해주세요.
- 잠재적 버그나 문제점
- 성능 개선 포인트
- 코드 품질 개선 제안
- 베스트 프랙티스 적용 여부""",
            
            "improve": """당신은 AI/ML 코드 개선 전문가입니다.
주어진 코드의 개선된 버전을 제안해주세요.
- 개선된 코드 제공
- 변경 사항 설명
- 개선으로 인한 이점 설명"""
        }
        
        prompt = f"""다음 코드를 {'설명' if analysis_type == 'explain' else '리뷰' if analysis_type == 'review' else '개선'}해주세요:

```python
{code}
```"""
        
        result = ai_client.invoke(prompt, system_prompts.get(analysis_type, system_prompts["explain"]))
        
        return {
            "analysis_type": analysis_type,
            "result": result,
            "model_used": ai_client.model_name
        }
    
    # =========================================================================
    # Helper Methods
    # =========================================================================
    
    def _format_notes_for_summary(self, notes: List[CoachingNote]) -> str:
        """요약용 노트 텍스트 포맷팅"""
        formatted = []
        for note in notes:
            text = f"""
[{note.coaching_date} - Week {note.week_number or '?'}]
- 진행률: {note.progress_rate}%
- 현재 상태: {note.current_status or 'N/A'}
- 당면 문제: {note.main_issue or 'N/A'}
- 다음 작업: {note.next_action or 'N/A'}
"""
            formatted.append(text)
        return "\n".join(formatted)
    
    def _format_notes_with_comments(self, notes: List[CoachingNote]) -> str:
        """Q&A 추출용 노트+의견 텍스트 포맷팅"""
        formatted = []
        for note in notes:
            text = f"""
[{note.coaching_date}]
현재 상태: {note.current_status or 'N/A'}
당면 문제: {note.main_issue or 'N/A'}
다음 작업: {note.next_action or 'N/A'}
"""
            # 의견 추가
            if note.comments:
                text += "\n코칭 의견:\n"
                for comment in note.comments:
                    if not comment.is_coach_only:  # 공개 의견만
                        text += f"- {comment.content}\n"
                        if comment.code_snippet:
                            text += f"  [코드]\n  {comment.code_snippet}\n"
            
            formatted.append(text)
        return "\n".join(formatted)
    
    def _format_notes_for_context(self, notes: List[CoachingNote]) -> str:
        """작성 보조용 최근 노트 컨텍스트"""
        if not notes:
            return "이전 코칭 기록 없음"
        
        formatted = []
        for note in notes:
            text = f"[{note.coaching_date}] 상태: {note.current_status or 'N/A'}, 문제: {note.main_issue or 'N/A'}"
            formatted.append(text)
        return "\n".join(formatted)
    
    def _get_existing_content(self, project_id: int, content_type: str) -> Optional[Dict]:
        """기존 AI 생성 콘텐츠 조회"""
        content = self.db.query(AIGeneratedContent).filter(
            AIGeneratedContent.project_id == project_id,
            AIGeneratedContent.content_type == content_type,
            AIGeneratedContent.is_active == True
        ).order_by(AIGeneratedContent.created_at.desc()).first()
        
        if content:
            return {
                "content_id": content.content_id,
                "project_id": project_id,
                "content_type": content_type,
                "title": content.title,
                "content": content.content,
                "model_used": content.model_used,
                "created_at": content.created_at.isoformat()
            }
        return None
    
    def _save_ai_content(
        self,
        project_id: int,
        content_type: str,
        title: str,
        content: str,
        model_used: str,
        source_notes: List[int],
        generated_by: int
    ) -> AIGeneratedContent:
        """AI 생성 콘텐츠 저장"""
        # 기존 콘텐츠 비활성화
        self.db.query(AIGeneratedContent).filter(
            AIGeneratedContent.project_id == project_id,
            AIGeneratedContent.content_type == content_type
        ).update({"is_active": False})
        
        # 새 콘텐츠 저장
        ai_content = AIGeneratedContent(
            project_id=project_id,
            content_type=content_type,
            title=title,
            content=content,
            model_used=model_used,
            source_notes=json.dumps(source_notes),
            generated_by=generated_by,
            is_active=True
        )
        
        self.db.add(ai_content)
        self.db.commit()
        self.db.refresh(ai_content)
        
        return ai_content
```

---

### 11.7 AI API 라우터 (`routers/ai.py`)

```python
# backend/app/routers/ai.py
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel

from app.database import get_db
from app.services.ai_service import AIService
from app.middleware.auth_middleware import get_current_user
from app.models.user import User
from app.config import settings

router = APIRouter()


# ============================================================================
# Request/Response 스키마
# ============================================================================

class SummaryRequest(BaseModel):
    force_regenerate: bool = False


class QASetRequest(BaseModel):
    max_qa_pairs: int = 10


class WriteAssistRequest(BaseModel):
    current_status: Optional[str] = ""
    main_issue: Optional[str] = ""
    next_action: Optional[str] = ""
    assist_type: str = "complete"  # complete/suggest/improve


class CodeAnalysisRequest(BaseModel):
    code: str
    analysis_type: str = "explain"  # explain/review/improve


# ============================================================================
# API 엔드포인트
# ============================================================================

@router.get("/status")
def get_ai_status():
    """AI 기능 활성화 상태 확인"""
    return {
        "enabled": settings.AI_FEATURES_ENABLED,
        "available_models": ["qwen3", "gemma3", "deepseek-r1", "gpt-oss"],
        "default_model": settings.AI_DEFAULT_MODEL
    }


@router.post("/projects/{project_id}/summary")
def generate_summary(
    project_id: int,
    request: SummaryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """과제 코칭노트 AI 요약 생성"""
    if current_user.role not in ["admin", "coach"]:
        raise HTTPException(status_code=403, detail="요약 생성 권한이 없습니다")
    
    if not settings.AI_FEATURES_ENABLED:
        raise HTTPException(status_code=503, detail="AI 기능이 비활성화되어 있습니다")
    
    try:
        service = AIService(db)
        result = service.generate_project_summary(
            project_id=project_id,
            user_id=str(current_user.user_id),
            force_regenerate=request.force_regenerate
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 요약 생성 실패: {str(e)}")


@router.get("/projects/{project_id}/summary")
def get_summary(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """과제 AI 요약 조회"""
    service = AIService(db)
    result = service._get_existing_content(project_id, "summary")
    
    if not result:
        raise HTTPException(status_code=404, detail="생성된 요약이 없습니다")
    
    return result


@router.post("/projects/{project_id}/qa-set")
def generate_qa_set(
    project_id: int,
    request: QASetRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Q&A Set 생성"""
    if current_user.role not in ["admin", "coach"]:
        raise HTTPException(status_code=403, detail="Q&A 생성 권한이 없습니다")
    
    if not settings.AI_FEATURES_ENABLED:
        raise HTTPException(status_code=503, detail="AI 기능이 비활성화되어 있습니다")
    
    try:
        service = AIService(db)
        result = service.generate_qa_set(
            project_id=project_id,
            user_id=str(current_user.user_id),
            max_qa_pairs=request.max_qa_pairs
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Q&A 생성 실패: {str(e)}")


@router.get("/projects/{project_id}/qa-set")
def get_qa_set(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Q&A Set 조회"""
    service = AIService(db)
    result = service._get_existing_content(project_id, "qa_set")
    
    if not result:
        raise HTTPException(status_code=404, detail="생성된 Q&A Set이 없습니다")
    
    # JSON 파싱
    import json
    try:
        result["qa_pairs"] = json.loads(result["content"]).get("qa_pairs", [])
    except:
        result["qa_pairs"] = []
    
    return result


@router.post("/projects/{project_id}/write-assist")
def assist_writing(
    project_id: int,
    request: WriteAssistRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """코칭노트 작성 보조"""
    if current_user.role not in ["admin", "coach"]:
        raise HTTPException(status_code=403, detail="작성 보조 기능은 코치만 사용 가능합니다")
    
    if not settings.AI_FEATURES_ENABLED:
        raise HTTPException(status_code=503, detail="AI 기능이 비활성화되어 있습니다")
    
    try:
        service = AIService(db)
        result = service.assist_note_writing(
            project_id=project_id,
            user_id=str(current_user.user_id),
            partial_content={
                "current_status": request.current_status,
                "main_issue": request.main_issue,
                "next_action": request.next_action
            },
            assist_type=request.assist_type
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"작성 보조 실패: {str(e)}")


@router.post("/code-analysis")
def analyze_code(
    request: CodeAnalysisRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """코드 분석/설명/개선"""
    if current_user.role not in ["admin", "coach"]:
        raise HTTPException(status_code=403, detail="코드 분석 기능은 코치만 사용 가능합니다")
    
    if not settings.AI_FEATURES_ENABLED:
        raise HTTPException(status_code=503, detail="AI 기능이 비활성화되어 있습니다")
    
    if not request.code.strip():
        raise HTTPException(status_code=400, detail="분석할 코드가 없습니다")
    
    try:
        service = AIService(db)
        result = service.analyze_code_snippet(
            code=request.code,
            user_id=str(current_user.user_id),
            analysis_type=request.analysis_type
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"코드 분석 실패: {str(e)}")
```

---

### 11.8 AI 모델 (`models/ai_content.py`)

```python
# backend/app/models/ai_content.py
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class AIGeneratedContent(Base):
    __tablename__ = "ai_generated_contents"

    content_id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.project_id"), nullable=False)
    content_type = Column(String(30), nullable=False)  # summary/qa_set/insight
    title = Column(String(200))
    content = Column(Text, nullable=False)
    model_used = Column(String(50))
    source_notes = Column(Text)  # JSON: [note_id, ...]
    generated_by = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    is_active = Column(Boolean, default=True)

    # Relationships
    project = relationship("Project", back_populates="ai_contents")
    generator = relationship("User")
```

---

### 11.9 main.py 수정 (AI 라우터 추가)

```python
# backend/app/main.py
from app.routers import (
    auth, batches, projects, coaching_notes, documents,
    schedules, sessions, tasks, calendar,
    boards, coaches, notifications,
    dashboard, search, admin, upload,
    ai  # ⭐ AI 라우터 추가
)

# ... 기존 코드 ...

# 라우터 등록
# ... 기존 라우터들 ...
app.include_router(ai.router, prefix="/api/ai", tags=["AI 기능"])  # ⭐ 추가
```

---

### 11.10 API 엔드포인트 추가

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/api/ai/status` | AI 기능 상태 확인 | 전체 |
| POST | `/api/ai/projects/{project_id}/summary` | 코칭노트 요약 생성 | 코치/관리자 |
| GET | `/api/ai/projects/{project_id}/summary` | 요약 조회 | 권한별 |
| POST | `/api/ai/projects/{project_id}/qa-set` | Q&A Set 생성 | 코치/관리자 |
| GET | `/api/ai/projects/{project_id}/qa-set` | Q&A Set 조회 | 권한별 |
| POST | `/api/ai/projects/{project_id}/write-assist` | 작성 보조 | 코치/관리자 |
| POST | `/api/ai/code-analysis` | 코드 분석 | 코치/관리자 |

---

### 11.11 Frontend - AI 기능 통합

#### 11.11.1 AI API 클라이언트 (`api.js` 추가)

```javascript
// frontend/js/api.js - AI API 추가

const aiApi = {
    // AI 기능 상태 확인
    getStatus: () => api.get('/ai/status'),
    
    // 요약 생성
    generateSummary: (projectId, forceRegenerate = false) => 
        api.post(`/ai/projects/${projectId}/summary`, { force_regenerate: forceRegenerate }),
    
    // 요약 조회
    getSummary: (projectId) => 
        api.get(`/ai/projects/${projectId}/summary`),
    
    // Q&A Set 생성
    generateQASet: (projectId, maxPairs = 10) => 
        api.post(`/ai/projects/${projectId}/qa-set`, { max_qa_pairs: maxPairs }),
    
    // Q&A Set 조회
    getQASet: (projectId) => 
        api.get(`/ai/projects/${projectId}/qa-set`),
    
    // 작성 보조
    assistWriting: (projectId, content, assistType = 'complete') => 
        api.post(`/ai/projects/${projectId}/write-assist`, {
            current_status: content.currentStatus || '',
            main_issue: content.mainIssue || '',
            next_action: content.nextAction || '',
            assist_type: assistType
        }),
    
    // 코드 분석
    analyzeCode: (code, analysisType = 'explain') => 
        api.post('/ai/code-analysis', { code, analysis_type: analysisType })
};

export { api, coachingNoteApi, projectApi, taskApi, calendarApi, dashboardApi, aiApi };
```

#### 11.11.2 과제 기본 정보 화면 - AI 요약 표시

```javascript
// frontend/js/pages/projectDetail.js - AI 요약 섹션 추가

async renderAISummary() {
    const summarySection = document.getElementById('ai-summary-section');
    
    try {
        const summary = await aiApi.getSummary(this.projectId);
        
        summarySection.innerHTML = `
            <div class="ai-summary-card">
                <div class="ai-summary-header">
                    <h4>🤖 AI 핵심 요약</h4>
                    <span class="ai-meta">
                        ${summary.model_used} | ${formatDateTime(summary.created_at)}
                    </span>
                    <button class="btn btn-sm btn-secondary" id="btn-regenerate-summary">
                        🔄 재생성
                    </button>
                </div>
                <div class="ai-summary-content">
                    ${this.formatMarkdown(summary.content)}
                </div>
            </div>
        `;
        
        document.getElementById('btn-regenerate-summary')?.addEventListener('click', 
            () => this.regenerateSummary());
            
    } catch (error) {
        // 요약이 없는 경우
        summarySection.innerHTML = `
            <div class="ai-summary-empty">
                <p>아직 생성된 AI 요약이 없습니다.</p>
                <button class="btn btn-primary" id="btn-generate-summary">
                    🤖 AI 요약 생성
                </button>
            </div>
        `;
        
        document.getElementById('btn-generate-summary')?.addEventListener('click', 
            () => this.generateSummary());
    }
}

async generateSummary() {
    const btn = document.getElementById('btn-generate-summary');
    btn.disabled = true;
    btn.textContent = '⏳ 생성 중...';
    
    try {
        await aiApi.generateSummary(this.projectId);
        await this.renderAISummary();
    } catch (error) {
        alert('요약 생성 실패: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '🤖 AI 요약 생성';
    }
}
```

#### 11.11.3 코칭노트 작성 화면 - AI 작성 보조

```javascript
// frontend/js/pages/coachingNote.js - AI 작성 보조 추가

renderNoteForm() {
    return `
        <form id="note-form">
            <!-- 기존 필드들 -->
            <div class="form-group">
                <label for="current-status">📍 현재 과제 진행 상태</label>
                <textarea id="current-status" rows="3"></textarea>
                <button type="button" class="btn btn-sm btn-ai" data-field="current_status">
                    🤖 AI 제안
                </button>
            </div>
            
            <div class="form-group">
                <label for="main-issue">⚠️ 당면한 문제</label>
                <textarea id="main-issue" rows="3"></textarea>
                <button type="button" class="btn btn-sm btn-ai" data-field="main_issue">
                    🤖 AI 제안
                </button>
            </div>
            
            <div class="form-group">
                <label for="next-action">▶️ 다음 작업</label>
                <textarea id="next-action" rows="3"></textarea>
                <button type="button" class="btn btn-sm btn-ai" data-field="next_action">
                    🤖 AI 제안
                </button>
            </div>
            
            <!-- AI 전체 제안 버튼 -->
            <div class="ai-assist-panel">
                <button type="button" class="btn btn-secondary" id="btn-ai-suggest">
                    🤖 AI 작성 제안 받기
                </button>
            </div>
            
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" id="btn-cancel">취소</button>
                <button type="submit" class="btn btn-primary">저장</button>
            </div>
        </form>
    `;
}

bindAIAssistEvents() {
    // 개별 필드 AI 제안
    document.querySelectorAll('.btn-ai').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const field = e.target.dataset.field;
            await this.getFieldSuggestion(field);
        });
    });
    
    // 전체 제안
    document.getElementById('btn-ai-suggest')?.addEventListener('click', 
        () => this.getAISuggestion());
}

async getAISuggestion() {
    const btn = document.getElementById('btn-ai-suggest');
    btn.disabled = true;
    btn.textContent = '⏳ AI 분석 중...';
    
    const content = {
        currentStatus: document.getElementById('current-status').value,
        mainIssue: document.getElementById('main-issue').value,
        nextAction: document.getElementById('next-action').value
    };
    
    try {
        const result = await aiApi.assistWriting(this.projectId, content, 'suggest');
        this.showAISuggestionModal(result.suggestion);
    } catch (error) {
        alert('AI 제안 실패: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '🤖 AI 작성 제안 받기';
    }
}

showAISuggestionModal(suggestion) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>🤖 AI 작성 제안</h3>
                <button class="btn-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="ai-suggestion-content">
                    ${this.formatMarkdown(suggestion)}
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary btn-close-modal">닫기</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelectorAll('.btn-close, .btn-close-modal').forEach(btn => {
        btn.addEventListener('click', () => modal.remove());
    });
}
```

#### 11.11.4 코칭 의견 - 코드 분석 기능

```javascript
// frontend/js/pages/coachingNote.js - 코드 분석 추가

renderCommentForm(noteId) {
    return `
        <div class="comment-form">
            <textarea id="comment-content" placeholder="코칭 의견을 작성하세요..."></textarea>
            
            <div class="code-input-section">
                <label>
                    <input type="checkbox" id="has-code"> 코드 포함
                </label>
                <div id="code-section" class="hidden">
                    <textarea id="code-snippet" placeholder="참조 코드를 입력하세요..."></textarea>
                    <div class="code-ai-buttons">
                        <button type="button" class="btn btn-sm" data-action="explain">
                            🤖 설명
                        </button>
                        <button type="button" class="btn btn-sm" data-action="review">
                            🤖 리뷰
                        </button>
                        <button type="button" class="btn btn-sm" data-action="improve">
                            🤖 개선안
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="comment-options">
                <label>
                    <input type="checkbox" id="is-coach-only"> 코치 전용 (참여자에게 비공개)
                </label>
            </div>
            
            <button type="button" class="btn btn-primary" id="btn-submit-comment">
                의견 등록
            </button>
        </div>
    `;
}

bindCodeAnalysisEvents() {
    document.querySelectorAll('.code-ai-buttons button').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const action = e.target.dataset.action;
            const code = document.getElementById('code-snippet').value;
            
            if (!code.trim()) {
                alert('분석할 코드를 입력해주세요.');
                return;
            }
            
            await this.analyzeCode(code, action);
        });
    });
}

async analyzeCode(code, analysisType) {
    const buttons = document.querySelectorAll('.code-ai-buttons button');
    buttons.forEach(btn => btn.disabled = true);
    
    try {
        const result = await aiApi.analyzeCode(code, analysisType);
        this.showCodeAnalysisResult(result, analysisType);
    } catch (error) {
        alert('코드 분석 실패: ' + error.message);
    } finally {
        buttons.forEach(btn => btn.disabled = false);
    }
}

showCodeAnalysisResult(result, type) {
    const typeLabels = {
        explain: '코드 설명',
        review: '코드 리뷰',
        improve: '개선안'
    };
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content modal-lg">
            <div class="modal-header">
                <h3>🤖 ${typeLabels[type]}</h3>
                <span class="ai-model-badge">${result.model_used}</span>
                <button class="btn-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="ai-analysis-result">
                    ${this.formatMarkdown(result.result)}
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="btn-copy-result">📋 복사</button>
                <button class="btn btn-primary" id="btn-apply-result">의견에 추가</button>
                <button class="btn btn-secondary btn-close-modal">닫기</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // 복사
    modal.querySelector('#btn-copy-result')?.addEventListener('click', () => {
        navigator.clipboard.writeText(result.result);
        alert('복사되었습니다.');
    });
    
    // 의견에 추가
    modal.querySelector('#btn-apply-result')?.addEventListener('click', () => {
        const commentContent = document.getElementById('comment-content');
        commentContent.value += `\n\n[AI ${typeLabels[type]}]\n${result.result}`;
        modal.remove();
    });
    
    modal.querySelectorAll('.btn-close, .btn-close-modal').forEach(btn => {
        btn.addEventListener('click', () => modal.remove());
    });
}
```

---

### 11.12 환경 변수 추가 (`.env.example`)

```env
# ... 기존 설정 ...

# AI 설정
OPENAI_API_KEY=your_openai_api_key
AI_CREDENTIAL_KEY=your_credential_key
AI_SYSTEM_NAME=SSP_COACHING

# 모델별 Base URL
AI_MODEL_QWEN3_URL=https://model1.openai.com/v1
AI_MODEL_GEMMA3_URL=https://model2.openai.com/v1
AI_MODEL_DEEPSEEK_URL=https://model3.openai.com/v1
AI_MODEL_GPT_OSS_URL=https://model4.openai.com/v1

# 용도별 기본 모델
AI_DEFAULT_MODEL=qwen3
AI_SUMMARY_MODEL=gpt-oss
AI_QA_MODEL=qwen3
AI_CODE_MODEL=deepseek-r1

# AI 기능 활성화
AI_FEATURES_ENABLED=True
```

---

### 11.13 의존성 추가 (`requirements.txt`)

```
# ... 기존 패키지 ...

# AI/LangChain
langchain>=0.1.0
langchain-openai>=0.0.5
tiktoken>=0.5.2
```

---

### 11.14 화면 와이어프레임 - AI 기능

#### 11.14.1 과제 기본 정보 - AI 요약 섹션

```
┌─────────────────────────────────────────────────────────────────┐
│  📄 과제 기본 정보                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  과제명: 불량 예측 모델                                         │
│  조직: 메모리사업부 | 대표자: 홍길동 | 분류: 예측               │
│  진행률: ████████████░░░░░░  65%                                │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🤖 AI 핵심 요약                     gpt-oss | 2026-03-15│   │
│  │                                          [🔄 재생성]    │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │                                                         │   │
│  │ **1. 과제 개요**                                        │   │
│  │ 메모리 제조 공정의 불량률 예측을 위한 ML 모델 개발      │   │
│  │ 프로젝트로, 현재 1차 모델 학습을 완료하고 최적화...     │   │
│  │                                                         │   │
│  │ **2. 주요 진행 경과**                                   │   │
│  │ • Week 1-2: 데이터 수집 및 EDA 완료                     │   │
│  │ • Week 3: 데이터 전처리 파이프라인 구축                 │   │
│  │ • Week 4-5: 베이스라인 모델 학습 및 평가                │   │
│  │                                                         │   │
│  │ **3. 핵심 기술 이슈**                                   │   │
│  │ • GPU 메모리 부족 → Gradient Checkpointing 적용         │   │
│  │ • 클래스 불균형 → SMOTE + Focal Loss 조합               │   │
│  │ ...                                                     │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [📋 Q&A Set 보기]  [🤖 Q&A Set 생성]                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 11.14.2 코칭노트 작성 - AI 보조

```
┌─────────────────────────────────────────────────────────────────┐
│  📓 코칭노트 작성                                         [✕]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  코칭 날짜: [2026-03-18]    주차: [5]    진행률: [65]%         │
│                                                                 │
│  📍 현재 과제 진행 상태                          [🤖 AI 제안]  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1차 모델 학습 완료, 검증 데이터 기준 F1 Score 0.82     │   │
│  │ 달성. 하이퍼파라미터 튜닝 진행 중...                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ⚠️ 당면한 문제                                  [🤖 AI 제안]  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 특정 불량 유형(Type-C)에서 Recall이 낮음 (0.65)        │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ▶️ 다음 작업                                    [🤖 AI 제안]  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Type-C 샘플 추가 수집 및 클래스 가중치 조정 실험       │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │        [🤖 AI 작성 제안 받기]                           │   │
│  │   이전 코칭 기록을 바탕으로 작성 내용을 제안받습니다    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│                                        [취소]  [저장]          │
└─────────────────────────────────────────────────────────────────┘
```

#### 11.14.3 코칭 의견 - 코드 분석

```
┌─────────────────────────────────────────────────────────────────┐
│  💬 코칭 의견 작성                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  의견 내용:                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Focal Loss 적용 시 gamma 파라미터를 2.0으로 설정하면    │   │
│  │ Type-C 불량에 대한 Recall이 개선될 수 있습니다.         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [✓] 코드 포함                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ class FocalLoss(nn.Module):                             │   │
│  │     def __init__(self, gamma=2.0, alpha=0.25):          │   │
│  │         super().__init__()                              │   │
│  │         self.gamma = gamma                              │   │
│  │         self.alpha = alpha                              │   │
│  │     ...                                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [🤖 설명]  [🤖 리뷰]  [🤖 개선안]                             │
│                                                                 │
│  [ ] 코치 전용 (참여자에게 비공개)                              │
│                                                                 │
│                                              [의견 등록]        │
└─────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────┐
│  🤖 코드 설명                              deepseek-r1    [✕]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ## Focal Loss 클래스 설명                                      │
│                                                                 │
│  이 코드는 클래스 불균형 문제를 해결하기 위한 Focal Loss를      │
│  구현한 것입니다.                                               │
│                                                                 │
│  ### 주요 파라미터                                              │
│  - **gamma (2.0)**: 쉬운 샘플의 가중치를 줄이는 조절 인자       │
│    - gamma가 클수록 어려운 샘플에 더 집중                       │
│  - **alpha (0.25)**: 클래스별 가중치 밸런싱 인자                │
│                                                                 │
│  ### 작동 원리                                                  │
│  1. 예측 확률 p에서 (1-p)^gamma를 곱하여...                     │
│  ...                                                            │
│                                                                 │
│                    [📋 복사]  [의견에 추가]  [닫기]             │
└─────────────────────────────────────────────────────────────────┘
```

---

### 11.15 CSS - AI 관련 스타일

```css
/* frontend/css/ai.css */

/* AI 요약 카드 */
.ai-summary-card {
    background: linear-gradient(135deg, #f5f7fa 0%, #e8f4f8 100%);
    border: 1px solid #e0e7ff;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 24px;
}

.ai-summary-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid #e0e7ff;
}

.ai-summary-header h4 {
    margin: 0;
    color: #4338ca;
}

.ai-meta {
    font-size: 12px;
    color: #6b7280;
    margin-left: auto;
}

.ai-summary-content {
    line-height: 1.8;
    color: #374151;
}

.ai-summary-content h1,
.ai-summary-content h2,
.ai-summary-content h3 {
    color: #4338ca;
    margin-top: 16px;
}

.ai-summary-content ul {
    padding-left: 20px;
}

.ai-summary-content li {
    margin-bottom: 8px;
}

/* AI 버튼 */
.btn-ai {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
    border: none;
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
}

.btn-ai:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

.btn-ai:disabled {
    background: #9ca3af;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
}

/* AI 어시스트 패널 */
.ai-assist-panel {
    background: #f0f9ff;
    border: 1px dashed #60a5fa;
    border-radius: 8px;
    padding: 16px;
    margin: 16px 0;
    text-align: center;
}

/* AI 모델 뱃지 */
.ai-model-badge {
    background: #e0e7ff;
    color: #4338ca;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
}

/* AI 분석 결과 */
.ai-analysis-result {
    background: #f9fafb;
    border-radius: 8px;
    padding: 20px;
    max-height: 400px;
    overflow-y: auto;
    line-height: 1.7;
}

.ai-analysis-result pre {
    background: #1f2937;
    color: #f3f4f6;
    padding: 16px;
    border-radius: 8px;
    overflow-x: auto;
}

.ai-analysis-result code {
    font-family: 'Consolas', 'Monaco', monospace;
}

/* 코드 AI 버튼 그룹 */
.code-ai-buttons {
    display: flex;
    gap: 8px;
    margin-top: 8px;
}

.code-ai-buttons button {
    flex: 1;
    padding: 6px 12px;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
}

.code-ai-buttons button:hover {
    background: #e0e7ff;
    border-color: #6366f1;
}

/* AI 제안 모달 */
.ai-suggestion-content {
    background: #fffbeb;
    border-left: 4px solid #f59e0b;
    padding: 16px;
    border-radius: 0 8px 8px 0;
    line-height: 1.7;
}

/* Q&A Set 카드 */
.qa-set-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.qa-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 16px;
    transition: all 0.2s;
}

.qa-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.qa-category {
    display: inline-block;
    padding: 2px 8px;
    background: #e0e7ff;
    color: #4338ca;
    border-radius: 4px;
    font-size: 12px;
    margin-bottom: 8px;
}

.qa-question {
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 8px;
}

.qa-answer {
    color: #4b5563;
    line-height: 1.6;
}

.qa-keywords {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    flex-wrap: wrap;
}

.qa-keyword {
    padding: 2px 8px;
    background: #f3f4f6;
    color: #6b7280;
    border-radius: 4px;
    font-size: 11px;
}

/* 로딩 상태 */
.ai-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px;
    color: #6b7280;
}

.ai-loading::before {
    content: '';
    width: 24px;
    height: 24px;
    border: 3px solid #e5e7eb;
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}
```

---

### 11.16 개발 일정 업데이트

| Phase | 주차 | AI 관련 작업 |
|-------|------|--------------|
| Phase 2 | 3주차 | AI 클라이언트 구현, 요약 생성 API |
| Phase 2 | 3주차 | Q&A Set 생성 API |
| Phase 2 | 3주차 | 과제 상세 화면 AI 요약 표시 |
| Phase 3 | 4주차 | 코칭노트 작성 보조 기능 |
| Phase 3 | 4주차 | 코드 분석 기능 |
| 추후 | - | 자연어 검색 |
| 추후 | - | 패턴 분석/인사이트 |

---