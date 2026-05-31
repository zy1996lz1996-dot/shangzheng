from functools import lru_cache
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    admin_run_key: str = Field(default="change-me", alias="ADMIN_RUN_KEY")
    tushare_token: str = Field(default="", alias="TUSHARE_TOKEN")
    database_path: str = Field(default="./data/reports.sqlite3", alias="DATABASE_PATH")
    retention_days: int = Field(default=90, alias="RETENTION_DAYS")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def database_file(self) -> Path:
        return Path(self.database_path)


@lru_cache
def get_settings() -> Settings:
    return Settings()

