import type React from 'react';

import type { AnalysisJobDetail } from '../types';
import { sourceLabel, statusLabel, statusTone } from '../utils';

type InputTab = 'image' | 'video' | 'stream';

interface AnalysisInputPanelProps {
  activeTab: InputTab;
  setActiveTab: (tab: InputTab) => void;
  selectedJob: AnalysisJobDetail | null;
  imageFileName: string;
  videoFileName: string;
  streamUrl: string;
  setStreamUrl: (value: string) => void;
  onImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onVideoUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDroppedFile: (file: File, tab: 'image' | 'video') => Promise<void>;
  onCreateStream: () => void;
  onRefreshHistory: () => void;
  onStopCurrentJob: () => void;
}

export function AnalysisInputPanel({
  activeTab,
  setActiveTab,
  selectedJob,
  imageFileName,
  videoFileName,
  streamUrl,
  setStreamUrl,
  onImageUpload,
  onVideoUpload,
  onDroppedFile,
  onCreateStream,
  onRefreshHistory,
  onStopCurrentJob,
}: AnalysisInputPanelProps) {
  return (
    <section className="panel input-panel">
      <div className="panel-header">
        <div>
          <h2>输入与任务控制</h2>
          <span>图片、视频、实时流统一进入分析链路</span>
        </div>
      </div>

      <div className="segmented-tabs">
        {(['image', 'video', 'stream'] as InputTab[]).map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? 'active' : ''}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {tab === 'image' ? '图片分析' : tab === 'video' ? '视频分析' : '实时流分析'}
          </button>
        ))}
      </div>

      <div className="input-card visual-card">
        {activeTab === 'image' && (
          <>
            <div className="input-card__copy">
              <strong>上传单张田间图像</strong>
              <p>系统会输出烟株概率热力图、分割掩码和面积占比统计，并写入历史记录。</p>
            </div>
            <div
              className="dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files?.[0];
                if (file) {
                  void onDroppedFile(file, 'image');
                }
              }}
            >
              <strong>拖拽图片到这里</strong>
              <span>支持 JPG / PNG / JPEG，大图会自动缩放到安全分析尺寸，建议使用无人机正射或俯视巡检画面</span>
            </div>
            <input className="file-input" accept="image/*" type="file" onChange={onImageUpload} />
            <div className="file-hint">
              <span>当前图片</span>
              <strong>{imageFileName || '尚未选择文件'}</strong>
            </div>
          </>
        )}

        {activeTab === 'video' && (
          <>
            <div className="input-card__copy">
              <strong>上传巡检视频</strong>
              <p>系统按采样帧率抽帧分析，生成关键帧热力图、历史结果和趋势统计。</p>
            </div>
            <div
              className="dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files?.[0];
                if (file) {
                  void onDroppedFile(file, 'video');
                }
              }}
            >
              <strong>拖拽视频到这里</strong>
              <span>支持 MP4 / AVI / MOV 等常见格式，适合长时巡检回放分析</span>
            </div>
            <input className="file-input" accept="video/*" type="file" onChange={onVideoUpload} />
            <div className="file-hint">
              <span>当前视频</span>
              <strong>{videoFileName || '尚未选择文件'}</strong>
            </div>
          </>
        )}

        {activeTab === 'stream' && (
          <>
            <div className="input-card__copy">
              <strong>接入实时流</strong>
              <p>支持 RTSP / RTMP / HLS，也支持演示流地址，适合在线采样与持续热力结果输出。</p>
            </div>
            <input
              className="text-input"
              value={streamUrl}
              onChange={(event) => setStreamUrl(event.target.value)}
              placeholder="请输入流地址，例如 rtsp:// 或 demo://field-inspection"
            />
            <button className="primary-button" type="button" onClick={onCreateStream}>
              启动流分析
            </button>
          </>
        )}
      </div>

      <div className="input-card">
        <div className="card-title-row">
          <h3>当前任务摘要</h3>
          {selectedJob && <span className={`tag ${statusTone(selectedJob.job.status)}`}>{statusLabel(selectedJob.job.status)}</span>}
        </div>
        {selectedJob ? (
          <dl className="detail-list">
            <div><dt>任务编号</dt><dd>#{selectedJob.job.id}</dd></div>
            <div><dt>来源类型</dt><dd>{sourceLabel(selectedJob.job.source_type)}</dd></div>
            <div><dt>模型后端</dt><dd>{selectedJob.job.model_backend}</dd></div>
            <div><dt>处理进度</dt><dd>{(selectedJob.job.progress * 100).toFixed(0)}%</dd></div>
          </dl>
        ) : (
          <p className="muted">暂无分析任务，先上传图片、视频或接入实时流即可。</p>
        )}

        <div className="action-row">
          <button type="button" className="secondary-button" onClick={onRefreshHistory}>
            刷新历史
          </button>
          <button
            type="button"
            className="ghost-danger-button"
            onClick={onStopCurrentJob}
            disabled={!selectedJob || (selectedJob.job.status !== 'running' && selectedJob.job.status !== 'pending')}
          >
            停止任务
          </button>
        </div>
      </div>
    </section>
  );
}
