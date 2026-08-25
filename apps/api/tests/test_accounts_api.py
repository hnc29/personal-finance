"""API tests for the accounts endpoints (TASK-004).

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
from app.models.account import Account
from app.schemas.account import AccountCreate, AccountUpdate
from app.services import account as account_service


class FakeAccountStore:
    """A minimal in-memory stand-in for the account service."""

    def __init__(self) -> None:
        self._rows: dict[int, Account] = {}
        self._next_id = 1

    def create(self, data: AccountCreate) -> Account:
        account = Account(**data.model_dump())
        account.id = self._next_id
        self._next_id += 1
        account.sort_order = max((row.sort_order for row in self._rows.values()), default=0) + 1
        self._rows[account.id] = account
        return account

    def list(self) -> list[Account]:
        return sorted(self._rows.values(), key=lambda row: (row.sort_order, row.id))

    def get(self, account_id: int) -> Account | None:
        return self._rows.get(account_id)

    def update(
        self, account_id: int, data: AccountUpdate
    ) -> Account | None:
        account = self._rows.get(account_id)
        if account is None:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(account, field, value)
        return account


@pytest.fixture
def store(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeAccountStore]:
    fake = FakeAccountStore()

    monkeypatch.setattr(
        account_service,
        "create_account",
        lambda db, data: fake.create(data),
    )
    monkeypatch.setattr(
        account_service,
        "list_accounts",
        lambda db: fake.list(),
    )
    monkeypatch.setattr(
        account_service,
        "get_account",
        lambda db, account_id: fake.get(account_id),
    )
    monkeypatch.setattr(
        account_service,
        "update_account",
        lambda db, account_id, data: fake.update(account_id, data),
    )

    app.dependency_overrides[get_db] = lambda: None
    try:
        yield fake
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def client(store: FakeAccountStore) -> TestClient:
    return TestClient(app)


def test_create_account_defaults(client: TestClient) -> None:
    response = client.post(
        "/api/v1/accounts",
        json={"name": "Wallet", "account_type": "CASH"},
    )

    assert response.status_code == 201
    assert response.json() == {
        "id": 1,
        "name": "Wallet",
        "account_type": "CASH",
        "currency": "VND",
        "is_active": True,
        "sort_order": 1,
    }


def test_create_account_explicit_fields(client: TestClient) -> None:
    response = client.post(
        "/api/v1/accounts",
        json={
            "name": "Savings",
            "account_type": "BANK",
            "currency": "USD",
            "is_active": False,
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["currency"] == "USD"
    assert body["is_active"] is False


def test_list_accounts_ordered_by_id(client: TestClient) -> None:
    client.post(
        "/api/v1/accounts",
        json={"name": "First", "account_type": "CASH"},
    )
    client.post(
        "/api/v1/accounts",
        json={"name": "Second", "account_type": "EWALLET"},
    )

    response = client.get("/api/v1/accounts")

    assert response.status_code == 200
    body = response.json()
    assert [item["id"] for item in body] == [1, 2]
    assert [item["name"] for item in body] == ["First", "Second"]


def test_list_accounts_empty_returns_empty_list(client: TestClient) -> None:
    response = client.get("/api/v1/accounts")

    assert response.status_code == 200
    assert response.json() == []


def test_list_accounts_returns_full_representation(client: TestClient) -> None:
    client.post(
        "/api/v1/accounts",
        json={"name": "Wallet", "account_type": "CASH"},
    )

    response = client.get("/api/v1/accounts")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": 1,
            "name": "Wallet",
            "account_type": "CASH",
            "currency": "VND",
            "is_active": True,
            "sort_order": 1,
        }
    ]


def test_get_account(client: TestClient) -> None:
    client.post(
        "/api/v1/accounts",
        json={"name": "Wallet", "account_type": "CASH"},
    )

    response = client.get("/api/v1/accounts/1")

    assert response.status_code == 200
    assert response.json()["name"] == "Wallet"


def test_get_account_returns_full_representation(client: TestClient) -> None:
    client.post(
        "/api/v1/accounts",
        json={"name": "Savings", "account_type": "BANK", "currency": "USD"},
    )

    response = client.get("/api/v1/accounts/1")

    assert response.status_code == 200
    assert response.json() == {
        "id": 1,
        "name": "Savings",
        "account_type": "BANK",
        "currency": "USD",
        "is_active": True,
        "sort_order": 1,
    }


def test_get_account_unknown_id_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/accounts/999")

    assert response.status_code == 404


def test_update_account_partial(client: TestClient) -> None:
    client.post(
        "/api/v1/accounts",
        json={"name": "Wallet", "account_type": "CASH"},
    )

    response = client.patch(
        "/api/v1/accounts/1",
        json={"name": "Renamed", "is_active": False},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Renamed"
    assert body["is_active"] is False
    # Unset fields are left unchanged.
    assert body["account_type"] == "CASH"
    assert body["currency"] == "VND"


def test_update_account_toggles_is_active(client: TestClient) -> None:
    client.post(
        "/api/v1/accounts",
        json={"name": "Wallet", "account_type": "CASH"},
    )

    deactivated = client.patch(
        "/api/v1/accounts/1",
        json={"is_active": False},
    )

    assert deactivated.status_code == 200
    body = deactivated.json()
    assert body["is_active"] is False
    # Only is_active changes; the rest of the account is untouched.
    assert body["name"] == "Wallet"
    assert body["account_type"] == "CASH"
    assert body["currency"] == "VND"

    reactivated = client.patch(
        "/api/v1/accounts/1",
        json={"is_active": True},
    )

    assert reactivated.status_code == 200
    assert reactivated.json()["is_active"] is True


def test_update_account_unknown_id_returns_404(client: TestClient) -> None:
    response = client.patch(
        "/api/v1/accounts/999",
        json={"name": "Nope"},
    )

    assert response.status_code == 404


def test_new_accounts_append_to_the_end_of_the_order(client: TestClient) -> None:
    client.post("/api/v1/accounts", json={"name": "First", "account_type": "CASH"})
    client.post("/api/v1/accounts", json={"name": "Second", "account_type": "EWALLET"})

    response = client.get("/api/v1/accounts")

    assert response.status_code == 200
    body = response.json()
    assert [item["name"] for item in body] == ["First", "Second"]
    assert [item["sort_order"] for item in body] == [1, 2]


def test_sort_order_can_be_updated_to_reorder_the_list(client: TestClient) -> None:
    client.post("/api/v1/accounts", json={"name": "First", "account_type": "CASH"})
    client.post("/api/v1/accounts", json={"name": "Second", "account_type": "EWALLET"})

    # Swap: move "Second" (id 2) ahead of "First" (id 1).
    client.patch("/api/v1/accounts/2", json={"sort_order": 1})
    client.patch("/api/v1/accounts/1", json={"sort_order": 2})

    response = client.get("/api/v1/accounts")

    assert response.status_code == 200
    assert [item["name"] for item in response.json()] == ["Second", "First"]
