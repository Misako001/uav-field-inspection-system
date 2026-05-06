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
  onDeleteJob: (jobId: number) => void;
  deletingJobId: number | null;
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
  onDeleteJob,
  deletingJobId,
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
          <article
            key={job.id}
            className={`history-item ${selectedJobId === job.id ? 'active' : ''}`}
            onMouseEnter={() => onJobHover(job.id)}
            onMouseLeave={() => onJobHover(null)}
          >
            <div className="history-item-head">
              <strong>#{job.id} · {sourceLabel(job.source_type)}</strong>
              <div className="history-item-head__actions">
                <span className={`tag ${statusTone(job.status)}`}>{statusLabel(job.status)}</span>
                <button
                  type="button"
                  className="ghost-danger-button history-delete-button"
                  disabled={deletingJobId === job.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteJob(job.id);
                  }}
                >
                  {deletingJobId === job.id ? '删除中...' : '删除'}
                </button>
              </div>
            </div>
            <button
              type="button"
              className="history-item__open"
              onClick={() => {
                onOpenJob(job.id);
                onJobLock(job.id);
              }}
            >
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
          </article>
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
