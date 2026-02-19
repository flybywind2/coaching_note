from sqlalchemy import Column, Integer, String, Date, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Batch(Base):
    __tablename__ = "batch"

    batch_id = Column(Integer, primary_key=True, autoincrement=True)
    batch_name = Column(String(100), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(String(20), default="planned")  # planned/ongoing/completed
    created_at = Column(DateTime, server_default=func.now())

    projects = relationship("Project", back_populates="batch")
    schedules = relationship("ProgramSchedule", back_populates="batch")
    sessions = relationship("CoachingSession", back_populates="batch")
