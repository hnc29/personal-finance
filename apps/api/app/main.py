from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.api.accounts import router as accounts_router
from app.api.ai import router as ai_router
from app.api.categories import router as categories_router
from app.api.financial_events import router as financial_events_router
from app.api.read_models import router as read_models_router
from app.core.config import settings
from app.core.database import check_database

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Accept"],
)

app.include_router(accounts_router)
app.include_router(categories_router)
app.include_router(financial_events_router)
app.include_router(read_models_router)
app.include_router(ai_router)


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "app": settings.app_name,
    }

@app.get("/api/v1/ready")
def readiness() -> dict[str, str]:
    try:
        check_database()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Database unavailable",
        ) from exc
    return {"status": "ready", "app": settings.app_name}


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
