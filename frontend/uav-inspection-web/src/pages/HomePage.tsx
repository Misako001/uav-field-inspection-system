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
  const heroFacts = [
    { label: '系统状态', value: dashboard?.system.status ?? '等待系统状态' },
    { label: '最近任务', value: latestDetailTarget.badge ?? '最近分析' },
    { label: '视频链路', value: dashboard ? `${dashboard.video.rtmp_status} / ${dashboard.video.hls_status}` : '-- / --' },
  ];

  return (
    <div className="home-page">
      <section className="panel home-entry-panel home-entry-panel--lead">
        <div className="panel-header">
          <div>
            <h2>快捷入口</h2>
            <span>先进入要用的功能页，再按任务需要查看总览和最近分析</span>
          </div>
        </div>

        <div className="home-entry-grid home-entry-grid--lead">
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
              <div className="home-entry-card__footer">
                <em>{card.value}</em>
                <b>进入页面</b>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="panel home-hero">
        <div className="home-hero__copy">
          <span className="eyebrow">系统总览</span>
          <h2>先看系统状态，再进入具体任务页</h2>
          <p>
            首页只保留最高价值的实时摘要、最近一次分析结果和功能入口。真正的图片分析、趋势回看、关键帧对照都放到对应功能页里，避免你为了找一个按钮把整页拖到底。
          </p>
          <div className="home-hero__meta">
            {heroFacts.map((fact) => (
              <div key={fact.label} className="home-hero__fact">
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="home-hero__latest">
          <div className="home-hero__latest-head">
            <span className={`tag ${latestDetailTarget.tone}`}>{latestDetailTarget.badge ?? '最近分析'}</span>
            <small>{latestDetailTarget.subtitle}</small>
          </div>
          <strong>{latestDetailTarget.title}</strong>
          <p>{latestDetailTarget.description}</p>
          <div className="home-hero__latest-grid">
            {latestDetailTarget.fields.slice(0, 4).map((field) => (
              <div key={field.label} className="home-hero__latest-item">
                <span>{field.label}</span>
                <strong>{field.value}</strong>
              </div>
            ))}
          </div>
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
      </section>
    </div>
  );
}
