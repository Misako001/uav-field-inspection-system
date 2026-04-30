import { useMemo, useState } from 'react';

import type { DetailTarget, FramePreviewState, PreviewMode, ResultGalleryItem, SourceType } from '../types';

interface ResultStageProps {
  sourceType: SourceType | null;
  sourceName: string;
  sourceLabelText: string;
  previewMode: PreviewMode;
  setPreviewMode: (mode: PreviewMode) => void;
  galleryItems: ResultGalleryItem[];
  showOverlay: boolean;
  overlayOpacity: number;
  fitMode: 'contain' | 'cover';
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleOverlay: () => void;
  onToggleFitMode: () => void;
  onResetView: () => void;
  onOverlayOpacityChange: (value: number) => void;
  thumbnails: FramePreviewState[];
  onFrameHover: (frameId: number | null) => void;
  onFrameClick: (frameId: number) => void;
  onStageDetailHover: (target: DetailTarget | null) => void;
  stageDetailTarget: DetailTarget;
}

function StageMedia({
  imagePath,
  fitMode,
  zoomLevel,
}: {
  imagePath: string;
  fitMode: 'contain' | 'cover';
  zoomLevel: number;
}) {
  if (!imagePath) {
    return (
      <div className="empty-stage">
        <strong>等待结果生成</strong>
        <span>上传图片、视频或启动流分析后，这里会展示当前源画面与分割结果。</span>
      </div>
    );
  }

  return (
    <div className={`stage-media stage-media--${fitMode}`}>
      <img src={imagePath} alt="结果展示" style={{ transform: `scale(${zoomLevel})` }} />
    </div>
  );
}

