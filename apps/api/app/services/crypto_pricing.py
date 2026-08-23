"""Provider boundary for crypto pricing; no live provider is configured yet."""

import datetime
from decimal import Decimal
from typing import Protocol

from app.models.crypto import CryptoAsset


class CryptoPriceProvider(Protocol):
    def get_price(
        self, asset: CryptoAsset, pricing_instrument: str, as_of: datetime.date
    ) -> Decimal: ...


class UnconfiguredCryptoPriceProvider:
    def get_price(
        self, asset: CryptoAsset, pricing_instrument: str, as_of: datetime.date
    ) -> Decimal:
        raise NotImplementedError("no live crypto price provider is configured")
