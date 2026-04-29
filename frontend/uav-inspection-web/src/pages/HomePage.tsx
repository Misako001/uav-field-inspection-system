import type { AppRoute, DashboardRealtimePayload, DetailTarget, HomeOverviewCard } from '../types';

interface HomePageProps {
  dashboard: DashboardRealtimePayload | null;
  latestDetailTarget: DetailTarget;
  overviewCards: HomeOverviewCard[];
  entryCards: HomeOverviewCard[];
  onEntryClick: (route: AppRoute) => void;
}

export function HomePage({
  dashboard,
  latestDetailTarget,
  overviewCards,
  entryCards,
  onEntryClick,
}: HomePageProps) {
  return (
    <div className="home-page">
      <section className="panel home-hero">
        <div className="home-hero__copy">
          <span className="eyebrow">系统总览</span>
          <h2>先看系统状态，再进入具体任务页</h2>
          <p>
            首页只保留最高价值的实时摘要、最近一次分析结果和功能入口。真正的图片分析、趋势回看、关键帧对照都放到对应功能页里，避免你为了找一个按钮把整页拖到底。
          </p>
        </div>
        <div className="home-hero__latest">
          <strong>{latestDetailTarget.title}</strong>
          <span>{latestDetailTarget.subtitle}</span>
          <p>{latestDetailTarget.description}</p>
        </div>
      </section>

      <section className="home-grid">
        <div className="panel home-overview-panel">
          <div className="panel-header">
            <div>
              <h2>系统总览</h2>
              <span>实时状态、风险指标与最近分析摘要</span>
            </div>
          </div>

          <div className="home-overview-grid">
            {overviewCards.map((card) => (
              <article key={card.id} className={`home-overview-card tone-${card.tone}`}>
                <span>{card.subtitle}</span>
                <strong>{card.value}</strong>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </article>
            ))}
          </div>

          <div className="home-status-strip">
            <div className="home-status-strip__item">
              <span>检测总数</span>
              <strong>{dashboard?.detection.total_count ?? '--'}</strong>
            </div>
            <div className="home-status-strip__item">
              <span>当前分钟</span>
              <strong>{dashboard?.detection.current_minute_count ?? '--'}</strong>
            </div>
            <div className="home-status-strip__item">
              <span>风险指数</span>
              <strong>{dashboard?.detection.risk_index?.toFixed(1) ?? '--'}</strong>
            </div>
          </div>
        </div>

        <div className="panel home-entry-panel">
          <div className="panel-header">
            <div>
              <h2>快捷入口</h2>
              <span>点击进入对应功能页，不再依赖滚动查找模块</span>
            </div>
          </div>

          <div className="home-entry-grid">
            {entryCards.map((card) => (
              <button
                key={card.id}
                type="button"
                className={`home-entry-card tone-${card.tone}`}
                onClick={() => card.route && onEntryClick(card.route)}
              >
                <span>{card.subtitle}</span>
                <strong>{card.title}</strong>
                <p>{card.description}</p>
                <em>{card.value}</em>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
