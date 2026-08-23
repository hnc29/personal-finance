from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "app": "Personal Finance",
    }


def test_database_health() -> None:
    response = client.get("/api/v1/health/database")

    assert response.status_code == 200

    assert response.json() == {
        "status": "ok",
        "database": "sqlite",
    }


def test_readiness_and_cors(monkeypatch) -> None:
    monkeypatch.setattr("app.main.check_database", lambda: True)
    response = client.get("/api/v1/ready", headers={"Origin": "http://localhost:3000"})
    assert response.status_code == 200
    assert response.json()["status"] == "ready"
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_readiness_fails_when_database_is_unavailable(monkeypatch) -> None:
    def unavailable() -> None:
        raise RuntimeError("synthetic database failure")

    monkeypatch.setattr("app.main.check_database", unavailable)
    response = client.get("/api/v1/ready")
    assert response.status_code == 503
    assert response.json() == {"detail": "Database unavailable"}


def test_cors_origins_accept_documented_json_array() -> None:
    from app.core.config import Settings

    configured = Settings.model_validate(
        {"cors_origins": '["http://localhost:3000", "http://192.168.1.10:3000"]'}
    )
    assert configured.cors_origins == [
        "http://localhost:3000",
        "http://192.168.1.10:3000",
    ]
