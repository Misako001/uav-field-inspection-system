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
    latest_analysis: dict[str, Any] | None = None


class AnalysisFrameRead(BaseModel):
    id: int
    job_id: int
    frame_index: int
    frame_timestamp_seconds: float
    source_frame_path: str
    heatmap_image_path: str
    mask_image_path: str
    weed_coverage_ratio: float
    weed_pixel_area: int
    estimated_plant_count: int
    average_confidence: float
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AnalysisResultRead(BaseModel):
    id: int
    job_id: int
    source_image_path: str
    heatmap_image_path: str
    mask_image_path: str
    thumbnail_path: str
    weed_coverage_ratio: float
    weed_pixel_area: int
    estimated_plant_count: int
    average_confidence: float
    processing_time_ms: int
    result_time: datetime
    summary_note: str

    model_config = ConfigDict(from_attributes=True)


class AnalysisJobRead(BaseModel):
    id: int
    source_type: str
    source_name: str
    source_uri: str
    source_media_path: str
    status: str
    progress: float
    model_backend: str
    frame_count: int
    average_coverage_ratio: float
    estimated_plant_count: int
    average_confidence: float
    latest_result_id: int | None
    error_message: str
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class AnalysisJobListRead(BaseModel):
    items: list[AnalysisJobRead]
    total: int
    page: int
    page_size: int


class AnalysisJobDetailRead(BaseModel):
    job: AnalysisJobRead
    latest_result: AnalysisResultRead | None = None
    frames: list[AnalysisFrameRead] = []


class AnalysisImageResponse(BaseModel):
    job: AnalysisJobRead
    result: AnalysisResultRead


class AnalysisStreamCreate(BaseModel):
    source_url: str


class AnalysisStopResponse(BaseModel):
    job_id: int
    status: str
    message: str


class AnalysisRealtimePayload(BaseModel):
    event: str
    emitted_at: datetime
    job: AnalysisJobRead
    latest_result: AnalysisResultRead | None = None
    latest_frame: AnalysisFrameRead | None = None
