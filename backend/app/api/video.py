from fastapi import APIRouter

from app.schemas import VideoStatus
from app.services.monitoring import get_video_status

router = APIRouter(prefix="/api/video", tags=["video"])


@router.get("/status", response_model=VideoStatus)
def read_video_status() -> VideoStatus:
    return get_video_status()
