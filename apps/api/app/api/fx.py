from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import settings
from app.services.fx_rate import FxRateUnavailableError, UsdVndRateProvider
from app.services.http_client import UrllibHttpClient

router = APIRouter(prefix="/api/v1/fx", tags=["fx"])

_usd_vnd_provider = UsdVndRateProvider(
    UrllibHttpClient(),
    settings.fx_rate_url,
    timeout=settings.fx_rate_timeout_seconds,
)


def get_usd_vnd_provider() -> UsdVndRateProvider:
    """A single process-lifetime instance; overridable via dependency_overrides in tests."""
    return _usd_vnd_provider


@router.get("/usd-vnd")
def usd_vnd_rate(
    provider: Annotated[UsdVndRateProvider, Depends(get_usd_vnd_provider)],
):
    """Live USD/VND rate for the crypto "purchased in USD" form field.

    User report, 2026-08-26: purchase price entered in USD must auto-convert
    to VND (the app's one storage currency, see MetalCreate/CryptoCreate --
    nothing in this app is denominated in anything else) using a rate that
    "tự động cập nhật" (auto-updates), not a hard-coded constant.
    """
    try:
        rate = provider.get_rate()
    except FxRateUnavailableError as exc:
        raise HTTPException(503, "USD/VND exchange rate is unavailable") from exc
    return {
        "rate": str(rate.rate),
        "as_of": rate.as_of.isoformat(),
        "source": rate.source,
    }
