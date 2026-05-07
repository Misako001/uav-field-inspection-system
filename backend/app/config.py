from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "大田无人机巡检监控系统"
    app_env: str = "development"
    database_url: str = "sqlite:///./uav_inspection.db"
    mysql_database_url: str = "mysql+pymysql://uav_user:uav_password@127.0.0.1:3306/uav_inspection"
    rtmp_url: str = "rtmp://127.0.0.1/live/uav-field"
    hls_url: str = "http://127.0.0.1:8080/hls/uav-field.m3u8"
    api_refresh_interval_seconds: int = 2
    model_backend: str = "mock"
    model_type: str = "deeplabv3plus_resnet34"
    model_path: str = ""
    model_device: str = "auto"
    model_class_index_crop: int = 1
    model_class_index_weed: int = 2
    model_allow_mock_fallback: bool = True
    image_result_threshold: float = 0.52
    weed_min_component_area: int = 20
    weed_max_component_aspect_ratio: float = 5.5
    weed_min_component_fill_ratio: float = 0.16
    weed_crop_edge_kernel_size: int = 9
    weed_crop_edge_overlap_ratio: float = 0.62
    vegetation_excess_green_threshold: float = 0.08
    vegetation_saturation_threshold: float = 0.16
    morphology_open_kernel_size: int = 3
    morphology_close_kernel_size: int = 5
    video_sample_fps: float = 1.5
    stream_sample_interval_seconds: float = 2.0
    max_concurrent_analysis_jobs: int = 2
    storage_root: str = "storage"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def backend_root(self) -> Path:
        return Path(__file__).resolve().parent.parent

    @property
    def storage_root_path(self) -> Path:
        storage_root = Path(self.storage_root)
        if storage_root.is_absolute():
            return storage_root
        return self.backend_root / storage_root

    @property
    def model_path_resolved(self) -> Path | None:
        if not self.model_path:
            return None
        model_path = Path(self.model_path)
        if model_path.is_absolute():
            return model_path
        return (self.backend_root / model_path).resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()
