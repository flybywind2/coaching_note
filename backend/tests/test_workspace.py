"""Test Workspace 동작과 회귀 시나리오를 검증하는 자동화 테스트입니다."""

from datetime import date, timedelta

import pytest

from app.models.board import Board, BoardPost
from app.models.coaching_note import CoachingNote
from app.models.project import Project, ProjectMember
from app.models.session import CoachingSession
from app.models.task import ProjectTask
from tests.conftest import auth_headers


@pytest.fixture
def workspace_data(db, seed_batch, seed_users):
    coach = seed_users["coach"]
    participant = seed_users["participant"]

    public_project = Project(
        batch_id=seed_batch.batch_id,
        project_name="공개 과제",
        organization="Org",
        visibility="public",
        status="in_progress",
    )
    restricted_member_project = Project(
        batch_id=seed_batch.batch_id,
        project_name="멤버 제한 과제",
        organization="Org",
        visibility="restricted",
        status="in_progress",
    )
    restricted_hidden_project = Project(
        batch_id=seed_batch.batch_id,
        project_name="비공개 숨김 과제",
        organization="Org",
        visibility="restricted",
        status="preparing",
    )
    db.add_all([public_project, restricted_member_project, restricted_hidden_project])
    db.commit()
    db.refresh(public_project)
    db.refresh(restricted_member_project)
    db.refresh(restricted_hidden_project)

    db.add(
        ProjectMember(
            project_id=restricted_member_project.project_id,
            user_id=participant.user_id,
            role="member",
            is_representative=False,
        )
    )
    db.commit()

    db.add_all(
        [
            ProjectTask(
                project_id=public_project.project_id,
                assigned_to=participant.user_id,
                title="오늘 마감 개인 Task",
                due_date=date.today(),
                status="todo",
                priority="high",
                created_by=coach.user_id,
            ),
            ProjectTask(
                project_id=public_project.project_id,
                assigned_to=coach.user_id,
                title="다른 사용자 Task",
                due_date=date.today(),
                status="todo",
                priority="medium",
                created_by=coach.user_id,
            ),
        ]
    )
    db.commit()

    db.add_all(
        [
            CoachingNote(
                project_id=public_project.project_id,
                author_id=coach.user_id,
                coaching_date=date.today(),
                current_status="공개 검색키워드",
                main_issue="공개 이슈",
                next_action="공개 액션",
            ),
            CoachingNote(
                project_id=restricted_hidden_project.project_id,
                author_id=coach.user_id,
                coaching_date=date.today(),
                current_status="비밀 검색키워드",
                main_issue="비밀 이슈",
                next_action="비밀 액션",
            ),
        ]
    )
    db.commit()

    db.add(
        CoachingSession(
            batch_id=seed_batch.batch_id,
            project_id=public_project.project_id,
            session_date=date.today() + timedelta(days=1),
            start_time="09:00",
            end_time="10:00",
            location="A회의실",
            session_status="scheduled",
            created_by=coach.user_id,
        )
    )
    db.commit()

    board = Board(board_name="검색 테스트", board_type="chat")
    db.add(board)
    db.commit()
    db.refresh(board)
    db.add(
        BoardPost(
            board_id=board.board_id,
            author_id=coach.user_id,
            title="게시글 검색키워드",
            content="게시글 본문 검색키워드",
        )
    )
    db.commit()

    return {
        "batch_id": seed_batch.batch_id,
        "participant_id": participant.user_id,
        "coach_id": coach.user_id,
    }


def test_home_returns_personal_todos(client, seed_users, workspace_data):
    headers = auth_headers(client, "user001")
    resp = client.get(f"/api/home?batch_id={workspace_data['batch_id']}", headers=headers)
    assert resp.status_code == 200

    data = resp.json()
    assert "today_tasks" in data
    assert len(data["today_tasks"]) == 1
    assert data["today_tasks"][0]["title"] == "오늘 마감 개인 Task"


def test_search_includes_restricted_project_note_for_participant(client, seed_users, workspace_data):
    headers = auth_headers(client, "user001")
    resp = client.get("/api/search?q=비밀%20검색키워드&types=note", headers=headers)
    assert resp.status_code == 200

    rows = resp.json()["results"]
    assert len(rows) == 1


def test_search_supports_author_filter(client, seed_users, workspace_data):
    headers = auth_headers(client, "admin001")
    resp = client.get(
        f"/api/search?q=게시글%20검색키워드&types=board&author_id={workspace_data['coach_id']}",
        headers=headers,
    )
    assert resp.status_code == 200
    rows = resp.json()["results"]
    assert len(rows) >= 1
    assert rows[0]["type"] == "board"
