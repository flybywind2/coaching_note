from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class ProjectDocument(Base):
    __tablename__ = "project_document"

    doc_id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.project_id"), nullable=False)
    doc_type = Column(String(30), nullable=False)
    # application/basic_consulting/workshop_result/mid_presentation/final_presentation
    title = Column(String(200))
    content = Column(Text)
    attachments = Column(Text)  # JSON: [{filename, url, size}]
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    project = relationship("Project", back_populates="documents")
    creator = relationship("User", back_populates="project_documents")

    __table_args__ = (
        Index("idx_document_project", "project_id", "doc_type"),
    )
