from __future__ import annotations

import logging
from pathlib import Path

import pytest

from app.core.config import Settings
from app.services.email import send_password_reset_email


def test_production_fails_closed_without_strong_secret_key(tmp_path: Path) -> None:
    # 1. Production with empty secret key must fail closed
    with pytest.raises(ValueError, match="PF_SECRET_KEY must be explicitly set"):
        Settings(
            environment="production",
            secret_key="",
            database_path=tmp_path / "test.db",
        )

    # 2. Production with docker-compose fallback key must be strictly rejected
    with pytest.raises(ValueError, match="Insecure public secret key"):
        Settings(
            environment="production",
            secret_key="personal-finance-vps-production-key-change-me",
            database_path=tmp_path / "test.db",
        )

    # 3. Production with old insecure default must fail closed
    with pytest.raises(ValueError, match="Insecure public secret key"):
        Settings(
            environment="production",
            secret_key="personal-finance-secret-key-production-local",
            database_path=tmp_path / "test.db",
        )

    # 4. Production with too-short secret key must fail closed
    with pytest.raises(ValueError, match="PF_SECRET_KEY must be explicitly set to a strong secret key"):
        Settings(
            environment="production",
            secret_key="short-secret-key-less-than-32",
            database_path=tmp_path / "test.db",
        )

    # 5. Production with strong secret key (>= 32 chars and not public default) succeeds
    prod_settings = Settings(
        environment="production",
        secret_key="a-very-strong-production-secret-key-with-high-entropy-12345",
        database_path=tmp_path / "test.db",
    )
    assert prod_settings.environment == "production"


def test_docker_compose_fallback_key_rejected_in_all_environments(tmp_path: Path) -> None:
    # Even in development, known public keys must be rejected
    with pytest.raises(ValueError, match="Insecure public secret key"):
        Settings(
            environment="development",
            secret_key="personal-finance-vps-production-key-change-me",
            database_path=tmp_path / "test.db",
        )


def test_development_generates_random_key_when_unconfigured(tmp_path: Path) -> None:
    s1 = Settings(
        environment="development",
        secret_key="",
        database_path=tmp_path / "test1.db",
    )
    s2 = Settings(
        environment="development",
        secret_key="",
        database_path=tmp_path / "test2.db",
    )
    # Must generate non-empty, strong random keys
    assert len(s1.secret_key) >= 32
    assert len(s2.secret_key) >= 32
    # Distinct instances generate independent random keys per invocation
    assert s1.secret_key != s2.secret_key


def test_insecure_keys_rejected_even_with_custom_cors_origins(tmp_path: Path) -> None:
    # Known insecure keys must be rejected regardless of CORS origins
    with pytest.raises(ValueError, match="Insecure public secret key"):
        Settings(
            environment="development",
            cors_origins=["https://finance.example.com"],
            secret_key="personal-finance-secret-key-production-local",
            database_path=tmp_path / "test.db",
        )

    with pytest.raises(ValueError, match="Insecure public secret key"):
        Settings(
            environment="development",
            cors_origins=["https://finance.example.com"],
            secret_key="personal-finance-vps-production-key-change-me",
            database_path=tmp_path / "test.db",
        )


def test_email_service_fails_closed_in_production(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr("app.services.email.settings.environment", "production")
    monkeypatch.setattr("app.services.email.settings.smtp_host", "")

    # In production without SMTP configured, must raise RuntimeError and never log token
    with (
        caplog.at_level(logging.INFO),
        pytest.raises(RuntimeError, match="SMTP not configured in production"),
    ):
        send_password_reset_email(
            to_email="victim@example.com",
            username="victim",
            reset_token="sensitive-reset-token-xyz-123",
        )

    # Verify sensitive token is NEVER logged
    assert "sensitive-reset-token-xyz-123" not in caplog.text
