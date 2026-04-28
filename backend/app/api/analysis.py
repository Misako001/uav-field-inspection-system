from fastapi import APIRouter, Depends, File, Query, UploadFile, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import (
    AnalysisImageResponse,
    AnalysisJobDetailRead,
    AnalysisJobListRead,
    AnalysisStopResponse,
    AnalysisStreamCreate,
)
from app.services.analysis import (
    analysis_realtime_hub,
    as_public_storage_path,
    create_analysis_job,
    get_analysis_job_detail,
    list_analysis_jobs,
    run_image_analysis,
    save_upload_file,
)

router = APIRouter(prefix="/api/analysis", tags=["analysis"])
ws_router = APIRouter(tags=["analysis"])


@router.post("/images", response_model=AnalysisImageResponse)
async def analyze_image(file: UploadFile = File(...), db: Session = Depends(get_db)) -> AnalysisImageResponse:
    saved_path = await save_upload_file(file, "uploads/images")
    job = create_analysis_job(
        db,
        source_type="image",
        source_name=file.filename or saved_path.name,
        source_media_path=as_public_storage_path(saved_path),
    )
    return run_image_analysis(db, job, saved_path)


@router.post("/videos", response_model=AnalysisJobDetailRead)
async def analyze_video(file: UploadFile = File(...), db: Session = Depends(get_db)) -> AnalysisJobDetailRead:
    saved_path = await save_upload_file(file, "uploads/videos")
    job = create_analysis_job(
        db,
        source_type="video",
        source_name=file.filename or saved_path.name,
        source_media_path=as_public_storage_path(saved_path),
    )
    analysis_realtime_hub.launch_video_job(job.id)
    return get_analysis_job_detail(db, job.id)


@router.post("/streams", response_model=AnalysisJobDetailRead)
async def analyze_stream(payload: AnalysisStreamCreate, db: Session = Depends(get_db)) -> AnalysisJobDetailRead:
    job = create_analysis_job(
        db,
        source_type="stream",
        source_name=payload.source_url,
        source_uri=payload.source_url,
    )
    analysis_realtime_hub.launch_stream_job(job.id)
    return get_analysis_job_detail(db, job.id)


@router.get("/jobs", response_model=AnalysisJobListRead)
def read_analysis_jobs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    source_type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> AnalysisJobListRead:
    return list_analysis_jobs(db, page=page, page_size=page_size, source_type=source_type, status=status)


@router.get("/jobs/{job_id}", response_model=AnalysisJobDetailRead)
def read_analysis_job(job_id: int, db: Session = Depends(get_db)) -> AnalysisJobDetailRead:
    return get_analysis_job_detail(db, job_id)


@router.get("/jobs/{job_id}/results", response_model=AnalysisJobDetailRead)
def read_analysis_results(job_id: int, db: Session = Depends(get_db)) -> AnalysisJobDetailRead:
    return get_analysis_job_detail(db, job_id)


@router.post("/jobs/{job_id}/stop", response_model=AnalysisStopResponse)
def stop_analysis_job(job_id: int) -> AnalysisStopResponse:
    return analysis_realtime_hub.stop_job(job_id)


@ws_router.websocket("/ws/analysis/{job_id}")
async def analysis_job_updates(websocket: WebSocket, job_id: int) -> None:
    await analysis_realtime_hub.register(job_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        analysis_realtime_hub.unregister(job_id, websocket)
