import asyncio
import logging
import math
import re
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any
from uuid import uuid4

import aiofiles
import cv2
import numpy as np
from fastapi import HTTPException, UploadFile, WebSocket
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import SessionLocal
from app.models import AnalysisFrame, AnalysisJob, AnalysisResult
from app.schemas import (
    AnalysisFrameRead,
    AnalysisImageResponse,
    AnalysisJobDetailRead,
    AnalysisJobListRead,
    AnalysisJobRead,
    AnalysisRealtimePayload,
    AnalysisResultRead,
    AnalysisStopResponse,
)

logger = logging.getLogger(__name__)


def ensure_storage_layout(settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    for relative in ("uploads/images", "uploads/videos", "uploads/streams", "results", "masks", "frames"):
        (settings.storage_root_path / relative).mkdir(parents=True, exist_ok=True)


def as_public_storage_path(path: Path, settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    relative = path.relative_to(settings.storage_root_path).as_posix()
    return f"/storage/{relative}"


def _slugify_filename(filename: str) -> str:
    stem = Path(filename).stem
    suffix = Path(filename).suffix or ".bin"
    sanitized = re.sub(r"[^a-zA-Z0-9_-]+", "-", stem).strip("-").lower() or "file"
    return f"{sanitized}{suffix.lower()}"


async def save_upload_file(upload: UploadFile, relative_dir: str) -> Path:
    settings = get_settings()
    ensure_storage_layout(settings)
    safe_name = _slugify_filename(upload.filename or "upload.bin")
    destination = settings.storage_root_path / relative_dir / f"{uuid4().hex}_{safe_name}"

    async with aiofiles.open(destination, "wb") as file_handle:
        while chunk := await upload.read(1024 * 1024):
            await file_handle.write(chunk)
    await upload.close()
    return destination


@dataclass
class InferenceOutput:
    probability_map: np.ndarray
    class_map: np.ndarray
    binary_mask: np.ndarray
    crop_mask: np.ndarray
    background_mask: np.ndarray
    confidence_summary: float


class BaseModelRunner:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def infer(self, image_rgb: np.ndarray) -> InferenceOutput:  # pragma: no cover - interface method
        raise NotImplementedError

    @property
    def backend_label(self) -> str:
        return self.settings.model_backend


class MockWeedSegmentationRunner(BaseModelRunner):
    def infer(self, image_rgb: np.ndarray) -> InferenceOutput:
        hsv = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
        image = image_rgb.astype(np.float32) / 255.0
        r = image[:, :, 0]
        g = image[:, :, 1]
        b = image[:, :, 2]
        h = hsv[:, :, 0]
        s = hsv[:, :, 1] / 255.0
        v = hsv[:, :, 2] / 255.0

        excess_green = np.clip(((2.0 * g) - r - b + 1.0) / 2.0, 0.0, 1.0)
        hue_green = np.clip(1.0 - (np.abs(h - 60.0) / 26.0), 0.0, 1.0)
        saturation_support = np.clip((s - 0.18) / 0.55, 0.0, 1.0)
        brightness_penalty = np.clip((v - 0.9) * 0.18, 0.0, 0.12)

        vegetation_response = (hue_green * 0.5) + (excess_green * 0.36) + (saturation_support * 0.18) - brightness_penalty
        texture = cv2.GaussianBlur(np.clip(vegetation_response, 0.0, 1.0), (0, 0), sigmaX=2.6)
        probability = np.clip(texture, 0.0, 1.0)

        mask = (probability >= self.settings.image_result_threshold).astype(np.uint8)
        kernel = np.ones((3, 3), dtype=np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

        vegetation_mask = (probability >= max(self.settings.image_result_threshold * 0.7, 0.24)).astype(np.uint8)
        crop_mask = np.where((vegetation_mask > 0) & (mask == 0), 1, 0).astype(np.uint8)
        background_mask = np.where(vegetation_mask > 0, 0, 1).astype(np.uint8)
        class_map = np.zeros_like(mask, dtype=np.uint8)
        class_map[crop_mask > 0] = self.settings.model_class_index_crop
        class_map[mask > 0] = self.settings.model_class_index_weed

        active_probabilities = probability[mask > 0]
        confidence = float(active_probabilities.mean()) if active_probabilities.size else float(probability.mean() * 0.35)
        return InferenceOutput(
            probability_map=probability,
            class_map=class_map,
            binary_mask=mask,
            crop_mask=crop_mask,
            background_mask=background_mask,
            confidence_summary=confidence,
        )


class CkptModelRunner(BaseModelRunner):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self._torch = self._require_module("torch")
        self._smp = self._require_module("segmentation_models_pytorch")
        self.device = self._resolve_device()
        self.model = self._load_model()
        self.mean = self._torch.tensor([0.485, 0.456, 0.406], dtype=self._torch.float32, device=self.device).view(1, 3, 1, 1)
        self.std = self._torch.tensor([0.229, 0.224, 0.225], dtype=self._torch.float32, device=self.device).view(1, 3, 1, 1)

    @property
    def backend_label(self) -> str:
        return f"{self.settings.model_type}@{self.device}"

    def infer(self, image_rgb: np.ndarray) -> InferenceOutput:
        original_height, original_width = image_rgb.shape[:2]
        image_tensor = self._torch.from_numpy(image_rgb.astype(np.float32) / 255.0).permute(2, 0, 1).unsqueeze(0).to(self.device)
        image_tensor = (image_tensor - self.mean) / self.std
        image_tensor, crop_height, crop_width = self._pad_to_stride(image_tensor, stride=16)

        with self._torch.inference_mode():
            logits = self.model(image_tensor)
            if isinstance(logits, (tuple, list)):
                logits = logits[0]
            if isinstance(logits, dict):
                logits = logits.get("out") or logits.get("logits")
            if logits is None:
                raise RuntimeError("模型推理未返回有效 logits。")

            logits = logits[:, :, :crop_height, :crop_width]
            logits = logits[:, :, :original_height, :original_width]

            probabilities = self._torch.softmax(logits, dim=1)
            weed_index = self.settings.model_class_index_weed
            weed_probability = probabilities[:, weed_index, :, :]
            class_map = probabilities.argmax(dim=1)

        probability_map = weed_probability.squeeze(0).detach().cpu().numpy().astype(np.float32)
        class_map_np = class_map.squeeze(0).detach().cpu().numpy().astype(np.uint8)
        refined = _refine_scene_masks(image_rgb, class_map_np, probability_map, self.settings)

        active_probabilities = probability_map[refined["weed_mask"] > 0]
        confidence = float(active_probabilities.mean()) if active_probabilities.size else float(probability_map.mean())
        return InferenceOutput(
            probability_map=probability_map,
            class_map=refined["class_map"],
            binary_mask=refined["weed_mask"],
            crop_mask=refined["crop_mask"],
            background_mask=refined["background_mask"],
            confidence_summary=confidence,
        )

    def _pad_to_stride(self, tensor, *, stride: int):
        _, _, height, width = tensor.shape
        padded_height = math.ceil(height / stride) * stride
        padded_width = math.ceil(width / stride) * stride
        pad_bottom = padded_height - height
        pad_right = padded_width - width
        if pad_bottom == 0 and pad_right == 0:
            return tensor, height, width
        tensor = self._torch.nn.functional.pad(tensor, (0, pad_right, 0, pad_bottom), mode="reflect")
        return tensor, height, width

    def _load_model(self):
        model_path = self.settings.model_path_resolved
        if model_path is None:
            raise RuntimeError("MODEL_PATH 未配置，无法加载真实 checkpoint。")
        if not model_path.exists():
            raise RuntimeError(f"模型文件不存在: {model_path}")

        if self.settings.model_type != "deeplabv3plus_resnet34":
            raise RuntimeError(f"当前仅支持 MODEL_TYPE=deeplabv3plus_resnet34，收到: {self.settings.model_type}")

        checkpoint = self._torch.load(model_path, map_location="cpu")
        state_dict = checkpoint["model"] if isinstance(checkpoint, dict) and "model" in checkpoint else checkpoint
        if not isinstance(state_dict, dict):
            raise RuntimeError("checkpoint 中未找到可用的 state_dict。")

        model = self._smp.DeepLabV3Plus(
            encoder_name="resnet34",
            encoder_weights=None,
            in_channels=3,
            classes=3,
            activation=None,
        )

        missing, unexpected = model.load_state_dict(state_dict, strict=False)
        if missing or unexpected:
            raise RuntimeError(
                "checkpoint 与模型结构不匹配，"
                f"missing={missing[:10]}, unexpected={unexpected[:10]}"
            )

        model.eval()
        model.to(self.device)
        return model

    def _resolve_device(self) -> str:
        requested = self.settings.model_device.lower()
        if requested == "auto":
            return "cuda:0" if self._torch.cuda.is_available() else "cpu"
        if requested == "cuda" and self._torch.cuda.is_available():
            return "cuda:0"
        if requested.startswith("cuda") and self._torch.cuda.is_available():
            return requested
        return "cpu"

    @staticmethod
    def _require_module(module_name: str):
        try:
            return __import__(module_name)
        except ModuleNotFoundError as exc:  # pragma: no cover - env-specific
            raise RuntimeError(f"缺少模型运行依赖: {module_name}") from exc


class ModelRunnerFactory:
    @staticmethod
    def create(settings: Settings | None = None) -> BaseModelRunner:
        settings = settings or get_settings()
        return _get_cached_runner(
            settings.model_backend.lower(),
            settings.model_type,
            str(settings.model_path_resolved or ""),
            settings.model_device.lower(),
            settings.model_class_index_weed,
            settings.model_allow_mock_fallback,
        )


@lru_cache(maxsize=8)
def _get_cached_runner(
    model_backend: str,
    model_type: str,
    model_path: str,
    model_device: str,
    model_class_index_weed: int,
    allow_mock_fallback: bool,
) -> BaseModelRunner:
    settings = get_settings()
    if model_backend in {"ckpt", "checkpoint", "deeplabv3plus", "real"}:
        try:
            runner = CkptModelRunner(settings)
            logger.info("Loaded weed segmentation model from %s on %s", model_path or "<empty>", runner.backend_label)
            return runner
        except Exception as exc:  # pragma: no cover - runtime path
            if not allow_mock_fallback:
                raise
            logger.exception("Failed to load checkpoint model, falling back to mock runner: %s", exc)
            return MockWeedSegmentationRunner(settings)
    return MockWeedSegmentationRunner(settings)


def _read_rgb_image(image_path: Path) -> np.ndarray:
    image_bgr = cv2.imread(str(image_path))
    if image_bgr is None:
        raise HTTPException(status_code=400, detail=f"无法读取图像文件: {image_path.name}")
    return cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)


def _write_rgb_image(image_rgb: np.ndarray, destination: Path) -> None:
    image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
    cv2.imwrite(str(destination), image_bgr)


def _write_mask_image(mask: np.ndarray, destination: Path) -> None:
    cv2.imwrite(str(destination), (mask.astype(np.uint8) * 255))


def _kernel(size: int) -> np.ndarray:
    size = max(1, int(size))
    if size % 2 == 0:
        size += 1
    return np.ones((size, size), dtype=np.uint8)


def _build_vegetation_mask(image_rgb: np.ndarray, settings: Settings) -> np.ndarray:
    image = image_rgb.astype(np.float32) / 255.0
    r = image[:, :, 0]
    g = image[:, :, 1]
    b = image[:, :, 2]
    hsv = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
    hue = hsv[:, :, 0]
    saturation = hsv[:, :, 1] / 255.0

    excess_green = np.clip((2.0 * g) - r - b, -1.0, 1.0)
    green_hue = np.where((hue >= 28.0) & (hue <= 110.0), 1, 0)
    vegetation = (
        (excess_green >= settings.vegetation_excess_green_threshold)
        & (saturation >= settings.vegetation_saturation_threshold)
        & (green_hue > 0)
    )
    return vegetation.astype(np.uint8)


def _refine_scene_masks(
    image_rgb: np.ndarray,
    class_map: np.ndarray,
    probability_map: np.ndarray,
    settings: Settings,
) -> dict[str, np.ndarray]:
    weed_index = settings.model_class_index_weed
    crop_index = settings.model_class_index_crop
    vegetation_mask = _build_vegetation_mask(image_rgb, settings)

    weed_mask = np.where(
        ((class_map == weed_index) | (probability_map >= float(settings.image_result_threshold)))
        & (vegetation_mask > 0),
        1,
        0,
    ).astype(np.uint8)

    weed_mask = cv2.morphologyEx(weed_mask, cv2.MORPH_OPEN, _kernel(settings.morphology_open_kernel_size))
    weed_mask = cv2.morphologyEx(weed_mask, cv2.MORPH_CLOSE, _kernel(settings.morphology_close_kernel_size))

    component_count, labels, stats, _ = cv2.connectedComponentsWithStats((weed_mask * 255).astype(np.uint8))
    filtered_weed = np.zeros_like(weed_mask, dtype=np.uint8)

    for index in range(1, component_count):
        area = int(stats[index, cv2.CC_STAT_AREA])
        width = max(1, int(stats[index, cv2.CC_STAT_WIDTH]))
        height = max(1, int(stats[index, cv2.CC_STAT_HEIGHT]))
        aspect_ratio = max(width, height) / max(1.0, min(width, height))
        fill_ratio = area / float(width * height)
        component_mask = labels == index
        component_probability = float(probability_map[component_mask].mean()) if np.any(component_mask) else 0.0

        if area < settings.weed_min_component_area:
            continue
        if aspect_ratio > settings.weed_max_component_aspect_ratio and fill_ratio < settings.weed_min_component_fill_ratio:
            continue
        if component_probability < max(float(settings.image_result_threshold) * 0.82, 0.22):
            continue
        filtered_weed[component_mask] = 1

    crop_mask = np.where((vegetation_mask > 0) & (filtered_weed == 0), 1, 0).astype(np.uint8)
    background_mask = np.where(vegetation_mask > 0, 0, 1).astype(np.uint8)
    refined_class_map = np.zeros_like(class_map, dtype=np.uint8)
    refined_class_map[crop_mask > 0] = crop_index
    refined_class_map[filtered_weed > 0] = weed_index

    return {
        "class_map": refined_class_map,
        "weed_mask": filtered_weed,
        "crop_mask": crop_mask,
        "background_mask": background_mask,
    }


def _make_heatmap_overlay(image_rgb: np.ndarray, probability_map: np.ndarray, binary_mask: np.ndarray) -> np.ndarray:
    heat_input = np.clip(probability_map * 255.0, 0, 255).astype(np.uint8)
    heat_bgr = cv2.applyColorMap(heat_input, cv2.COLORMAP_JET)
    heat_rgb = cv2.cvtColor(heat_bgr, cv2.COLOR_BGR2RGB)

    alpha = np.where(binary_mask[..., None] > 0, 0.52, 0.12).astype(np.float32)
    overlay = (image_rgb.astype(np.float32) * (1.0 - alpha)) + (heat_rgb.astype(np.float32) * alpha)
    return np.clip(overlay, 0, 255).astype(np.uint8)


def _make_segmentation_image(class_map: np.ndarray, settings: Settings) -> np.ndarray:
    crop_index = settings.model_class_index_crop
    weed_index = settings.model_class_index_weed
    image = np.zeros((*class_map.shape, 3), dtype=np.uint8)
    image[class_map == 0] = np.array([36, 46, 58], dtype=np.uint8)
    image[class_map == crop_index] = np.array([85, 214, 116], dtype=np.uint8)
    image[class_map == weed_index] = np.array([255, 88, 104], dtype=np.uint8)
    return image


def _make_segmentation_overlay(image_rgb: np.ndarray, class_map: np.ndarray, settings: Settings) -> np.ndarray:
    segmentation = _make_segmentation_image(class_map, settings)
    overlay = cv2.addWeighted(image_rgb.astype(np.uint8), 0.56, segmentation.astype(np.uint8), 0.44, 0.0)

    weed_mask = (class_map == settings.model_class_index_weed).astype(np.uint8)
    crop_mask = (class_map == settings.model_class_index_crop).astype(np.uint8)
    for mask, color in ((crop_mask, (102, 232, 128)), (weed_mask, (255, 92, 92))):
        contours, _ = cv2.findContours((mask * 255).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(overlay, contours, -1, color, 2)
    return overlay


def _estimate_component_count(binary_mask: np.ndarray, min_area: int) -> int:
    mask_uint8 = (binary_mask.astype(np.uint8) * 255)
    component_count, _, stats, _ = cv2.connectedComponentsWithStats(mask_uint8)
    valid = 0
    for index in range(1, component_count):
        area = stats[index, cv2.CC_STAT_AREA]
        if area >= min_area:
            valid += 1
    return valid


@dataclass
class RenderArtifacts:
    runner_backend: str
    source_path: str
    heatmap_path: str
    mask_path: str
    segmentation_path: str
    overlay_segmentation_path: str
    weed_coverage_ratio: float
    weed_area_ratio: float
    crop_area_ratio: float
    background_area_ratio: float
    weed_pixel_area: int
    estimated_plant_count: int
    weed_component_count: int
    average_confidence: float
    processing_time_ms: int


def process_rgb_frame(image_rgb: np.ndarray, *, file_stem: str, result_dir: str) -> RenderArtifacts:
    settings = get_settings()
    ensure_storage_layout(settings)
    runner = ModelRunnerFactory.create(settings)
    started = time.perf_counter()
    inference = runner.infer(image_rgb)

    weed_pixel_area = int(np.count_nonzero(inference.binary_mask))
    crop_pixel_area = int(np.count_nonzero(inference.crop_mask))
    background_pixel_area = int(np.count_nonzero(inference.background_mask))
    total_pixels = int(inference.class_map.size)
    coverage_ratio = float(weed_pixel_area / total_pixels) if total_pixels else 0.0
    crop_area_ratio = float(crop_pixel_area / total_pixels) if total_pixels else 0.0
    background_area_ratio = float(background_pixel_area / total_pixels) if total_pixels else 0.0
    component_count = _estimate_component_count(inference.binary_mask, settings.weed_min_component_area)
    heatmap_rgb = _make_heatmap_overlay(image_rgb, inference.probability_map, inference.binary_mask)
    segmentation_rgb = _make_segmentation_image(inference.class_map, settings)
    segmentation_overlay_rgb = _make_segmentation_overlay(image_rgb, inference.class_map, settings)
    processing_time_ms = int((time.perf_counter() - started) * 1000)

    result_root = settings.storage_root_path / result_dir
    result_root.mkdir(parents=True, exist_ok=True)
    mask_root = settings.storage_root_path / "masks" / result_dir
    mask_root.mkdir(parents=True, exist_ok=True)

    source_path = result_root / f"{file_stem}_source.jpg"
    heatmap_path = result_root / f"{file_stem}_heatmap.jpg"
    segmentation_path = result_root / f"{file_stem}_segmentation.jpg"
    overlay_segmentation_path = result_root / f"{file_stem}_segmentation_overlay.jpg"
    mask_path = mask_root / f"{file_stem}_mask.png"

    _write_rgb_image(image_rgb, source_path)
    _write_rgb_image(heatmap_rgb, heatmap_path)
    _write_rgb_image(segmentation_rgb, segmentation_path)
    _write_rgb_image(segmentation_overlay_rgb, overlay_segmentation_path)
    _write_mask_image(inference.binary_mask, mask_path)

    return RenderArtifacts(
        runner_backend=runner.backend_label,
        source_path=as_public_storage_path(source_path, settings),
        heatmap_path=as_public_storage_path(heatmap_path, settings),
        mask_path=as_public_storage_path(mask_path, settings),
        segmentation_path=as_public_storage_path(segmentation_path, settings),
        overlay_segmentation_path=as_public_storage_path(overlay_segmentation_path, settings),
        weed_coverage_ratio=coverage_ratio,
        weed_area_ratio=coverage_ratio,
        crop_area_ratio=crop_area_ratio,
        background_area_ratio=background_area_ratio,
        weed_pixel_area=weed_pixel_area,
        estimated_plant_count=component_count,
        weed_component_count=component_count,
        average_confidence=float(inference.confidence_summary),
        processing_time_ms=processing_time_ms,
    )


def run_image_analysis(db: Session, job: AnalysisJob, source_file_path: Path) -> AnalysisImageResponse:
    settings = get_settings()
    image_rgb = _read_rgb_image(source_file_path)

    job.status = "running"
    job.started_at = datetime.now(timezone.utc)
    job.progress = 0.15
    db.commit()

    try:
        artifacts = process_rgb_frame(image_rgb, file_stem=f"job_{job.id}", result_dir=f"results/job_{job.id}")
    except Exception as exc:
        job.status = "failed"
        job.error_message = str(exc)
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
        raise HTTPException(status_code=500, detail=f"图片分析失败: {exc}") from exc
    result = AnalysisResult(
        job_id=job.id,
        source_image_path=artifacts.source_path,
        heatmap_image_path=artifacts.heatmap_path,
        mask_image_path=artifacts.mask_path,
        segmentation_image_path=artifacts.segmentation_path,
        overlay_segmentation_path=artifacts.overlay_segmentation_path,
        thumbnail_path=artifacts.overlay_segmentation_path,
        weed_coverage_ratio=artifacts.weed_coverage_ratio,
        weed_area_ratio=artifacts.weed_area_ratio,
        crop_area_ratio=artifacts.crop_area_ratio,
        background_area_ratio=artifacts.background_area_ratio,
        weed_pixel_area=artifacts.weed_pixel_area,
        estimated_plant_count=artifacts.estimated_plant_count,
        weed_component_count=artifacts.weed_component_count,
        average_confidence=artifacts.average_confidence,
        processing_time_ms=artifacts.processing_time_ms,
        summary_note="图片分析完成，已生成热力图、彩色分割图和面积构成统计。",
    )
    db.add(result)
    db.flush()

    job.latest_result_id = result.id
    job.model_backend = artifacts.runner_backend
    job.status = "completed"
    job.progress = 1.0
    job.frame_count = 1
    job.average_coverage_ratio = artifacts.weed_coverage_ratio
    job.estimated_plant_count = artifacts.estimated_plant_count
    job.average_confidence = artifacts.average_confidence
    job.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(job)
    db.refresh(result)
    return AnalysisImageResponse(job=AnalysisJobRead.model_validate(job), result=AnalysisResultRead.model_validate(result))


def create_analysis_job(
    db: Session,
    *,
    source_type: str,
    source_name: str,
    source_uri: str = "",
    source_media_path: str = "",
) -> AnalysisJob:
    settings = get_settings()
    backend_label = settings.model_type if settings.model_backend.lower() in {"ckpt", "checkpoint", "deeplabv3plus", "real"} else settings.model_backend
    job = AnalysisJob(
        source_type=source_type,
        source_name=source_name,
        source_uri=source_uri,
        source_media_path=source_media_path,
        model_backend=backend_label,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def get_job_or_404(db: Session, job_id: int) -> AnalysisJob:
    job = db.get(AnalysisJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"分析任务 {job_id} 不存在")
    return job


def list_analysis_jobs(
    db: Session,
    *,
    page: int = 1,
    page_size: int = 20,
    source_type: str | None = None,
    status: str | None = None,
) -> AnalysisJobListRead:
    filters = []
    if source_type:
        filters.append(AnalysisJob.source_type == source_type)
    if status:
        filters.append(AnalysisJob.status == status)

    total = db.scalar(select(func.count()).select_from(AnalysisJob).where(*filters)) or 0
    jobs = db.scalars(
        select(AnalysisJob)
        .where(*filters)
        .order_by(desc(AnalysisJob.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return AnalysisJobListRead(
        items=[AnalysisJobRead.model_validate(job) for job in jobs],
        total=int(total),
        page=page,
        page_size=page_size,
    )


def get_analysis_job_detail(db: Session, job_id: int, *, frame_limit: int = 16) -> AnalysisJobDetailRead:
    job = get_job_or_404(db, job_id)
    latest_result = None
    if job.latest_result_id:
        result = db.get(AnalysisResult, job.latest_result_id)
        if result is not None:
            latest_result = AnalysisResultRead.model_validate(result)

    frames = db.scalars(
        select(AnalysisFrame)
        .where(AnalysisFrame.job_id == job.id)
        .order_by(desc(AnalysisFrame.frame_index))
        .limit(frame_limit)
    ).all()

    return AnalysisJobDetailRead(
        job=AnalysisJobRead.model_validate(job),
        latest_result=latest_result,
        frames=[AnalysisFrameRead.model_validate(frame) for frame in reversed(frames)],
    )


def get_latest_analysis_summary(db: Session) -> dict[str, Any] | None:
    latest_job = db.scalar(select(AnalysisJob).order_by(desc(AnalysisJob.created_at)).limit(1))
    if latest_job is None:
        return None
    latest_result = db.get(AnalysisResult, latest_job.latest_result_id) if latest_job.latest_result_id else None
    if latest_result is None:
        return {
            "job_id": latest_job.id,
            "source_type": latest_job.source_type,
            "status": latest_job.status,
            "progress": latest_job.progress,
        }
    return {
        "job_id": latest_job.id,
        "source_type": latest_job.source_type,
        "status": latest_job.status,
        "coverage_ratio": latest_result.weed_area_ratio or latest_result.weed_coverage_ratio,
        "estimated_plant_count": latest_result.estimated_plant_count,
        "result_time": latest_result.result_time,
        "heatmap_image_path": latest_result.overlay_segmentation_path or latest_result.heatmap_image_path,
    }


def _job_payload(db: Session, job_id: int) -> AnalysisRealtimePayload:
    detail = get_analysis_job_detail(db, job_id, frame_limit=1)
    latest_frame = detail.frames[-1] if detail.frames else None
    return AnalysisRealtimePayload(
        event="analysis.job.update",
        emitted_at=datetime.now(timezone.utc),
        job=detail.job,
        latest_result=detail.latest_result,
        latest_frame=latest_frame,
    )


class AnalysisRealtimeHub:
    def __init__(self) -> None:
        self._connections: dict[int, set[WebSocket]] = defaultdict(set)
        self._tasks: dict[int, asyncio.Task[None]] = {}
        self._stop_events: dict[int, asyncio.Event] = {}
        self._semaphore = asyncio.Semaphore(get_settings().max_concurrent_analysis_jobs)
        self._loop: asyncio.AbstractEventLoop | None = None

    async def register(self, job_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[job_id].add(websocket)
        with SessionLocal() as db:
            await websocket.send_json(_job_payload(db, job_id).model_dump(mode="json"))

    def unregister(self, job_id: int, websocket: WebSocket) -> None:
        self._connections[job_id].discard(websocket)
        if not self._connections[job_id]:
            self._connections.pop(job_id, None)

    async def broadcast_snapshot(self, job_id: int) -> None:
        sockets = list(self._connections.get(job_id, set()))
        if not sockets:
            return

        with SessionLocal() as db:
            payload = _job_payload(db, job_id).model_dump(mode="json")

        stale: list[WebSocket] = []
        for socket in sockets:
            try:
                await socket.send_json(payload)
            except Exception:
                stale.append(socket)

        for socket in stale:
            self.unregister(job_id, socket)

    def stop_job(self, job_id: int) -> AnalysisStopResponse:
        stop_event = self._stop_events.get(job_id)
        if stop_event is None:
            return AnalysisStopResponse(job_id=job_id, status="not_running", message="任务当前未处于运行态。")
        stop_event.set()
        return AnalysisStopResponse(job_id=job_id, status="stopping", message="已发送停止信号，等待任务收尾。")

    def launch_video_job(self, job_id: int) -> None:
        self._loop = asyncio.get_running_loop()
        self._tasks[job_id] = asyncio.create_task(self._run_video_job(job_id))

    def launch_stream_job(self, job_id: int) -> None:
        self._loop = asyncio.get_running_loop()
        self._tasks[job_id] = asyncio.create_task(self._run_stream_job(job_id))

    def _schedule_broadcast(self, job_id: int) -> None:
        if self._loop is None:
            return
        asyncio.run_coroutine_threadsafe(self.broadcast_snapshot(job_id), self._loop)

    async def _run_video_job(self, job_id: int) -> None:
        async with self._semaphore:
            stop_event = asyncio.Event()
            self._stop_events[job_id] = stop_event
            try:
                await asyncio.to_thread(self._process_video_job_sync, job_id, stop_event)
            finally:
                self._stop_events.pop(job_id, None)
                self._tasks.pop(job_id, None)
                await self.broadcast_snapshot(job_id)

    async def _run_stream_job(self, job_id: int) -> None:
        async with self._semaphore:
            stop_event = asyncio.Event()
            self._stop_events[job_id] = stop_event
            try:
                await self._process_stream_job(job_id, stop_event)
            finally:
                self._stop_events.pop(job_id, None)
                self._tasks.pop(job_id, None)
                await self.broadcast_snapshot(job_id)

    def _process_video_job_sync(self, job_id: int, stop_event: asyncio.Event) -> None:
        settings = get_settings()
        ensure_storage_layout(settings)
        with SessionLocal() as db:
            job = get_job_or_404(db, job_id)
            job.status = "running"
            job.started_at = datetime.now(timezone.utc)
            job.progress = 0.02
            db.commit()

            source_path = settings.storage_root_path / job.source_media_path.removeprefix("/storage/")
            capture = cv2.VideoCapture(str(source_path))
            if not capture.isOpened():
                job.status = "failed"
                job.error_message = "视频文件无法打开。"
                job.completed_at = datetime.now(timezone.utc)
                db.commit()
                return

            fps = capture.get(cv2.CAP_PROP_FPS) or 24.0
            total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
            sample_interval = max(1, int(round(fps / max(settings.video_sample_fps, 0.1))))
            frame_index = 0
            sampled_count = 0
            coverage_sum = 0.0
            confidence_sum = 0.0
            plant_sum = 0
            latest_result: AnalysisResult | None = None

            while True:
                if stop_event.is_set():
                    job.status = "stopped"
                    break

                success, frame_bgr = capture.read()
                if not success:
                    job.status = "completed"
                    break

                if frame_index % sample_interval != 0:
                    frame_index += 1
                    continue

                frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                try:
                    artifacts = process_rgb_frame(
                        frame_rgb,
                        file_stem=f"job_{job.id}_frame_{sampled_count:04d}",
                        result_dir=f"frames/job_{job.id}",
                    )
                except Exception as exc:
                    job.status = "failed"
                    job.error_message = str(exc)
                    db.commit()
                    break

                frame_record = AnalysisFrame(
                    job_id=job.id,
                    frame_index=sampled_count,
                    frame_timestamp_seconds=float(frame_index / fps) if fps else float(sampled_count),
                    source_frame_path=artifacts.source_path,
                    heatmap_image_path=artifacts.heatmap_path,
                    mask_image_path=artifacts.mask_path,
                    segmentation_image_path=artifacts.segmentation_path,
                    overlay_segmentation_path=artifacts.overlay_segmentation_path,
                    weed_coverage_ratio=artifacts.weed_coverage_ratio,
                    weed_area_ratio=artifacts.weed_area_ratio,
                    crop_area_ratio=artifacts.crop_area_ratio,
                    background_area_ratio=artifacts.background_area_ratio,
                    weed_pixel_area=artifacts.weed_pixel_area,
                    estimated_plant_count=artifacts.estimated_plant_count,
                    weed_component_count=artifacts.weed_component_count,
                    average_confidence=artifacts.average_confidence,
                )
                db.add(frame_record)
                db.flush()

                if latest_result is None:
                    latest_result = AnalysisResult(job_id=job.id)
                    db.add(latest_result)
                    db.flush()

                latest_result.source_image_path = artifacts.source_path
                latest_result.heatmap_image_path = artifacts.heatmap_path
                latest_result.mask_image_path = artifacts.mask_path
                latest_result.segmentation_image_path = artifacts.segmentation_path
                latest_result.overlay_segmentation_path = artifacts.overlay_segmentation_path
                latest_result.thumbnail_path = artifacts.overlay_segmentation_path
                latest_result.weed_coverage_ratio = artifacts.weed_coverage_ratio
                latest_result.weed_area_ratio = artifacts.weed_area_ratio
                latest_result.crop_area_ratio = artifacts.crop_area_ratio
                latest_result.background_area_ratio = artifacts.background_area_ratio
                latest_result.weed_pixel_area = artifacts.weed_pixel_area
                latest_result.estimated_plant_count = artifacts.estimated_plant_count
                latest_result.weed_component_count = artifacts.weed_component_count
                latest_result.average_confidence = artifacts.average_confidence
                latest_result.processing_time_ms = artifacts.processing_time_ms
                latest_result.result_time = datetime.now(timezone.utc)
                latest_result.summary_note = "视频抽帧分析进行中，已生成热力图与彩色分割图。"

                sampled_count += 1
                coverage_sum += artifacts.weed_coverage_ratio
                confidence_sum += artifacts.average_confidence
                plant_sum += artifacts.estimated_plant_count

                job.latest_result_id = latest_result.id
                job.model_backend = artifacts.runner_backend
                job.frame_count = sampled_count
                job.average_coverage_ratio = coverage_sum / sampled_count
                job.average_confidence = confidence_sum / sampled_count
                job.estimated_plant_count = int(round(plant_sum / sampled_count))
                if total_frames > 0:
                    job.progress = min(0.98, frame_index / total_frames)
                else:
                    job.progress = min(0.98, sampled_count / 20.0)
                db.commit()

                self._schedule_broadcast(job.id)
                frame_index += 1

            capture.release()
            job.completed_at = datetime.now(timezone.utc)
            if job.status == "completed":
                job.progress = 1.0
            elif job.status == "stopped":
                job.progress = min(job.progress, 0.99)
            if latest_result is not None:
                latest_result.summary_note = "视频抽帧分析已完成。"
            db.commit()

    async def _process_stream_job(self, job_id: int, stop_event: asyncio.Event) -> None:
        settings = get_settings()
        ensure_storage_layout(settings)

        with SessionLocal() as db:
            job = get_job_or_404(db, job_id)
            job.status = "running"
            job.started_at = datetime.now(timezone.utc)
            job.progress = 0.02
            db.commit()
            source_uri = job.source_uri

        if source_uri.startswith(("mock://", "demo://")):
            await self._run_mock_stream(job_id, stop_event)
            return

        capture = cv2.VideoCapture(source_uri)
        if not capture.isOpened():
            with SessionLocal() as db:
                job = get_job_or_404(db, job_id)
                job.status = "failed"
                job.error_message = "实时流地址无法打开，请检查流地址与网络连通性。"
                job.completed_at = datetime.now(timezone.utc)
                db.commit()
            return

        sampled_count = 0
        coverage_sum = 0.0
        confidence_sum = 0.0
        plant_sum = 0
        latest_result_id: int | None = None

        try:
            while not stop_event.is_set():
                success, frame_bgr = capture.read()
                if not success:
                    await asyncio.sleep(1.0)
                    continue

                frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                try:
                    artifacts = process_rgb_frame(
                        frame_rgb,
                        file_stem=f"job_{job_id}_stream_{sampled_count:04d}",
                        result_dir=f"frames/job_{job_id}",
                    )
                except Exception as exc:
                    with SessionLocal() as db:
                        job = get_job_or_404(db, job_id)
                        job.status = "failed"
                        job.error_message = str(exc)
                        job.completed_at = datetime.now(timezone.utc)
                        db.commit()
                    return

                with SessionLocal() as db:
                    job = get_job_or_404(db, job_id)
                    frame_record = AnalysisFrame(
                        job_id=job.id,
                        frame_index=sampled_count,
                        frame_timestamp_seconds=float(sampled_count * settings.stream_sample_interval_seconds),
                        source_frame_path=artifacts.source_path,
                        heatmap_image_path=artifacts.heatmap_path,
                        mask_image_path=artifacts.mask_path,
                        segmentation_image_path=artifacts.segmentation_path,
                        overlay_segmentation_path=artifacts.overlay_segmentation_path,
                        weed_coverage_ratio=artifacts.weed_coverage_ratio,
                        weed_area_ratio=artifacts.weed_area_ratio,
                        crop_area_ratio=artifacts.crop_area_ratio,
                        background_area_ratio=artifacts.background_area_ratio,
                        weed_pixel_area=artifacts.weed_pixel_area,
                        estimated_plant_count=artifacts.estimated_plant_count,
                        weed_component_count=artifacts.weed_component_count,
                        average_confidence=artifacts.average_confidence,
                    )
                    db.add(frame_record)
                    db.flush()

                    latest_result = db.get(AnalysisResult, latest_result_id) if latest_result_id else None
                    if latest_result is None:
                        latest_result = AnalysisResult(job_id=job.id)
                        db.add(latest_result)
                        db.flush()
                        latest_result_id = latest_result.id

                    latest_result.source_image_path = artifacts.source_path
                    latest_result.heatmap_image_path = artifacts.heatmap_path
                    latest_result.mask_image_path = artifacts.mask_path
                    latest_result.segmentation_image_path = artifacts.segmentation_path
                    latest_result.overlay_segmentation_path = artifacts.overlay_segmentation_path
                    latest_result.thumbnail_path = artifacts.overlay_segmentation_path
                    latest_result.weed_coverage_ratio = artifacts.weed_coverage_ratio
                    latest_result.weed_area_ratio = artifacts.weed_area_ratio
                    latest_result.crop_area_ratio = artifacts.crop_area_ratio
                    latest_result.background_area_ratio = artifacts.background_area_ratio
                    latest_result.weed_pixel_area = artifacts.weed_pixel_area
                    latest_result.estimated_plant_count = artifacts.estimated_plant_count
                    latest_result.weed_component_count = artifacts.weed_component_count
                    latest_result.average_confidence = artifacts.average_confidence
                    latest_result.processing_time_ms = artifacts.processing_time_ms
                    latest_result.result_time = datetime.now(timezone.utc)
                    latest_result.summary_note = "实时流采样分析进行中，已生成热力图与彩色分割图。"

                    sampled_count += 1
                    coverage_sum += artifacts.weed_coverage_ratio
                    confidence_sum += artifacts.average_confidence
                    plant_sum += artifacts.estimated_plant_count

                    job.latest_result_id = latest_result.id
                    job.model_backend = artifacts.runner_backend
                    job.frame_count = sampled_count
                    job.average_coverage_ratio = coverage_sum / sampled_count
                    job.average_confidence = confidence_sum / sampled_count
                    job.estimated_plant_count = int(round(plant_sum / sampled_count))
                    job.progress = min(0.99, sampled_count / 100.0)
                    db.commit()

                await self.broadcast_snapshot(job_id)
                await asyncio.sleep(max(settings.stream_sample_interval_seconds, 0.25))
        finally:
            capture.release()
            with SessionLocal() as db:
                job = get_job_or_404(db, job_id)
                if stop_event.is_set():
                    job.status = "stopped"
                elif job.status == "running":
                    job.status = "completed"
                    job.progress = 1.0
                job.completed_at = datetime.now(timezone.utc)
                db.commit()

    async def _run_mock_stream(self, job_id: int, stop_event: asyncio.Event) -> None:
        settings = get_settings()
        coverage_sum = 0.0
        confidence_sum = 0.0
        plant_sum = 0
        latest_result_id: int | None = None

        for sampled_count in range(24):
            if stop_event.is_set():
                break

            frame_rgb = self._generate_mock_stream_frame(sampled_count)
            try:
                artifacts = process_rgb_frame(
                    frame_rgb,
                    file_stem=f"job_{job_id}_mock_{sampled_count:04d}",
                    result_dir=f"frames/job_{job_id}",
                )
            except Exception as exc:
                with SessionLocal() as db:
                    job = get_job_or_404(db, job_id)
                    job.status = "failed"
                    job.error_message = str(exc)
                    job.completed_at = datetime.now(timezone.utc)
                    db.commit()
                return

            with SessionLocal() as db:
                job = get_job_or_404(db, job_id)
                frame_record = AnalysisFrame(
                    job_id=job.id,
                    frame_index=sampled_count,
                    frame_timestamp_seconds=float(sampled_count * settings.stream_sample_interval_seconds),
                    source_frame_path=artifacts.source_path,
                    heatmap_image_path=artifacts.heatmap_path,
                    mask_image_path=artifacts.mask_path,
                    segmentation_image_path=artifacts.segmentation_path,
                    overlay_segmentation_path=artifacts.overlay_segmentation_path,
                    weed_coverage_ratio=artifacts.weed_coverage_ratio,
                    weed_area_ratio=artifacts.weed_area_ratio,
                    crop_area_ratio=artifacts.crop_area_ratio,
                    background_area_ratio=artifacts.background_area_ratio,
                    weed_pixel_area=artifacts.weed_pixel_area,
                    estimated_plant_count=artifacts.estimated_plant_count,
                    weed_component_count=artifacts.weed_component_count,
                    average_confidence=artifacts.average_confidence,
                )
                db.add(frame_record)
                db.flush()

                latest_result = db.get(AnalysisResult, latest_result_id) if latest_result_id else None
                if latest_result is None:
                    latest_result = AnalysisResult(job_id=job.id)
                    db.add(latest_result)
                    db.flush()
                    latest_result_id = latest_result.id

                latest_result.source_image_path = artifacts.source_path
                latest_result.heatmap_image_path = artifacts.heatmap_path
                latest_result.mask_image_path = artifacts.mask_path
                latest_result.segmentation_image_path = artifacts.segmentation_path
                latest_result.overlay_segmentation_path = artifacts.overlay_segmentation_path
                latest_result.thumbnail_path = artifacts.overlay_segmentation_path
                latest_result.weed_coverage_ratio = artifacts.weed_coverage_ratio
                latest_result.weed_area_ratio = artifacts.weed_area_ratio
                latest_result.crop_area_ratio = artifacts.crop_area_ratio
                latest_result.background_area_ratio = artifacts.background_area_ratio
                latest_result.weed_pixel_area = artifacts.weed_pixel_area
                latest_result.estimated_plant_count = artifacts.estimated_plant_count
                latest_result.weed_component_count = artifacts.weed_component_count
                latest_result.average_confidence = artifacts.average_confidence
                latest_result.processing_time_ms = artifacts.processing_time_ms
                latest_result.result_time = datetime.now(timezone.utc)
                latest_result.summary_note = "模拟实时流采样分析进行中，已生成热力图与彩色分割图。"

                coverage_sum += artifacts.weed_coverage_ratio
                confidence_sum += artifacts.average_confidence
                plant_sum += artifacts.estimated_plant_count

                job.latest_result_id = latest_result.id
                job.model_backend = artifacts.runner_backend
                job.frame_count = sampled_count + 1
                job.average_coverage_ratio = coverage_sum / (sampled_count + 1)
                job.average_confidence = confidence_sum / (sampled_count + 1)
                job.estimated_plant_count = int(round(plant_sum / (sampled_count + 1)))
                job.progress = (sampled_count + 1) / 24.0
                db.commit()

            await self.broadcast_snapshot(job_id)
            await asyncio.sleep(max(settings.stream_sample_interval_seconds, 0.25))

        with SessionLocal() as db:
            job = get_job_or_404(db, job_id)
            job.status = "stopped" if stop_event.is_set() else "completed"
            if not stop_event.is_set():
                job.progress = 1.0
            job.completed_at = datetime.now(timezone.utc)
            db.commit()

    @staticmethod
    def _generate_mock_stream_frame(index: int) -> np.ndarray:
        height, width = 540, 960
        frame = np.zeros((height, width, 3), dtype=np.uint8)
        frame[:, :] = (62, 92, 64)

        horizon = 160
        frame[:horizon, :] = (120, 165, 210)
        for stripe in range(0, width, 80):
            cv2.rectangle(frame, (stripe, horizon + 40), (stripe + 36, horizon + 200), (70, 124, 78), -1)
        center_x = int((math.sin(index / 3.0) * 0.22 + 0.5) * width)
        cv2.ellipse(frame, (center_x, 360), (180, 74), 0, 0, 360, (42, 168, 64), -1)
        cv2.ellipse(frame, (center_x - 120, 320), (130, 56), 0, 0, 360, (32, 148, 48), -1)
        cv2.ellipse(frame, (center_x + 140, 330), (145, 62), 0, 0, 360, (54, 184, 72), -1)
        return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)


analysis_realtime_hub = AnalysisRealtimeHub()
