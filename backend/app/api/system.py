from fastapi import APIRouter

from app.schemas import SystemStatus
from app.services.monitoring import get_system_status

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/status", response_model=SystemStatus)
def read_system_status() -> SystemStatus:
    return get_system_status()
