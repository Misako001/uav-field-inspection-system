from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AlertEvent(Base):
    __tablename__ = "alert_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)
    alert_type: Mapped[str] = mapped_column(String(64), index=True)
    content: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(32), default="unhandled", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class DetectionStatistic(Base):
    __tablename__ = "detection_statistics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    total_count: Mapped[int] = mapped_column(Integer, default=0)
    current_minute_count: Mapped[int] = mapped_column(Integer, default=0)
    risk_index: Mapped[float] = mapped_column(Float, default=0.0)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)


class SystemConfig(Base):
    __tablename__ = "system_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    key: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    value: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(String(255), default="")


class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    source_type: Mapped[str] = mapped_column(String(32), index=True)
    source_name: Mapped[str] = mapped_column(String(255), default="")
    source_uri: Mapped[str] = mapped_column(Text, default="")
    source_media_path: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    model_backend: Mapped[str] = mapped_column(String(64), default="mock")
    frame_count: Mapped[int] = mapped_column(Integer, default=0)
    average_coverage_ratio: Mapped[float] = mapped_column(Float, default=0.0)
    estimated_plant_count: Mapped[int] = mapped_column(Integer, default=0)
    average_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    latest_result_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AnalysisResult(Base):
    __tablename__ = "analysis_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("analysis_jobs.id", ondelete="CASCADE"), index=True)
    source_image_path: Mapped[str] = mapped_column(Text, default="")
    heatmap_image_path: Mapped[str] = mapped_column(Text, default="")
    mask_image_path: Mapped[str] = mapped_column(Text, default="")
    segmentation_image_path: Mapped[str] = mapped_column(Text, default="")
    overlay_segmentation_path: Mapped[str] = mapped_column(Text, default="")
    thumbnail_path: Mapped[str] = mapped_column(Text, default="")
    weed_coverage_ratio: Mapped[float] = mapped_column(Float, default=0.0)
    weed_area_ratio: Mapped[float] = mapped_column(Float, default=0.0)
    crop_area_ratio: Mapped[float] = mapped_column(Float, default=0.0)
    background_area_ratio: Mapped[float] = mapped_column(Float, default=0.0)
    weed_pixel_area: Mapped[int] = mapped_column(Integer, default=0)
    estimated_plant_count: Mapped[int] = mapped_column(Integer, default=0)
    weed_component_count: Mapped[int] = mapped_column(Integer, default=0)
    average_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    processing_time_ms: Mapped[int] = mapped_column(Integer, default=0)
    result_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)
    summary_note: Mapped[str] = mapped_column(Text, default="")


class AnalysisFrame(Base):
    __tablename__ = "analysis_frames"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("analysis_jobs.id", ondelete="CASCADE"), index=True)
    frame_index: Mapped[int] = mapped_column(Integer, default=0)
    frame_timestamp_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    source_frame_path: Mapped[str] = mapped_column(Text, default="")
    heatmap_image_path: Mapped[str] = mapped_column(Text, default="")
    mask_image_path: Mapped[str] = mapped_column(Text, default="")
    segmentation_image_path: Mapped[str] = mapped_column(Text, default="")
    overlay_segmentation_path: Mapped[str] = mapped_column(Text, default="")
    weed_coverage_ratio: Mapped[float] = mapped_column(Float, default=0.0)
    weed_area_ratio: Mapped[float] = mapped_column(Float, default=0.0)
    crop_area_ratio: Mapped[float] = mapped_column(Float, default=0.0)
    background_area_ratio: Mapped[float] = mapped_column(Float, default=0.0)
    weed_pixel_area: Mapped[int] = mapped_column(Integer, default=0)
    estimated_plant_count: Mapped[int] = mapped_column(Integer, default=0)
    weed_component_count: Mapped[int] = mapped_column(Integer, default=0)
    average_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)
