from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AlertEvent, DetectionStatistic, SystemConfig


def seed_initial_data(db: Session) -> None:
    settings = get_settings()

    if not db.scalar(select(SystemConfig).limit(1)):
        db.add_all(
            [
                SystemConfig(key="rtmp_url", value=settings.rtmp_url, description="RTMP live stream URL"),
                SystemConfig(key="hls_url", value=settings.hls_url, description="HLS playback URL"),
                SystemConfig(
                    key="refresh_interval_seconds",
                    value=str(settings.api_refresh_interval_seconds),
                    description="Dashboard refresh interval",
                ),
                SystemConfig(key="database_type", value=_database_type(settings.database_url), description="Current DB type"),
            ]
        )

    if not db.scalar(select(AlertEvent).limit(1)):
        now = datetime.now(timezone.utc)
        db.add_all(
            [
                AlertEvent(
                    occurred_at=now - timedelta(minutes=8),
                    alert_type="病害疑似",
                    content="3号烟田东侧发现疑似赤星病斑块",
                    confidence=0.91,
                    status="待复核",
                ),
                AlertEvent(
                    occurred_at=now - timedelta(minutes=4),
                    alert_type="虫害风险",
                    content="2号航线中段检测到虫害密度升高",
                    confidence=0.86,
                    status="处理中",
                ),
                AlertEvent(
                    occurred_at=now - timedelta(minutes=1),
                    alert_type="视频链路",
                    content="HLS 延迟高于预设阈值",
                    confidence=0.78,
                    status="已记录",
                ),
            ]
        )

    if not db.scalar(select(DetectionStatistic).limit(1)):
        db.add(DetectionStatistic(total_count=1286, current_minute_count=17, risk_index=63.5))

    db.commit()


def _database_type(database_url: str) -> str:
    if database_url.startswith("sqlite"):
        return "SQLite"
    if database_url.startswith("mysql"):
        return "MySQL"
    return "Unknown"
