from datetime import datetime, timezone
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AlertEvent, DetectionStatistic
from app.schemas import AlertEventRead, DetectionStatistics, SystemStatus, VideoStatus
from app.services.analysis import get_latest_analysis_summary


def get_system_status() -> SystemStatus:
    settings = get_settings()
    return SystemStatus(
        system_name=settings.app_name,
        status="系统正常",
        running=True,
        server_time=datetime.now(timezone.utc),
        health="healthy",
    )


def get_video_status() -> VideoStatus:
    return VideoStatus(
        rtmp_status="connected",
        hls_status="available",
        fps=29.8,
        latency_ms=86,
        resolution="1920x1080",
    )


def get_detection_statistics(db: Session) -> DetectionStatistics:
    latest = db.scalar(select(DetectionStatistic).order_by(desc(DetectionStatistic.recorded_at)).limit(1))
    if latest:
        return DetectionStatistics(
            total_count=latest.total_count,
            current_minute_count=latest.current_minute_count,
            risk_index=latest.risk_index,
            recorded_at=latest.recorded_at,
        )
    return DetectionStatistics(total_count=0, current_minute_count=0, risk_index=0.0, recorded_at=datetime.now(timezone.utc))


def get_alerts(db: Session, limit: int = 20) -> list[AlertEventRead]:
    alerts = db.scalars(select(AlertEvent).order_by(desc(AlertEvent.occurred_at)).limit(limit)).all()
    return [AlertEventRead.model_validate(alert) for alert in alerts]


def get_system_config() -> dict[str, Any]:
    settings = get_settings()
    database_type = "SQLite" if settings.database_url.startswith("sqlite") else "MySQL"
    return {
        "app_name": settings.app_name,
        "environment": settings.app_env,
        "database_type": database_type,
        "database_url": settings.database_url,
        "mysql_database_url": settings.mysql_database_url,
        "rtmp_url": settings.rtmp_url,
        "hls_url": settings.hls_url,
        "refresh_interval_seconds": settings.api_refresh_interval_seconds,
    }


def get_realtime_payload(db: Session) -> dict[str, Any]:
    return {
        "event": "dashboard.realtime",
        "emitted_at": datetime.now(timezone.utc),
        "system": get_system_status(),
        "video": get_video_status(),
        "detection": get_detection_statistics(db),
        "alerts": get_alerts(db, limit=5),
        "config": get_system_config(),
        "latest_analysis": get_latest_analysis_summary(db),
    }
