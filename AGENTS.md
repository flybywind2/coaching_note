# Repository Guidelines

## Project Structure & Module Organization
- `backend/` contains the FastAPI app and database layer.
- `backend/app/main.py` boots the API, registers routers, and serves `frontend/` as static SPA content.
- `backend/app/routers/` holds route handlers; `backend/app/services/` holds business logic; `backend/app/models/` and `backend/app/schemas/` define ORM and API contracts.
- `backend/tests/` contains pytest suites and shared fixtures in `conftest.py`.
- `backend/scripts/` includes local setup helpers (`init_db.py`, `seed_data.py`).
- `frontend/` is a framework-free SPA (`index.html`, `js/`, `css/`).
- `uploads/` stores runtime file uploads.

## Build, Test, and Development Commands
Run from `backend/` unless noted:

```bash
pip install -r requirements.txt      # install backend deps
uvicorn app.main:app --reload        # run API + static frontend at :8000
python scripts/init_db.py            # create DB tables
python scripts/seed_data.py          # seed local sample data
alembic upgrade head                 # apply migrations
pytest tests/                        # run full backend test suite
pytest tests/test_auth.py -k login   # run focused tests
```

## Coding Style & Naming Conventions
- Python: 4-space indentation, type hints where practical, `snake_case` for functions/variables, `PascalCase` for classes.
- Keep router functions thin; place data/query/business rules in `services/`.
- JavaScript: 2-space indentation, semicolons, `camelCase` for functions/vars.
- Frontend pages live in `frontend/js/pages/` and follow `Pages.<feature>` naming.
- No formatter/linter is currently enforced in-repo; keep style consistent with surrounding files.

## Testing Guidelines
- Framework: `pytest` with `fastapi.testclient`.
- Tests use an isolated SQLite database (`test_ssp.db`) created/dropped by fixtures.
- Name test files `test_*.py` and test functions `test_*`.
- Add or update tests for any router, service, or permission behavior changes.

## Commit & Pull Request Guidelines
- Current history is minimal (`init`, `출석체크`) and uses short, single-line subjects.
- Use concise imperative commit messages; keep one logical change per commit.
- PRs should include:
  - what changed and why,
  - linked issue/task ID,
  - test evidence (`pytest` output),
  - screenshots/GIFs for frontend UI changes,
  - migration notes for schema updates.

## Security & Configuration Tips
- Keep secrets in `backend/.env`; never commit real keys.
- Review `backend/app/config.py` defaults before deploying (`SECRET_KEY`, AI credentials, allowed origins).
