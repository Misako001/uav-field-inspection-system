from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import DetectionStatistics
from app.services.monitoring import get_detection_statistics

router = APIRouter(prefix="/api/detection", tags=["detection"])


@router.get("/statistics", response_model=DetectionStatistics)
def read_detection_statistics(db: Session = Depends(get_db)) -> DetectionStatistics:
    return get_detection_statistics(db)
