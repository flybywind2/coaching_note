"""FastAPI 애플리케이션 진입점. 미들웨어, API 라우터, 정적 프론트엔드 서빙을 등록합니다."""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.config import settings
from app.routers import (
    auth, batches, projects, coaching_notes, documents,
    sessions, schedules, boards, notifications, calendar, dashboard, ai, tasks,
    admin_ip, users, uploads,
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


