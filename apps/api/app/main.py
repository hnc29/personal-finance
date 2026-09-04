from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.api.accounts import router as accounts_router
from app.api.ai import router as ai_router
from app.api.assets import router as assets_router
from app.api.auth import router as auth_router
from app.api.backup import router as backup_router
from app.api.categories import router as categories_router
from app.api.data import router as data_router
from app.api.financial_events import router as financial_events_router
from app.api.fx import router as fx_router
from app.api.read_models import router as read_models_router
from app.api.savings import router as savings_router
from app.api.users import router as users_router
from app.core.config import settings
from app.core.database import check_database

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
)
cors_origins = list(
    dict.fromkeys(
        [*settings.cors_origins, "http://localhost:3000", "http://127.0.0.1:3000"]
    )
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "X-Filename", "Authorization"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(accounts_router)
app.include_router(assets_router)
app.include_router(savings_router)
app.include_router(categories_router)
app.include_router(financial_events_router)
app.include_router(read_models_router)
app.include_router(data_router)
app.include_router(ai_router)
app.include_router(fx_router)
app.include_router(backup_router)


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
