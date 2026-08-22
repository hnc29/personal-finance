from fastapi import FastAPI, HTTPException

from app.core.config import settings
from app.core.database import check_database

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
)


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "app": settings.app_name,
    }


@app.get("/api/v1/health/database")
def database_health() -> dict[str, str]:
    try:
        check_database()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Database unavailable",
        ) from exc

    return {
        "status": "ok",
        "database": "sqlite",
    }
