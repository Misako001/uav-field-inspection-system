from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from app.models import AnalysisFrame, AnalysisJob, AnalysisResult, AlertEvent, DetectionStatistic, SystemConfig  # noqa: F401
    from app.seed import seed_initial_data

    Base.metadata.create_all(bind=engine)
    _migrate_sqlite_schema()
    with SessionLocal() as db:
        seed_initial_data(db)


def _migrate_sqlite_schema() -> None:
    if not settings.database_url.startswith("sqlite"):
        return

    required_columns = {
        "analysis_results": {
            "segmentation_image_path": "TEXT DEFAULT ''",
            "overlay_segmentation_path": "TEXT DEFAULT ''",
            "weed_area_ratio": "FLOAT DEFAULT 0.0",
            "crop_area_ratio": "FLOAT DEFAULT 0.0",
            "background_area_ratio": "FLOAT DEFAULT 0.0",
            "weed_component_count": "INTEGER DEFAULT 0",
        },
        "analysis_frames": {
            "segmentation_image_path": "TEXT DEFAULT ''",
            "overlay_segmentation_path": "TEXT DEFAULT ''",
            "weed_area_ratio": "FLOAT DEFAULT 0.0",
            "crop_area_ratio": "FLOAT DEFAULT 0.0",
            "background_area_ratio": "FLOAT DEFAULT 0.0",
            "weed_component_count": "INTEGER DEFAULT 0",
        },
    }

    with engine.begin() as connection:
        for table_name, columns in required_columns.items():
            existing_columns = {
                row[1]
                for row in connection.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
            }
            for column_name, ddl in columns.items():
                if column_name in existing_columns:
                    continue
                connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {ddl}"))
