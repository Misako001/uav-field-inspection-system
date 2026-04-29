import { MiniSparkline } from './MiniSparkline';
import type { DetailTarget, MetricCardData } from '../types';

interface MetricsPanelProps {
  metricCards: MetricCardData[];
  compositionItems: Array<{ label: string; value: string; meter: number; tone: string }>;
  modelSummary: Array<{ label: string; value: string }>;
  systemSummary: Array<{ label: string; value: string }>;
  onMetricHover: (key: string | null) => void;
  onMetricClick: (key: string) => void;
  onCompositionHover: (target: DetailTarget | null) => void;
  compositionDetail: DetailTarget;
}

const toneColors: Record<string, string> = {
  success: '#21d07a',
  info: '#35a7ff',
  warning: '#f5c24e',
  danger: '#ff5b6b',
  muted: '#89a2bb',
  neutral: '#9db2c8',
};

export function MetricsPanel({
  metricCards,
  compositionItems,
  modelSummary,
  systemSummary,
  onMetricHover,
  onMetricClick,
  onCompositionHover,
  compositionDetail,
}: MetricsPanelProps) {
  return (
    <section className="panel metrics-panel">
      <div className="panel-header">
        <div>
          <h2>关键统计</h2>
          <span>用更清晰的方式解释当前结果，而不只是堆数字</span>
        </div>
      </div>

      <div className="metric-grid">
        {metricCards.map((card) => (
          <article
            key={card.key}
            className={`metric-card ${card.tone}`}
            onMouseEnter={() => onMetricHover(card.key)}
            onMouseLeave={() => onMetricHover(null)}
            onClick={() => onMetricClick(card.key)}
          >
            <div className="metric-card__top">
              <span>{card.label}</span>
              <em>{card.hint}</em>
            </div>
            <strong>{card.value}</strong>
            <MiniSparkline values={card.trend} tone={toneColors[card.tone] ?? toneColors.neutral} />
            <div className="metric-card__bottom">
              <small>{card.footnote}</small>
              <div className="meter-track">
                <div className="meter-fill" style={{ width: `${Math.round(card.meter * 100)}%`, backgroundColor: toneColors[card.tone] ?? toneColors.neutral }} />
              </div>
            </div>
          </article>
        ))}
      </div>

      <div
        className="info-card composition-card"
        onMouseEnter={() => onCompositionHover(compositionDetail)}
        onMouseLeave={() => onCompositionHover(null)}
      >
        <div className="card-title-row">
          <h3>当前结果构成</h3>
          <span className="tag info">Hover 联动</span>
        </div>
        <div className="composition-list">
          {compositionItems.map((item) => (
            <div key={item.label} className="composition-row">
              <div className="composition-row__labels">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
              <div className="meter-track">
                <div className={`meter-fill tone-${item.tone}`} style={{ width: `${Math.round(item.meter * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="summary-grid">
        <div className="info-card">
          <div className="card-title-row">
            <h3>模型部署状态</h3>
          </div>
          <dl className="detail-list">
            {modelSummary.map((item) => (
              <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>
            ))}
          </dl>
        </div>

        <div className="info-card">
          <div className="card-title-row">
            <h3>系统态势</h3>
          </div>
          <dl className="detail-list">
            {systemSummary.map((item) => (
              <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
