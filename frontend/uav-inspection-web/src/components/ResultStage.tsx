import type { DetailTarget, FramePreviewState, PreviewMode, SourceType } from '../types';

interface ResultStageProps {
  sourceType: SourceType | null;
  sourceName: string;
  sourceLabelText: string;
  compareMode: Exclude<PreviewMode, 'source'>;
  setCompareMode: (mode: Exclude<PreviewMode, 'source'>) => void;
  sourceImagePath: string;
  compareImagePath: string;
  sourceVideoPath: string;
  shouldRenderSourceVideo: boolean;
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
  videoPath,
  isVideo,
  fitMode,
  zoomLevel,
}: {
  imagePath: string;
  videoPath?: string;
  isVideo?: boolean;
  fitMode: 'contain' | 'cover';
  zoomLevel: number;
}) {
  const className = `stage-media stage-media--${fitMode}`;
  const style = { transform: `scale(${zoomLevel})` };

  if (isVideo && videoPath) {
    return (
      <div className={className}>
        <video src={videoPath} controls muted playsInline style={style} />
      </div>
    );
  }

  if (!imagePath) {
    return (
      <div className="empty-stage">
        <strong>等待结果生成</strong>
        <span>上传图片、视频或启动流分析后，这里会展示当前源画面。</span>
      </div>
    );
  }

  return (
    <div className={className}>
      <img src={imagePath} alt="源图像展示" style={style} />
    </div>
  );
}

export function ResultStage({
  sourceType,
  sourceName,
  sourceLabelText,
  compareMode,
  setCompareMode,
  sourceImagePath,
  compareImagePath,
  sourceVideoPath,
  shouldRenderSourceVideo,
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
  return (
    <section className="panel preview-panel">
      <div className="panel-header">
        <div>
          <h2>图像对比舞台</h2>
          <span>{sourceType ? `${sourceLabelText} · ${sourceName}` : '等待分析结果进入工作台'}</span>
        </div>
        <div className="segmented-tabs compact">
          {(['heatmap', 'mask'] as const).map((mode) => (
            <button
              key={mode}
              className={compareMode === mode ? 'active' : ''}
              onClick={() => setCompareMode(mode)}
              type="button"
            >
              {mode === 'heatmap' ? '杂草热力图' : '杂草掩码图'}
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
            {showOverlay ? '隐藏叠加层' : '显示叠加层'}
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

      <div className="compare-stage-grid">
        <article
          className="stage-card"
          onMouseEnter={() => onStageDetailHover(stageDetailTarget)}
          onMouseLeave={() => onStageDetailHover(null)}
        >
          <div className="stage-card__header">
            <span className="eyebrow">源画面</span>
            <strong>{sourceType === 'video' || sourceType === 'stream' ? '当前抽帧' : '原始图像'}</strong>
          </div>
          <div className="media-stage hero">
            <StageMedia
              imagePath={sourceImagePath}
              videoPath={sourceVideoPath}
              isVideo={shouldRenderSourceVideo}
              fitMode={fitMode}
              zoomLevel={zoomLevel}
            />
          </div>
        </article>

        <article
          className="stage-card emphasis"
          onMouseEnter={() => onStageDetailHover(stageDetailTarget)}
          onMouseLeave={() => onStageDetailHover(null)}
        >
          <div className="stage-card__header">
            <span className="eyebrow">模型结果</span>
            <strong>{compareMode === 'heatmap' ? '杂草概率热力图' : '杂草分割掩码图'}</strong>
          </div>
          <div className="media-stage hero overlay-enabled">
            {sourceImagePath && (
              <div className={`stage-media stage-media--${fitMode}`}>
                <img src={sourceImagePath} alt="源图像底图" style={{ transform: `scale(${zoomLevel})` }} />
              </div>
            )}
            {compareImagePath ? (
              <div className={`stage-media stage-media--${fitMode} overlay-layer ${showOverlay ? 'visible' : 'standalone'}`}>
                <img
                  src={compareImagePath}
                  alt="模型结果图层"
                  style={{
                    transform: `scale(${zoomLevel})`,
                    opacity: showOverlay ? overlayOpacity : 1,
                  }}
                />
              </div>
            ) : (
              <div className="empty-stage">
                <strong>等待结果生成</strong>
                <span>模型完成推理后，这里会展示热力图或掩码图。</span>
              </div>
            )}
          </div>
        </article>
      </div>

      <div className="stage-footer">
        <div className="legend-row">
          <span>杂草概率热度</span>
          <div className="heatmap-legend" />
          <span>低</span>
          <span>高</span>
        </div>
        <div className="stage-footnote">
          <strong>悬停关键帧、指标卡、趋势点</strong>
          <span>右侧详情检查器会联动解释统计口径、当前结果和任务上下文。</span>
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
    </section>
  );
}
