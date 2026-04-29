import ReactECharts from 'echarts-for-react';

interface TrendPanelProps {
  option: object;
  onPointHover: (dataIndex: number | null) => void;
  onPointClick: (dataIndex: number | null) => void;
}

export function TrendPanel({ option, onPointHover, onPointClick }: TrendPanelProps) {
  return (
    <section className="panel trend-panel-card">
      <div className="panel-header">
        <div>
          <h2>趋势分析</h2>
          <span>覆盖率与植株估算随任务变化的走势，支持 hover 联动详情</span>
        </div>
      </div>

      <div className="trend-panel">
        <ReactECharts
          option={option}
          style={{ height: '100%', width: '100%' }}
          onEvents={{
            mouseover: (params: { dataIndex?: number }) => onPointHover(params.dataIndex ?? null),
            mouseout: () => onPointHover(null),
            click: (params: { dataIndex?: number }) => onPointClick(params.dataIndex ?? null),
          }}
        />
      </div>
    </section>
  );
}
