from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.api.accounts import router as accounts_router
from app.api.ai import router as ai_router
from app.api.assets import router as assets_router
from app.api.categories import router as categories_router
from app.api.data import router as data_router
from app.api.financial_events import router as financial_events_router
from app.api.fx import router as fx_router
from app.api.read_models import router as read_models_router
from app.api.savings import router as savings_router
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
    allow_credentials=False,
    # TASK-042: "DELETE" added for the new transaction-delete endpoint --
    # without it here, the browser's CORS preflight for a DELETE request
    # is rejected before it ever reaches the endpoint (same class of bug as
    # the TASK-038 X-Filename header omission below: a missing entry here
    # blocks the whole method, for every request, not just some).
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    # TASK-038: "X-Filename" is required for the Money Lover upload flow
    # (see app/api/data.py's import_money_lover). Without it here, the
    # browser's CORS preflight for that request rejects the custom header
    # outright -- the request never reaches the endpoint at all, for ANY
    # filename (not just ones with non-ASCII characters). This was a second,
    # independent cause of "bấm tải lên không phản hồi" stacked on top of
    # the Headers/ByteString issue fixed in the same task, and would have
    # kept the upload broken even after that fix.
    allow_headers=["Content-Type", "Accept", "X-Filename"],
)

app.include_router(accounts_router)
app.include_router(assets_router)
app.include_router(savings_router)
app.include_router(categories_router)
app.include_router(financial_events_router)
app.include_router(read_models_router)
app.include_router(data_router)
app.include_router(ai_router)
app.include_router(fx_router)


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
