from app.models.user import User
from app.models.project import Project, ProjectMember
from sqlalchemy.orm import Session


ADMIN = "admin"
COACH = "coach"
PARTICIPANT = "participant"
OBSERVER = "observer"

ADMIN_COACH = (ADMIN, COACH)
ALL_ROLES = (ADMIN, COACH, PARTICIPANT, OBSERVER)


def is_admin(user: User) -> bool:
    return user.role == ADMIN


def is_coach(user: User) -> bool:
    return user.role == COACH


def is_admin_or_coach(user: User) -> bool:
    return user.role in ADMIN_COACH


def is_project_member(db: Session, project_id: int, user_id: int) -> bool:
    return db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    ).first() is not None


def can_view_project(db: Session, project: Project, user: User) -> bool:
    if user.role in ADMIN_COACH:
        return True
    if project.visibility == "public":
        return True
    # restricted: only members
    return is_project_member(db, project.project_id, user.user_id)


def can_write_coaching_note(user: User) -> bool:
    return user.role in ADMIN_COACH


def can_view_coach_only_comment(user: User) -> bool:
    return user.role in ADMIN_COACH


def can_manage_milestone_order(user: User) -> bool:
    return user.role in ADMIN_COACH


def can_manage_program_schedule(user: User) -> bool:
    return user.role == ADMIN


def can_assign_session(user: User) -> bool:
    return user.role == ADMIN


def can_view_dashboard(user: User) -> bool:
    return user.role in ADMIN_COACH
