import ReactECharts from 'echarts-for-react';

import type { DetailTarget, MetricCardData, Tone } from '../types';

interface ChartDatum {
  name: string;
  value: number;
  tone: Tone;
}

interface MetricsPanelProps {
  metricCards: MetricCardData[];
  ratioChartData: ChartDatum[];
  barChartData: ChartDatum[];
  modelSummary: Array<{ label: string; value: string }>;
  systemSummary: Array<{ label: string; value: string }>;
  onMetricHover: (key: string | null) => void;
  onMetricClick: (key: string) => void;
  onCompositionHover: (target: DetailTarget | null) => void;
  compositionDetail: DetailTarget;
}

const toneColors: Record<Tone, string> = {
  success: '#5ce276',
  info: '#53a6ff',
  warning: '#ecba88',
  danger: '#ff5b6b',
  muted: '#89a2bb',
  neutral: '#9db2c8',
};

function buildRatioOption(data: ChartDatum[]) {
  return {
    backgroundColor: 'transparent',
    animation: false,
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(9, 18, 28, 0.96)',
      borderColor: '#274561',
      textStyle: { color: '#ecf5ff' },
      formatter: '{b}<br/>{c}% ({d}%)',
    },
    series: [
      {
        type: 'pie',
        radius: ['54%', '76%'],
        center: ['50%', '52%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderColor: '#0d1620',
          borderWidth: 4,
        },
        label: {
          color: '#d7e7f6',
          formatter: '{b}\n{c}%',
          fontSize: 12,
        },
        labelLine: {
          lineStyle: { color: '#3a516b' },
        },
        data: data.map((item) => ({
          name: item.name,
          value: Number(item.value.toFixed(2)),
          itemStyle: { color: toneColors[item.tone] },
        })),
      },
    ],
  };
}

function buildBarOption(data: ChartDatum[]) {
  return {
    backgroundColor: 'transparent',
    animation: false,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(9, 18, 28, 0.96)',
      borderColor: '#274561',
      textStyle: { color: '#ecf5ff' },
    },
    grid: { left: 56, right: 24, top: 20, bottom: 40 },
    xAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(84, 111, 139, 0.18)' } },
      axisLabel: { color: '#8fa3b8' },
    },
    yAxis: {
      type: 'category',
      data: data.map((item) => item.name),
      axisLabel: { color: '#d7e7f6' },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [
      {
        type: 'bar',
        barWidth: 14,
        data: data.map((item) => ({
          value: Number(item.value.toFixed(2)),
          itemStyle: {
            color: toneColors[item.tone],
            borderRadius: [0, 8, 8, 0],
          },
        })),
        label: {
          show: true,
          position: 'right',
          color: '#d7e7f6',
          formatter: ({ value }: { value: number }) => `${value}`,
        },
      },
    ],
  };
}

export function MetricsPanel({
  metricCards,
  ratioChartData,
  barChartData,
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
          <h2>结果统计与图表</h2>
          <span>图像分割结果、面积构成和识别置信度会在这里同步解释。</span>
        </div>
      </div>

      <div className="metric-grid metric-grid--compact">
        {metricCards.map((card) => (
          <article
            key={card.key}
            className={`metric-card metric-card--summary ${card.tone}`}
            onMouseEnter={() => onMetricHover(card.key)}
            onMouseLeave={() => onMetricHover(null)}
            onClick={() => onMetricClick(card.key)}
          >
            <div className="metric-card__top">
              <span>{card.label}</span>
              <em>{card.hint}</em>
            </div>
            <strong>{card.value}</strong>
            <small>{card.footnote}</small>
            <div className="meter-track">
              <div
                className="meter-fill"
                style={{
                  width: `${Math.round(card.meter * 100)}%`,
                  backgroundColor: toneColors[card.tone],
                }}
              />
            </div>
          </article>
        ))}
      </div>

      <div
        className="chart-grid"
        onMouseEnter={() => onCompositionHover(compositionDetail)}
        onMouseLeave={() => onCompositionHover(null)}
      >
        <article className="info-card chart-card">
          <div className="card-title-row">
            <h3>区域面积构成</h3>
            <span className="tag info">环图</span>
          </div>
          <ReactECharts option={buildRatioOption(ratioChartData)} style={{ height: 260 }} />
        </article>

        <article className="info-card chart-card">
          <div className="card-title-row">
            <h3>关键数值对比</h3>
            <span className="tag warning">柱图</span>
          </div>
          <ReactECharts option={buildBarOption(barChartData)} style={{ height: 260 }} />
        </article>
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