export function ResultStage({
  sourceType,
  sourceName,
  sourceLabelText,
  previewMode,
  setPreviewMode,
  galleryItems,
  showOverlay,
  overlayOpacity,
  fitMode,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onToggleOverlay,
  onToggleFitMode,
  onResetView,
  onOverlayOpacityChange,
  thumbnails,
  onFrameHover,
  onFrameClick,
  onStageDetailHover,
  stageDetailTarget,
}: ResultStageProps) {
  const [lightboxItem, setLightboxItem] = useState<ResultGalleryItem | null>(null);

  const activeItem = useMemo(
    () => galleryItems.find((item) => item.key === previewMode) ?? galleryItems[0] ?? null,
    [galleryItems, previewMode],
  );

  const sourceItem = galleryItems.find((item) => item.key === 'source') ?? null;
  const compareItem = activeItem?.key === 'source'
    ? galleryItems.find((item) => item.key === 'segmentation') ?? galleryItems.find((item) => item.key === 'heatmap') ?? null
    : activeItem;

  return (
    <section className="panel preview-panel">
      <div className="panel-header">
        <div>
          <h2>结果展示区</h2>
          <span>{sourceType ? `${sourceLabelText} · ${sourceName}` : '等待分析结果进入工作台'}</span>
        </div>
        <div className="segmented-tabs compact">
          {galleryItems
            .filter((item) => item.key !== 'source')
            .map((item) => (
              <button
                key={item.key}
                className={previewMode === item.key ? 'active' : ''}
                onClick={() => setPreviewMode(item.key)}
                type="button"
              >
                {item.label}
              </button>
            ))}
        </div>
      </div>

      <div className="stage-toolbar">
        <div className="toolbar-group">
          <button type="button" className="secondary-button toolbar-button" onClick={onZoomOut}>缩小</button>
          <button type="button" className="secondary-button toolbar-button" onClick={onZoomIn}>放大</button>
          <button type="button" className="secondary-button toolbar-button" onClick={onToggleFitMode}>
            {fitMode === 'contain' ? '铺满画面' : '适配画面'}
          </button>
          <button type="button" className="secondary-button toolbar-button" onClick={onResetView}>重置视图</button>
        </div>
        <div className="toolbar-group">
          <button
            type="button"
            className={`secondary-button toolbar-button ${showOverlay ? 'is-active' : ''}`}
            onClick={onToggleOverlay}
          >
            {showOverlay ? '叠加显示' : '单图显示'}
          </button>
          <label className="opacity-control">
            <span>透明度</span>
            <input
              type="range"
              min="0.2"
              max="1"
              step="0.05"
              value={overlayOpacity}
              onChange={(event) => onOverlayOpacityChange(Number(event.target.value))}
            />
          </label>
        </div>
      </div>

      <div
        className="result-stage-feature"
        onMouseEnter={() => onStageDetailHover(stageDetailTarget)}
        onMouseLeave={() => onStageDetailHover(null)}
      >
        <div className="result-stage-feature__meta">
          <div>
            <span className="eyebrow">主预览</span>
            <h3>{activeItem?.label ?? '等待结果'}</h3>
            <p>{activeItem?.description ?? '上传后会在这里显示热力图、分割图或掩码图。'}</p>
          </div>
          {activeItem?.imagePath ? (
            <button type="button" className="secondary-button toolbar-button" onClick={() => setLightboxItem(activeItem)}>
              点击放大预览
            </button>
          ) : null}
        </div>

        <div className="compare-stage-grid compare-stage-grid--gallery">
          <article className="stage-card">
            <div className="stage-card__header">
              <span className="eyebrow">源画面</span>
              <strong>{sourceType === 'video' || sourceType === 'stream' ? '当前抽帧' : '原始图像'}</strong>
            </div>
            <div className="media-stage hero">
              <StageMedia imagePath={sourceItem?.imagePath ?? ''} fitMode={fitMode} zoomLevel={zoomLevel} />
            </div>
          </article>

          <article className="stage-card emphasis">
            <div className="stage-card__header">
              <span className="eyebrow">模型结果</span>
              <strong>{compareItem?.label ?? '等待分析结果'}</strong>
            </div>
            <div className="media-stage hero overlay-enabled">
              {showOverlay && sourceItem?.imagePath && compareItem?.imagePath && compareItem.key !== 'mask' ? (
                <>
                  <div className={`stage-media stage-media--${fitMode}`}>
                    <img src={sourceItem.imagePath} alt="源图像底图" style={{ transform: `scale(${zoomLevel})` }} />
                  </div>
                  <div className={`stage-media stage-media--${fitMode} overlay-layer visible`}>
                    <img
                      src={compareItem.imagePath}
                      alt={compareItem.label}
                      style={{
                        transform: `scale(${zoomLevel})`,
                        opacity: overlayOpacity,
                      }}
                    />
                  </div>
                </>
              ) : (
                <StageMedia imagePath={compareItem?.imagePath ?? ''} fitMode={fitMode} zoomLevel={zoomLevel} />
              )}
            </div>
          </article>
        </div>
      </div>

      <div className="gallery-grid">
        {galleryItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`gallery-card ${previewMode === item.key ? 'active' : ''}`}
            onClick={() => setPreviewMode(item.key)}
            onDoubleClick={() => setLightboxItem(item)}
          >
            <div className="gallery-card__preview">
              {item.imagePath ? <img src={item.imagePath} alt={item.label} /> : <div className="empty-stage compact">等待结果</div>}
            </div>
            <div className="gallery-card__meta">
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="stage-footer">
        <div className="legend-row">
          <span>红色表示疑似杂草</span>
          <div className="heatmap-legend" />
          <span>蓝灰表示背景</span>
          <span>绿色表示烟株</span>
        </div>
        <div className="stage-footnote">
          <strong>单击切换主预览，双击放大</strong>
          <span>建议结合原图、热力图和分割图一起判断结果是否与真实田间状态一致。</span>
        </div>
      </div>

      <div className="thumbnail-strip">
        {thumbnails.length > 0 ? thumbnails.map((frame) => (
          <button
            key={frame.id}
            type="button"
            className={`thumbnail-card ${frame.active ? 'active' : ''}`}
            onMouseEnter={() => onFrameHover(frame.id)}
            onMouseLeave={() => onFrameHover(null)}
            onClick={() => onFrameClick(frame.id)}
          >
            <img src={frame.previewImagePath} alt={frame.title} />
            <strong>{frame.title}</strong>
            <span>{frame.timestampLabel}</span>
            <small>{frame.coverageLabel} · {frame.plantLabel}</small>
          </button>
        )) : (
          <div className="thumbnail-empty">
            <strong>当前任务暂无关键帧</strong>
            <span>图片任务会直接展示结果，视频和实时流任务完成抽帧后会在这里出现关键帧预览。</span>
          </div>
        )}
      </div>

      {lightboxItem?.imagePath ? (
        <div className="lightbox-backdrop" onClick={() => setLightboxItem(null)}>
          <div className="lightbox-panel" onClick={(event) => event.stopPropagation()}>
            <div className="lightbox-panel__header">
              <div>
                <span className="eyebrow">放大预览</span>
                <strong>{lightboxItem.label}</strong>
              </div>
              <button type="button" className="secondary-button toolbar-button" onClick={() => setLightboxItem(null)}>
                关闭
              </button>
            </div>
            <img src={lightboxItem.imagePath} alt={lightboxItem.label} className="lightbox-panel__image" />
          </div>
        </div>
      ) : null}
    </section>
  );
}
