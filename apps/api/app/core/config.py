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
