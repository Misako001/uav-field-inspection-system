import type { AnalysisJob } from '../types';
import { formatDateTime, formatPercent, sourceLabel, statusLabel, statusTone } from '../utils';

interface HistoryTimelineProps {
  historyJobs: AnalysisJob[];
  selectedJobId: number | null;
  selectedHistoryType: string;
  selectedHistoryStatus: string;
  onSelectHistoryType: (value: string) => void;
  onSelectHistoryStatus: (value: string) => void;
  onOpenJob: (jobId: number) => void;
  onJobHover: (jobId: number | null) => void;
  onJobLock: (jobId: number) => void;
}

export function HistoryTimeline({
  historyJobs,
  selectedJobId,
  selectedHistoryType,
  selectedHistoryStatus,
  onSelectHistoryType,
  onSelectHistoryStatus,
  onOpenJob,
  onJobHover,
  onJobLock,
}: HistoryTimelineProps) {
  return (
    <section className="panel history-panel">
      <div className="panel-header">
        <div>
          <h2>历史结果时间轴</h2>
          <span>点击回看任务，悬停可在右侧详情检查器中快速展开</span>
        </div>
        <div className="history-filters">
          <select value={selectedHistoryType} onChange={(event) => onSelectHistoryType(event.target.value)}>
            <option value="">全部来源</option>
            <option value="image">图片</option>
            <option value="video">视频</option>
            <option value="stream">实时流</option>
          </select>
          <select value={selectedHistoryStatus} onChange={(event) => onSelectHistoryStatus(event.target.value)}>
            <option value="">全部状态</option>
            <option value="completed">已完成</option>
            <option value="running">运行中</option>
            <option value="failed">失败</option>
            <option value="stopped">已停止</option>
          </select>
        </div>
      </div>

      <div className="history-card-grid">
        {historyJobs.length > 0 ? historyJobs.map((job) => (
          <button
            key={job.id}
            type="button"
            className={`history-item ${selectedJobId === job.id ? 'active' : ''}`}
            onMouseEnter={() => onJobHover(job.id)}
            onMouseLeave={() => onJobHover(null)}
            onClick={() => {
              onOpenJob(job.id);
              onJobLock(job.id);
            }}
          >
            <div className="history-item-head">
              <strong>#{job.id} · {sourceLabel(job.source_type)}</strong>
              <span className={`tag ${statusTone(job.status)}`}>{statusLabel(job.status)}</span>
            </div>
            <span className="history-name">{job.source_name}</span>
            <div className="history-stat-grid">
              <span>覆盖率 {formatPercent(job.average_coverage_ratio || 0)}</span>
              <span>植株估算 {job.estimated_plant_count}</span>
              <span>平均置信度 {(job.average_confidence * 100).toFixed(1)}%</span>
            </div>
            <div className="history-item-meta">
              <span>{formatDateTime(job.created_at)}</span>
              <span>{job.model_backend}</span>
            </div>
          </button>
        )) : (
          <div className="history-empty">
            <strong>暂无历史结果</strong>
            <span>先上传图片、视频或创建流任务，系统会在这里沉淀历史记录与趋势。</span>
          </div>
        )}
      </div>
    </section>
  );
}
