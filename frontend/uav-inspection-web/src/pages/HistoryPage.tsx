import { Link } from 'react-router-dom';

import { DetailInspector } from '../components/DetailInspector';
import { HistoryTimeline } from '../components/HistoryTimeline';
import { TrendPanel } from '../components/TrendPanel';
import type { AnalysisJob, DetailTarget } from '../types';

interface HistoryPageProps {
  historyJobs: AnalysisJob[];
  selectedJobId: number | null;
  selectedHistoryType: string;
  selectedHistoryStatus: string;
  onSelectHistoryType: (value: string) => void;
  onSelectHistoryStatus: (value: string) => void;
  onOpenJob: (jobId: number) => void;
  onJobHover: (jobId: number | null) => void;
  onJobLock: (jobId: number) => void;
  historyDetailTarget: DetailTarget;
  isDetailLocked: boolean;
  onUnlockDetail: () => void;
  trendOption: object;
  onPointHover: (dataIndex: number | null) => void;
  onPointClick: (dataIndex: number | null) => void;
  analysisLinkJobId: number | null;
}

export function HistoryPage({
  historyJobs,
  selectedJobId,
  selectedHistoryType,
  selectedHistoryStatus,
  onSelectHistoryType,
  onSelectHistoryStatus,
  onOpenJob,
  onJobHover,
  onJobLock,
  historyDetailTarget,
  isDetailLocked,
  onUnlockDetail,
  trendOption,
  onPointHover,
  onPointClick,
  analysisLinkJobId,
}: HistoryPageProps) {
  const analysisLink = analysisLinkJobId ? `/analysis?jobId=${analysisLinkJobId}` : '/analysis';

  return (
    <div className="page-body">
      <div className="history-page-grid">
        <div className="history-left-column">
          <HistoryTimeline
            historyJobs={historyJobs}
            selectedJobId={selectedJobId}
            selectedHistoryType={selectedHistoryType}
            selectedHistoryStatus={selectedHistoryStatus}
            onSelectHistoryType={onSelectHistoryType}
            onSelectHistoryStatus={onSelectHistoryStatus}
            onOpenJob={onOpenJob}
            onJobHover={onJobHover}
            onJobLock={onJobLock}
          />
          <TrendPanel
            option={trendOption}
            onPointHover={onPointHover}
            onPointClick={onPointClick}
          />
        </div>

        <div className="history-right-column">
          <DetailInspector
            detailTarget={historyDetailTarget}
            isLocked={isDetailLocked}
            onUnlock={onUnlockDetail}
          />

          <section className="panel history-actions-panel">
            <div className="panel-header">
              <div>
                <h2>历史回看操作</h2>
                <span>从历史页快速返回分析工作台，继续查看图像与关键帧</span>
              </div>
            </div>

            <div className="history-actions-panel__body">
              <Link to={analysisLink} className="primary-button history-link-button">
                在分析工作台打开当前任务
              </Link>
              <button
                type="button"
                className="secondary-button history-link-button"
                onClick={() => {
                  if (selectedJobId) {
                    onOpenJob(selectedJobId);
                  }
                }}
              >
                刷新当前历史摘要
              </button>
              <p>
                当前页只负责回看、对比和筛选历史结果；真正的图像对照、上传与实时流分析都留在分析工作台里。
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
