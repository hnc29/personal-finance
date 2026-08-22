"""API tests for the categories endpoints (TASK-004).

The service layer is replaced by an in-memory fake and ``get_db`` is
overridden, so nothing here reads or writes ``data/finance.db`` or any real
database, and no schema is created via ``Base.metadata.create_all()`` —
Alembic remains the sole schema authority. All data is synthetic.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.main import app
from app.models.category import Category
from app.schemas.category import CategoryCreate, CategoryUpdate
from app.services import category as category_service
from app.services.category import SelfParentError, UnknownParentError


class FakeCategoryStore:
    """A minimal in-memory stand-in for the category service.

    It reproduces the service's parent-integrity checks by raising the same
    exception types the routing layer catches.
    """

    def __init__(self) -> None:
        self._rows: dict[int, Category] = {}
        self._next_id = 1

    def create(self, data: CategoryCreate) -> Category:
        if data.parent_id is not None and data.parent_id not in self._rows:
            raise UnknownParentError(data.parent_id)
        category = Category(**data.model_dump())
        category.id = self._next_id
        self._next_id += 1
        self._rows[category.id] = category
        return category

    def list(self) -> list[Category]:
        return [self._rows[key] for key in sorted(self._rows)]

    def get(self, category_id: int) -> Category | None:
        return self._rows.get(category_id)

    def update(
        self, category_id: int, data: CategoryUpdate
    ) -> Category | None:
        category = self._rows.get(category_id)
        if category is None:
            return None
        fields = data.model_dump(exclude_unset=True)
        parent_id = fields.get("parent_id")
        if "parent_id" in fields and parent_id is not None:
            if parent_id == category_id:
                raise SelfParentError(category_id)
            if parent_id not in self._rows:
                raise UnknownParentError(parent_id)
        for field, value in fields.items():
            setattr(category, field, value)
        return category


@pytest.fixture
def store(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeCategoryStore]:
    fake = FakeCategoryStore()

    monkeypatch.setattr(
        category_service,
        "create_category",
        lambda db, data: fake.create(data),
    )
    monkeypatch.setattr(
        category_service,
        "list_categories",
        lambda db: fake.list(),
    )
    monkeypatch.setattr(
        category_service,
        "get_category",
        lambda db, category_id: fake.get(category_id),
    )
    monkeypatch.setattr(
        category_service,
        "update_category",
        lambda db, category_id, data: fake.update(category_id, data),
    )

    app.dependency_overrides[get_db] = lambda: None
    try:
        yield fake
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def client(store: FakeCategoryStore) -> TestClient:
    return TestClient(app)


def test_create_category_defaults(client: TestClient) -> None:
    response = client.post(
        "/api/v1/categories",
        json={"name": "Food"},
    )

    assert response.status_code == 201
    assert response.json() == {
        "id": 1,
        "name": "Food",
        "parent_id": None,
        "is_active": True,
    }


def test_create_category_with_parent(client: TestClient) -> None:
    client.post("/api/v1/categories", json={"name": "Food"})

    response = client.post(
        "/api/v1/categories",
        json={"name": "Groceries", "parent_id": 1},
    )

    assert response.status_code == 201
    assert response.json()["parent_id"] == 1


def test_create_category_unknown_parent_returns_404(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/v1/categories",
        json={"name": "Orphan", "parent_id": 999},
    )

    assert response.status_code == 404


def test_list_categories_ordered_by_id(client: TestClient) -> None:
    client.post("/api/v1/categories", json={"name": "First"})
    client.post("/api/v1/categories", json={"name": "Second"})

    response = client.get("/api/v1/categories")

    assert response.status_code == 200
    body = response.json()
    assert [item["id"] for item in body] == [1, 2]
    assert [item["name"] for item in body] == ["First", "Second"]


def test_list_categories_empty(client: TestClient) -> None:
    response = client.get("/api/v1/categories")

    assert response.status_code == 200
    assert response.json() == []


def test_get_category(client: TestClient) -> None:
    client.post("/api/v1/categories", json={"name": "Food"})

    response = client.get("/api/v1/categories/1")

    assert response.status_code == 200
    assert response.json()["name"] == "Food"


def test_get_category_returns_full_body(client: TestClient) -> None:
    client.post("/api/v1/categories", json={"name": "Food"})
    client.post(
        "/api/v1/categories",
        json={"name": "Groceries", "parent_id": 1},
    )

    response = client.get("/api/v1/categories/2")

    assert response.status_code == 200
    assert response.json() == {
        "id": 2,
        "name": "Groceries",
        "parent_id": 1,
        "is_active": True,
    }


def test_get_category_unknown_id_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/categories/999")

    assert response.status_code == 404


def test_update_category_partial(client: TestClient) -> None:
    client.post("/api/v1/categories", json={"name": "Food"})

    response = client.patch(
        "/api/v1/categories/1",
        json={"name": "Dining", "is_active": False},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Dining"
    assert body["is_active"] is False
    # Unset fields are left unchanged.
    assert body["parent_id"] is None


def test_update_category_single_field(client: TestClient) -> None:
    client.post("/api/v1/categories", json={"name": "Food"})

    response = client.patch(
        "/api/v1/categories/1",
        json={"is_active": False},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["is_active"] is False
    # Fields not included in the request are left unchanged.
    assert body["name"] == "Food"
    assert body["parent_id"] is None


def test_update_category_reparent(client: TestClient) -> None:
    client.post("/api/v1/categories", json={"name": "Food"})
    client.post("/api/v1/categories", json={"name": "Groceries"})

    response = client.patch(
        "/api/v1/categories/2",
        json={"parent_id": 1},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["parent_id"] == 1
    assert body["name"] == "Groceries"


def test_update_category_unknown_id_returns_404(client: TestClient) -> None:
    response = client.patch(
        "/api/v1/categories/999",
        json={"name": "Nope"},
    )

    assert response.status_code == 404


def test_update_category_self_parent_returns_400(client: TestClient) -> None:
    client.post("/api/v1/categories", json={"name": "Food"})

    response = client.patch(
        "/api/v1/categories/1",
        json={"parent_id": 1},
    )

    assert response.status_code == 400


def test_update_category_unknown_parent_returns_404(
    client: TestClient,
) -> None:
    client.post("/api/v1/categories", json={"name": "Food"})

    response = client.patch(
        "/api/v1/categories/1",
        json={"parent_id": 999},
    )

    assert response.status_code == 404


def test_update_category_self_parent_leaves_parent_unchanged(
    client: TestClient,
) -> None:
    client.post("/api/v1/categories", json={"name": "Food"})

    rejected = client.patch(
        "/api/v1/categories/1",
        json={"parent_id": 1},
    )
    assert rejected.status_code == 400

    # A rejected self-parent must not be partially applied.
    current = client.get("/api/v1/categories/1")
    assert current.status_code == 200
    assert current.json()["parent_id"] is None


def test_create_category_hierarchy_has_no_depth_limit(
    client: TestClient,
) -> None:
    # TASK-004 forbids enforcing a database depth limit, so an arbitrarily
    # deep parent chain must be accepted end to end.
    depth = 25
    parent_id: int | None = None
    for level in range(1, depth + 1):
        payload: dict[str, str | int] = {"name": f"Level {level}"}
        if parent_id is not None:
            payload["parent_id"] = parent_id

        response = client.post("/api/v1/categories", json=payload)

        assert response.status_code == 201
        body = response.json()
        assert body["id"] == level
        assert body["parent_id"] == parent_id
        parent_id = body["id"]
