from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


def test_ai_is_disabled_by_default() -> None:
    response = TestClient(app).post(
        "/api/v1/ai/suggest",
        json={"purpose": "categorization", "prompt": "synthetic merchant"},
    )
    assert response.status_code == 503


def test_ai_status_declares_non_authoritative_boundary() -> None:
    response = TestClient(app).get("/api/v1/ai/status")
    assert response.json() == {
        "enabled": settings.ollama_enabled,
        "provider": "ollama",
        "authoritative": False,
    }
