from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_path: str = "data/heuristica.db"
    cloud_function_url: str = "http://127.0.0.1:8081"
    run_evolution_locally: bool = False
    cloud_function_timeout_seconds: float = 30.0
    cooldown_seconds: int = 30
    leaderboard_limit: int = 50
    cors_origins: str = "*"
    admin_key: str = ""


settings = Settings()
