import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base, get_db
from app.main import app
from app.models.user import User
from app.models.batch import Batch
from app.models.board import Board
from datetime import date

TEST_DB_URL = "sqlite:///./test_ssp.db"

engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def seed_users(db):
    users = {
        "admin": User(emp_id="admin001", name="Admin", role="admin", department="HR"),
        "coach": User(emp_id="coach001", name="Coach", role="coach", department="IT"),
        "participant": User(emp_id="user001", name="Participant", role="participant", department="Dev"),
        "observer": User(emp_id="obs001", name="Observer", role="observer", department="Biz"),
    }
    for u in users.values():
        db.add(u)
    db.commit()
    for u in users.values():
        db.refresh(u)
    return users


@pytest.fixture
def seed_batch(db, seed_users):
    batch = Batch(batch_name="2026년 1차", start_date=date(2026, 1, 1), end_date=date(2026, 6, 30), status="ongoing")
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


@pytest.fixture
def seed_boards(db):
    boards = [
        Board(board_name="공지사항", board_type="notice"),
        Board(board_name="Q&A", board_type="qna"),
        Board(board_name="자유게시판", board_type="free"),
    ]
    for b in boards:
        db.add(b)
    db.commit()
    return boards


def get_token(client, emp_id: str) -> str:
    resp = client.post("/api/auth/login", json={"emp_id": emp_id})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def auth_headers(client, emp_id: str) -> dict:
    return {"Authorization": f"Bearer {get_token(client, emp_id)}"}
