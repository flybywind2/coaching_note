# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SSP+ 코칭노트 관리 시스템** — A coaching note management system for AI-assisted project coaching programs. The system structures coaching knowledge/know-how into reusable organizational assets.

> **Current state**: The repository contains only `info.md`, a full design specification. Implementation has not started yet.

## Tech Stack

- **Backend**: Python 3.11+ with FastAPI, Uvicorn (ASGI), SQLAlchemy ORM
- **Frontend**: Vanilla JavaScript (SPA), HTML5, CSS3 — no framework
- **Database**: SQLite (dev/initial) → MYSQL (production)
- **Auth**: SSO integration (internal company accounts)
- **Config**: `pydantic-settings` via `.env` file

## Development Commands

```bash
# Install dependencies (from backend/)
pip install -r requirements.txt

# Run development server (from backend/)
uvicorn app.main:app --reload

# Health check
curl http://localhost:8000/api/health

# Database initialization
python scripts/init_db.py

# Seed test data
python scripts/seed_data.py

# Database migrations (Alembic)
alembic revision --autogenerate -m "description"
alembic upgrade head

# Run tests
pytest tests/
pytest tests/test_auth.py          # single test file
pytest tests/ -k "test_create"     # single test by name pattern
```

## Architecture

### Backend Structure (`backend/app/`)

```
main.py         # FastAPI app entry point — registers all routers
config.py       # Settings via pydantic-settings, reads from .env
database.py     # SQLAlchemy engine + SessionLocal + get_db() dependency
models/         # SQLAlchemy ORM models (one file per domain entity)
schemas/        # Pydantic request/response models (mirrors models/ structure)
routers/        # FastAPI route handlers (thin — delegate to services)
services/       # Business logic layer (CoachingService, TaskService, etc.)
middleware/     # auth_middleware.py: get_current_user(), require_roles()
utils/          # permissions.py, helpers.py
```

**Layering rule**: Routers call Services; Services own business logic and DB queries. Routers do not query the DB directly.

### Frontend Structure (`frontend/`)

```
index.html          # Single HTML entry point (SPA)
js/app.js           # Main app bootstrap
js/router.js        # Client-side SPA routing
js/api.js           # All fetch() calls to backend REST API
js/auth.js          # Token storage and auth state
js/state.js         # Global state management
js/pages/           # One file per page/view
js/components/      # Reusable UI components (header, modal, pagination, etc.)
js/utils/           # formatter.js, validator.js
css/                # style.css (global), components.css, calendar.css, dashboard.css
```

### Domain Model

The central hierarchy is: **Batch (차수)** → **Project (과제)** → {CoachingNote, ProjectDocument, CoachingSession, ProjectTask}

Key entities and their DB table names:
| Model | Table |
|---|---|
| User | `users` |
| Batch | `batch` |
| Project | `projects` |
| ProjectMember | `project_member` |
| Coach | `coach` |
| CoachingNote | `coaching_notes` |
| CoachingComment | `coaching_comments` |
| ProjectDocument | `project_document` |
| CoachingSession | `coaching_session` |
| SessionAttendee | `session_attendee` |
| ProjectTask | `project_tasks` |
| ProgramSchedule | `program_schedule` |
| Board / BoardPost / PostComment | `board` / `board_post` / `post_comment` |
| Notification | `notification` |

### Role-Based Access

Four user roles: `admin`, `coach`, `participant`, `observer`

Key permission rules enforced in services/routers:
- Coaching notes: write restricted to `admin` and `coach` only
- `is_coach_only` comments are hidden from `participant` and `observer`
- Project visibility: `public` or `restricted` — affects what observers/participants can see
- Dashboard and session assignment: `admin` / `coach` only
- Admin menu: `admin` only

### Progress Calculation

`project.progress_rate` is auto-calculated from milestone completion. `TaskService._calculate_milestone_progress()` computes this from `ProjectTask` rows where `is_milestone=True`, ordered by `milestone_order`.

### Calendar API

`GET /api/calendar` aggregates three event types into a unified response:
- `program` — from `ProgramSchedule`
- `session` — from `CoachingSession`
- `milestone` / `task` — from `ProjectTask`

Each event has a color code: program=`#4CAF50`, session=`#2196F3`, milestone=`#9C27B0`.

## Key Configuration

`.env` (copy from `.env.example`):
```
DATABASE_URL=sqlite:///./ssp_coaching.db
SECRET_KEY=your-secret-key
DEBUG=True
ALLOWED_ORIGINS=["http://localhost:3000"]
```

`MAX_UPLOAD_SIZE` = 50 MB. Allowed extensions: jpg, jpeg, png, gif, pdf, ppt/x, xls/x, csv. Uploaded files are served statically from `/uploads`.

## Full Design Spec

All detailed requirements, ERD, API specs, wireframes, and sample code are in `info.md`.

### LLM API Sample

```python
import uuid
from langchain_openai import ChatOpenAI
import os

os.environ["OPENAI_API_KEY"] = "your_openai_api_key"
model1_base_url = "https://model1.openai.com/v1"
model2_base_url = "https://model2.openai.com/v1"
model3_base_url = "https://model3.openai.com/v1"
model4_base_url = "https://model4.openai.com/v1"


model1 = "qwen3"
model2 = "gemma3"
model3 = "deepseek-r1"
model4 = "gpt-oss"

credential_key = "your_credential_key"

llm = ChatOpenAI(
    base_url=model1_base_url,
    model=model1,
    default_headers={
        "x-dep-ticket": credential_key,
        "Send-System-Name": "System_Name",
        "User-ID": "ID",
        "User-Type": "AD",
        "Prompt-Msg-Id": str(uuid.uuid4()),
        "Completion-Msg-Id": str(uuid.uuid4()),
    },
)

print(llm.invoke("Hello, how are you?"))
```