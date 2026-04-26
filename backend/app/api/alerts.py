from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import AlertEventRead
from app.services.monitoring import get_alerts

router = APIRouter(prefix="/api", tags=["alerts"])


@router.get("/alerts", response_model=list[AlertEventRead])
def read_alerts(limit: int = Query(default=20, ge=1, le=100), db: Session = Depends(get_db)) -> list[AlertEventRead]:
    return get_alerts(db, limit=limit)
