"""SQLAlchemy 모델 패키지 초기화 모듈입니다."""

from app.models.user import User, Coach
from app.models.batch import Batch
from app.models.project import Project, ProjectMember
from app.models.project_profile import ProjectProfile
from app.models.coaching_note import CoachingNote, CoachingComment
from app.models.document import ProjectDocument
from app.models.session import CoachingSession, SessionAttendee, AttendanceLog, CoachingTimeLog
from app.models.allowed_ip import AllowedIPRange
from app.models.task import ProjectTask
from app.models.schedule import ProgramSchedule
from app.models.board import Board, BoardPost, PostComment, BoardPostView
from app.models.notification import Notification, NotificationPreference
from app.models.ai_content import AIGeneratedContent
from app.models.content_version import ContentVersion
from app.models.coaching_template import CoachingNoteTemplate
from app.models.site_content import SiteContent
from app.models.coaching_plan import CoachDailyPlan, CoachActualOverride
from app.models.access_scope import UserBatchAccess, UserProjectAccess
from app.models.attendance import DailyAttendanceLog

__all__ = [
    "User", "Coach",
    "Batch",
    "Project", "ProjectMember",
    "ProjectProfile",
    "CoachingNote", "CoachingComment",
    "ProjectDocument",
    "CoachingSession", "SessionAttendee", "AttendanceLog", "CoachingTimeLog",
    "AllowedIPRange",
    "ProjectTask",
    "ProgramSchedule",
    "Board", "BoardPost", "PostComment", "BoardPostView",
    "Notification", "NotificationPreference",
    "AIGeneratedContent",
    "ContentVersion",
    "CoachingNoteTemplate",
    "SiteContent",
    "CoachDailyPlan", "CoachActualOverride",
    "UserBatchAccess", "UserProjectAccess",
    "DailyAttendanceLog",
]


