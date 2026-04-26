from fastapi import APIRouter

from app.schemas import SystemConfigRead
from app.services.monitoring import get_system_config

router = APIRouter(prefix="/api", tags=["config"])


@router.get("/config", response_model=SystemConfigRead)
def read_config() -> dict:
    return get_system_config()
