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
