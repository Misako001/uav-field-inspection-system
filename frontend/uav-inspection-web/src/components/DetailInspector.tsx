import type { DetailTarget } from '../types';

interface DetailInspectorProps {
  detailTarget: DetailTarget;
  isLocked: boolean;
  onUnlock: () => void;
}

export function DetailInspector({ detailTarget, isLocked, onUnlock }: DetailInspectorProps) {
  return (
    <section className="panel detail-panel">
      <div className="panel-header">
        <div>
          <h2>详情检查器</h2>
          <span>悬停预览，点击锁定，让统计口径和图像结果始终有解释</span>
        </div>
        <div className="detail-panel__actions">
          {detailTarget.badge && <span className={`tag ${detailTarget.tone}`}>{detailTarget.badge}</span>}
          {isLocked && (
            <button type="button" className="secondary-button toolbar-button" onClick={onUnlock}>
              解除锁定
            </button>
          )}
        </div>
      </div>

      <div className={`detail-hero tone-${detailTarget.tone}`}>
        <div>
          <p className="detail-hero__eyebrow">{detailTarget.subtitle}</p>
          <h3>{detailTarget.title}</h3>
          <p>{detailTarget.description}</p>
        </div>
        {detailTarget.imagePath ? (
          <div className="detail-hero__image">
            <img src={detailTarget.imagePath} alt={detailTarget.title} />
          </div>
        ) : (
          <div className="detail-hero__placeholder">
            <strong>{detailTarget.type === 'metric' ? '指标解释' : '结果概览'}</strong>
            <span>{isLocked ? '当前内容已锁定，可持续对照查看。' : '将鼠标移到关键卡片、关键帧或趋势点即可联动。'}</span>
          </div>
        )}
      </div>

      <div className="detail-field-grid">
        {detailTarget.fields.map((field) => (
          <article key={field.label} className={`detail-field tone-${field.tone ?? detailTarget.tone}`}>
            <span>{field.label}</span>
            <strong>{field.value}</strong>
          </article>
        ))}
      </div>

      <div className="info-card detail-note">
        <div className="card-title-row">
          <h3>结果说明</h3>
        </div>
        <p>{detailTarget.note ?? '当前面板用于解释你正在查看的图像、指标或历史结果。'}</p>
      </div>
    </section>
  );
}
