from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class SystemStatus(BaseModel):
    system_name: str
    status: str
    running: bool
    server_time: datetime
    health: str


class VideoStatus(BaseModel):
    rtmp_status: str
    hls_status: str
    fps: float
    latency_ms: int
    resolution: str


class DetectionStatistics(BaseModel):
    total_count: int
    current_minute_count: int
    risk_index: float
    recorded_at: datetime


class AlertEventRead(BaseModel):
    id: int
    occurred_at: datetime
    alert_type: str
    content: str
    confidence: float
    status: str

    model_config = ConfigDict(from_attributes=True)


class SystemConfigRead(BaseModel):
    app_name: str
    environment: str
    database_type: str
    database_url: str
    mysql_database_url: str
    rtmp_url: str
    hls_url: str
    refresh_interval_seconds: int


class RealtimePayload(BaseModel):
    event: str
    emitted_at: datetime
    system: SystemStatus
    video: VideoStatus
    detection: DetectionStatistics
    alerts: list[AlertEventRead]
    config: dict[str, Any]
