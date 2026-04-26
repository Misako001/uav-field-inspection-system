from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "大田无人机巡检监控系统"
    app_env: str = "development"
    database_url: str = "sqlite:///./uav_inspection.db"
    mysql_database_url: str = "mysql+pymysql://uav_user:uav_password@127.0.0.1:3306/uav_inspection"
    rtmp_url: str = "rtmp://127.0.0.1/live/uav-field"
    hls_url: str = "http://127.0.0.1:8080/hls/uav-field.m3u8"
    api_refresh_interval_seconds: int = 2

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
