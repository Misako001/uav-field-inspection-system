import { useState } from 'react';

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

export function ResultStage({
  sourceType,
  sourceName,
  previewMode,
  setPreviewMode,
  galleryItems,
  thumbnails,
  onFrameHover,
  onFrameClick,
  onStageDetailHover,
  stageDetailTarget,
}: ResultStageProps) {
  const [lightboxItem, setLightboxItem] = useState<ResultGalleryItem | null>(null);

  return (
    <section className="panel preview-panel">
      <div className="panel-header">
        <div>
          <h2>结果展示区</h2>
          <span>{sourceType ? `${sourceType === 'image' ? '图片' : sourceType === 'video' ? '视频' : '实时流'} · ${sourceName}` : '等待分析结果进入工作台'}</span>
        </div>
      </div>

      <div className="gallery-grid">
        {galleryItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`gallery-card ${previewMode === item.key ? 'active' : ''}`}
            onClick={() => {
              setPreviewMode(item.key);
              setLightboxItem(item);
            }}
            onMouseEnter={() => onStageDetailHover(stageDetailTarget)}
            onMouseLeave={() => onStageDetailHover(null)}
          >
            <div className="gallery-card__preview">
              {item.imagePath ? <img src={item.previewImagePath || item.imagePath} alt={item.label} /> : <div className="empty-stage compact">等待结果</div>}
            </div>
            <div className="gallery-card__meta">
              <strong>{item.label}</strong>
              <span>{item.description}</span>
              {item.legendItems?.length ? (
                <div className="gallery-card__legend">
                  {item.legendTitle ? <em>{item.legendTitle}</em> : null}
                  <div className="gallery-card__legend-items">
                    {item.legendItems.map((legendItem) => (
                      <span key={`${item.key}-${legendItem.label}`} className="gallery-card__legend-item">
                        <i
                          className={`legend-swatch ${legendItem.gradient ? 'gradient' : ''}`}
                          style={legendItem.gradient ? { background: legendItem.gradient } : { backgroundColor: legendItem.color ?? '#8fa3b8' }}
                        />
                        <b>{legendItem.label}</b>
                      </span>
                    ))}
                  </div>
                  {item.legendNote ? <small>{item.legendNote}</small> : null}
                </div>
              ) : null}
            </div>
          </button>
        ))}
      </div>

      <div className="stage-footer">
        <div className="stage-footnote">
          <strong>点击卡片即可查看大图</strong>
          <span>每张结果卡片都带有图例和口径说明，便于区分背景、烟株、杂草以及概率高低。</span>
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
                {lightboxItem.legendNote ? <small className="lightbox-panel__note">{lightboxItem.legendNote}</small> : null}
              </div>
              <button type="button" className="secondary-button toolbar-button" onClick={() => setLightboxItem(null)}>
                关闭
              </button>
            </div>
            <img src={lightboxItem.imagePath} alt={lightboxItem.label} className="lightbox-panel__image" />
            {lightboxItem.legendItems?.length ? (
              <div className="lightbox-panel__legend">
                {lightboxItem.legendItems.map((legendItem) => (
                  <span key={`lightbox-${lightboxItem.key}-${legendItem.label}`} className="gallery-card__legend-item">
                    <i
                      className={`legend-swatch ${legendItem.gradient ? 'gradient' : ''}`}
                      style={legendItem.gradient ? { background: legendItem.gradient } : { backgroundColor: legendItem.color ?? '#8fa3b8' }}
                    />
                    <b>{legendItem.label}</b>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
