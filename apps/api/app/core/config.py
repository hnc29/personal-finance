from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    app_name: str = "Personal Finance"
    environment: str = "development"

    database_path: Path = PROJECT_ROOT / "data" / "finance.db"

    default_currency: str = "VND"
    default_timezone: str = "Asia/Ho_Chi_Minh"

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

