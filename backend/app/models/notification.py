from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Notification(Base):
    __tablename__ = "notification"

    noti_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    noti_type = Column(String(30), nullable=False)
    # question_registered/notice_posted/coaching_feedback
    title = Column(String(200), nullable=False)
    message = Column(Text)
    link_url = Column(String(500))
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="notifications")

    __table_args__ = (
        Index("idx_notification_user", "user_id", "is_read", "created_at"),
    )
