"""Seed the database with test data."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import date, datetime
from app.database import SessionLocal, engine, Base
import app.models  # noqa: F401

from app.models.user import User, Coach
from app.models.batch import Batch
from app.models.project import Project, ProjectMember
from app.models.board import Board
from app.models.task import ProjectTask


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            print("Database already seeded. Skipping.")
            return

        # Users
        users = [
            User(emp_id="admin001", name="관리자 김철수", department="HR팀", role="admin", email="admin@company.com"),
            User(emp_id="coach001", name="코치 이영희", department="IT전략팀", role="coach", email="coach1@company.com"),
            User(emp_id="coach002", name="코치 박민준", department="기획팀", role="coach", email="coach2@company.com"),
            User(emp_id="user001", name="참여자 정수연", department="개발팀", role="participant", email="user1@company.com"),
            User(emp_id="user002", name="참여자 최동현", department="마케팅팀", role="participant", email="user2@company.com"),
            User(emp_id="obs001", name="참관자 한지민", department="기획팀", role="observer", email="obs1@company.com"),
        ]
        db.add_all(users)
        db.flush()

        # Coach profiles
        coaches = [
            Coach(user_id=users[1].user_id, name="이영희", coach_type="internal",
                  department="IT전략팀", specialty="AI/데이터 분석"),
            Coach(user_id=users[2].user_id, name="박민준", coach_type="internal",
                  department="기획팀", specialty="프로세스 혁신"),
            Coach(user_id=None, name="외부 코치 김성훈", coach_type="external",
                  affiliation="컨설팅 A사", specialty="디지털 전환", career="10년 경력"),
        ]
        db.add_all(coaches)
        db.flush()

        # Batch
        batch = Batch(
            batch_name="2026년 1차",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 6, 30),
            status="ongoing",
        )
        db.add(batch)
        db.flush()

        # Projects
        projects = [
            Project(batch_id=batch.batch_id, project_name="AI 기반 고객 상담 자동화",
                    organization="고객서비스팀", representative="정수연", category="AI/자동화",
                    visibility="public", status="in_progress"),
            Project(batch_id=batch.batch_id, project_name="데이터 기반 마케팅 최적화",
                    organization="마케팅팀", representative="최동현", category="데이터분석",
                    visibility="public", status="preparing"),
            Project(batch_id=batch.batch_id, project_name="사내 프로세스 디지털화",
                    organization="운영팀", representative="박민준", category="프로세스",
                    visibility="restricted", status="preparing"),
        ]
        db.add_all(projects)
        db.flush()

        # Project members
        memberships = [
            ProjectMember(project_id=projects[0].project_id, user_id=users[3].user_id,
                          role="leader", is_representative=True),
            ProjectMember(project_id=projects[1].project_id, user_id=users[4].user_id,
                          role="leader", is_representative=True),
        ]
        db.add_all(memberships)

        # Boards
        boards = [
            Board(board_name="공지사항", board_type="notice", description="프로그램 공지사항"),
            Board(board_name="질문", board_type="question", description="질문과 답변"),
            Board(board_name="팁공유", board_type="tip", description="운영/기술 팁 공유"),
            Board(board_name="잡담", board_type="chat", description="자유롭게 소통하는 공간"),
        ]
        db.add_all(boards)

        # Milestones for project 1
        milestones = [
            ProjectTask(project_id=projects[0].project_id, title="요구사항 정의",
                        is_milestone=True, milestone_order=1, status="completed",
                        created_by=users[0].user_id, due_date=date(2026, 2, 1),
                        completed_at=datetime(2026, 2, 1)),
            ProjectTask(project_id=projects[0].project_id, title="프로토타입 개발",
                        is_milestone=True, milestone_order=2, status="in_progress",
                        created_by=users[0].user_id, due_date=date(2026, 3, 15)),
            ProjectTask(project_id=projects[0].project_id, title="파일럿 테스트",
                        is_milestone=True, milestone_order=3, status="todo",
                        created_by=users[0].user_id, due_date=date(2026, 5, 1)),
        ]
        db.add_all(milestones)

        db.commit()
        print("Seed data inserted successfully.")
        print(f"  Users: {len(users)}")
        print(f"  Coaches: {len(coaches)}")
        print(f"  Batch: 1 (ID={batch.batch_id})")
        print(f"  Projects: {len(projects)}")
        print(f"  Boards: {len(boards)}")
        print(f"  Milestones: {len(milestones)}")
        print()
        print("Test login credentials:")
        for u in users:
            print(f"  emp_id={u.emp_id}  role={u.role}  name={u.name}")

    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    seed()
