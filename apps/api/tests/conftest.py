"""Pytest configuration and global fixtures for API tests."""

from collections.abc import Iterator

import pytest

from app.core.security import get_current_admin_user, get_current_user
from app.main import app
from app.models.user import User


@pytest.fixture(autouse=True)
def default_test_auth() -> Iterator[None]:
    """Provide a default authenticated user fixture for legacy test suites.

    Tests specifically verifying authentication or permission checks can
    override or clear these dependencies in their test setups.
    """
    test_user = User(
        id=1,
        username="test_admin",
        email="test_admin@example.com",
        password_hash="fakehash",
        is_active=True,
        is_admin=True,
    )
    app.dependency_overrides[get_current_user] = lambda: test_user
    app.dependency_overrides[get_current_admin_user] = lambda: test_user
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_current_admin_user, None)
