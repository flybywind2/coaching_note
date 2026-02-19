from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class ProgramSchedule(Base):
    __tablename__ = "program_schedule"

    schedule_id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(Integer, ForeignKey("batch.batch_id"), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    schedule_type = Column(String(30), nullable=False)
    # orientation/workshop/mid_presentation/final_presentation/networking/other
    start_datetime = Column(DateTime, nullable=False)
    end_datetime = Column(DateTime)
    location = Column(String(200))
    is_all_day = Column(Boolean, default=False)
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    batch = relationship("Batch", back_populates="schedules")

    __table_args__ = (
        Index("idx_schedule_batch", "batch_id", "start_datetime"),
    )
