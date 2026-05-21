from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings


class LocalValidationError(RuntimeError):
    pass


def require_api_keys() -> None:
    settings = get_settings()
    missing = []
    if not settings.google_api_key:
        missing.append("GOOGLE_API_KEY")
    if not settings.openai_api_key:
        missing.append("OPENAI_API_KEY")
    if missing:
        raise LocalValidationError(
            f"Missing required environment variable(s): {', '.join(missing)}. "
            "Create .env from .env.example and set real API keys."
        )


def check_database_connection(db: Session) -> None:
    try:
        db.execute(text("SELECT 1")).scalar_one()
    except SQLAlchemyError as exc:
        raise LocalValidationError(
            "Database connection failed. Check DATABASE_URL and confirm PostgreSQL is running."
        ) from exc


def check_postgis_enabled(db: Session) -> str:
    try:
        version = db.execute(text("SELECT PostGIS_Version()")).scalar_one_or_none()
    except SQLAlchemyError as exc:
        raise LocalValidationError(
            "PostGIS is not enabled or not installed. Run: "
            'psql -d tiloca -c "CREATE EXTENSION IF NOT EXISTS postgis;"'
        ) from exc
    if not version:
        raise LocalValidationError("PostGIS check failed: PostGIS_Version() returned no value.")
    return str(version)
