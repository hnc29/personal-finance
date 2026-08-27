import json
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    app_name: str = "Personal Finance"
    environment: str = "development"

    database_path: Path = PROJECT_ROOT / "data" / "finance.db"

    default_currency: str = "VND"
    default_timezone: str = "Asia/Ho_Chi_Minh"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    ollama_enabled: bool = False
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = ""
    ollama_timeout_seconds: int = 10

    coingecko_coins_url: str = "https://api.coingecko.com/api/v3/coins/list"
    coingecko_timeout_seconds: float = 10.0

    # USD/VND exchange rate for the crypto "purchased in USD" form field
    # (user report, 2026-08-26: "nếu mua bằng usd thì sẽ tự động nhân và
    # chuyển sang vnd, tỷ giá sẽ tự động cập nhật"). open.er-api.com is a
    # free, no-API-key JSON endpoint; overridable via env for anyone who
    # wants a different source without a code change (same pattern as the
    # CoinGecko URL above).
    fx_rate_url: str = "https://open.er-api.com/v6/latest/USD"
    fx_rate_timeout_seconds: float = 10.0

    # Live gold reference price for precious-metal valuation (user request,
    # 2026-08-27: use btmc.vn as the one reference source for ring/bar
    # holdings of BTMC/BTMH/DOJI, plus the SJC-bar and raw-material rows it
    # also publishes -- see app/services/metal_price_reference.py).
    btmc_price_url: str = "https://btmc.vn/"
    btmc_price_timeout_seconds: float = 10.0

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, list) and all(isinstance(origin, str) for origin in parsed):
                return [origin.strip() for origin in parsed if origin.strip()]
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="PF_",
        extra="ignore",
    )

    @property
    def database_url(self) -> str:
        self.database_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )
        return f"sqlite:///{self.database_path}"


settings = Settings()
