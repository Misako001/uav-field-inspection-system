import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder

from app.api import alerts, config, detection, system, video
from app.config import get_settings
from app.database import SessionLocal, init_db
from app.services.monitoring import get_realtime_payload


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(system.router)
app.include_router(video.router)
app.include_router(detection.router)
app.include_router(alerts.router)
app.include_router(config.router)


@app.get("/")
def read_root() -> dict[str, str]:
    return {"name": settings.app_name, "status": "running"}


@app.websocket("/ws/realtime")
async def realtime_dashboard(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            with SessionLocal() as db:
                payload = get_realtime_payload(db)
            await websocket.send_json(jsonable_encoder(payload))
            await asyncio.sleep(settings.api_refresh_interval_seconds)
    except WebSocketDisconnect:
        return
