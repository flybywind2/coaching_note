"""FastAPI 애플리케이션 진입점. 미들웨어, API 라우터, 정적 프론트엔드 서빙을 등록합니다."""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from app.config import settings
from app.database import Base, engine
import app.models  # noqa: F401 - 모델 import로 metadata 등록
from app.routers import (
    auth, batches, projects, coaching_notes, documents,
    sessions, schedules, boards, notifications, calendar, dashboard, ai, tasks,
    admin_ip, users, uploads, workspace, about, coaching_plan, attendance, project_research, surveys, lectures,
)

app = FastAPI(
    title="SSP+ 코칭노트 관리 시스템",
    description="AI 활용 과제 코칭 프로그램의 지식/노하우를 구조화하는 시스템",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all routers
app.include_router(auth.router)
app.include_router(batches.router)
app.include_router(projects.router)
app.include_router(coaching_notes.router)
app.include_router(documents.router)
app.include_router(sessions.router)
app.include_router(schedules.router)
app.include_router(boards.router)
app.include_router(notifications.router)
app.include_router(calendar.router)
app.include_router(dashboard.router)
app.include_router(ai.router)
app.include_router(tasks.router)
app.include_router(admin_ip.router)
app.include_router(users.router)
app.include_router(uploads.router)
app.include_router(workspace.router)
app.include_router(about.router)
app.include_router(coaching_plan.router)
app.include_router(attendance.router)
app.include_router(project_research.router)
app.include_router(surveys.router)
app.include_router(lectures.router)


@app.on_event("startup")
def ensure_schema():
    # 신규 기능 배포 시 누락된 테이블을 자동 생성합니다.
    Base.metadata.create_all(bind=engine)
    if "sqlite" not in settings.DATABASE_URL:
        return
    with engine.begin() as conn:
        rows = conn.execute(text("PRAGMA table_info(batch)")).fetchall()
        columns = {str(row[1]) for row in rows}
        if "coaching_start_date" not in columns:
            conn.execute(text("ALTER TABLE batch ADD COLUMN coaching_start_date DATE"))
            conn.execute(text("UPDATE batch SET coaching_start_date = start_date WHERE coaching_start_date IS NULL"))
        project_rows = conn.execute(text("PRAGMA table_info(projects)")).fetchall()
        project_columns = {str(row[1]) for row in project_rows}
        if "project_type" not in project_columns:
            conn.execute(text("ALTER TABLE projects ADD COLUMN project_type VARCHAR(20)"))
            conn.execute(text("UPDATE projects SET project_type = 'primary' WHERE project_type IS NULL OR project_type = ''"))
        coach_rows = conn.execute(text("PRAGMA table_info(coach)")).fetchall()
        coach_columns = {str(row[1]) for row in coach_rows}
        if "batch_id" not in coach_columns:
            conn.execute(text("ALTER TABLE coach ADD COLUMN batch_id INTEGER"))
        if "is_visible" not in coach_columns:
            conn.execute(text("ALTER TABLE coach ADD COLUMN is_visible BOOLEAN"))
            conn.execute(text("UPDATE coach SET is_visible = 1 WHERE is_visible IS NULL"))
        if "display_order" not in coach_columns:
            conn.execute(text("ALTER TABLE coach ADD COLUMN display_order INTEGER"))
            conn.execute(text("UPDATE coach SET display_order = coach_id WHERE display_order IS NULL"))
        if "layout_column" not in coach_columns:
            conn.execute(text("ALTER TABLE coach ADD COLUMN layout_column VARCHAR(10)"))
            conn.execute(text("UPDATE coach SET layout_column = 'left' WHERE layout_column IS NULL OR layout_column = ''"))
        schedule_rows = conn.execute(text("PRAGMA table_info(program_schedule)")).fetchall()
        schedule_columns = {str(row[1]) for row in schedule_rows}
        if "color" not in schedule_columns:
            conn.execute(text("ALTER TABLE program_schedule ADD COLUMN color VARCHAR(20)"))
            conn.execute(text("UPDATE program_schedule SET color = '#4CAF50' WHERE color IS NULL OR color = ''"))
        if "repeat_group_id" not in schedule_columns:
            conn.execute(text("ALTER TABLE program_schedule ADD COLUMN repeat_group_id VARCHAR(64)"))
        if "repeat_sequence" not in schedule_columns:
            conn.execute(text("ALTER TABLE program_schedule ADD COLUMN repeat_sequence INTEGER"))
        if "visibility_scope" not in schedule_columns:
            conn.execute(text("ALTER TABLE program_schedule ADD COLUMN visibility_scope VARCHAR(20)"))
            conn.execute(text(
                "UPDATE program_schedule "
                "SET visibility_scope = CASE "
                "WHEN schedule_type = 'coaching' THEN 'coaching' "
                "ELSE 'global' END "
                "WHERE visibility_scope IS NULL OR visibility_scope = ''"
            ))
        coaching_plan_rows = conn.execute(text("PRAGMA table_info(coach_daily_plan)")).fetchall()
        coaching_plan_columns = {str(row[1]) for row in coaching_plan_rows}
        if "is_all_day" not in coaching_plan_columns:
            conn.execute(text("ALTER TABLE coach_daily_plan ADD COLUMN is_all_day BOOLEAN"))
            conn.execute(text("UPDATE coach_daily_plan SET is_all_day = 1 WHERE is_all_day IS NULL"))
        ai_content_rows = conn.execute(text("PRAGMA table_info(ai_generated_content)")).fetchall()
        ai_content_columns = {str(row[1]) for row in ai_content_rows}
        if "week_number" not in ai_content_columns:
            conn.execute(text("ALTER TABLE ai_generated_content ADD COLUMN week_number INTEGER"))
        board_post_rows = conn.execute(text("PRAGMA table_info(board_post)")).fetchall()
        board_post_columns = {str(row[1]) for row in board_post_rows}
        if "batch_id" not in board_post_columns:
            conn.execute(text("ALTER TABLE board_post ADD COLUMN batch_id INTEGER"))
        if "is_batch_private" not in board_post_columns:
            conn.execute(text("ALTER TABLE board_post ADD COLUMN is_batch_private BOOLEAN"))
            conn.execute(text("UPDATE board_post SET is_batch_private = 0 WHERE is_batch_private IS NULL"))


@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "SSP+ 코칭노트 관리 시스템"}


# Static file serving for uploads
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# Serve frontend static files
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")


