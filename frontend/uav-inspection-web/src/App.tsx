import { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';

import {
  apiBaseUrl,
  fetchJobDetail,
  fetchJobList,
  openAnalysisRealtimeSocket,
  openDashboardRealtimeSocket,
  stopJob,
  toAbsoluteAssetUrl,
  uploadImage,
  uploadVideo,
  createStreamJob,
} from './api';
import type {
  AnalysisFrame,
  AnalysisJob,
  AnalysisJobDetail,
  AnalysisResult,
  DashboardRealtimePayload,
  JobStatus,
  PreviewMode,
  SourceType,
} from './types';

type InputTab = 'image' | 'video' | 'stream';

const INITIAL_STREAM_URL = 'demo://field-inspection';

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '--';
  }
  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function statusTone(status: JobStatus): string {
  switch (status) {
    case 'completed':
      return 'success';
    case 'running':
      return 'info';
    case 'failed':
      return 'danger';
    case 'stopped':
      return 'warning';
    default:
      return 'muted';
  }
}

function sourceLabel(sourceType: SourceType): string {
  switch (sourceType) {
    case 'image':
      return '图片';
    case 'video':
      return '视频';
    case 'stream':
      return '实时流';
    default:
      return sourceType;
  }
}

export default function App() {
  const [dashboard, setDashboard] = useState<DashboardRealtimePayload | null>(null);
  const [historyJobs, setHistoryJobs] = useState<AnalysisJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<AnalysisJobDetail | null>(null);
  const [activeTab, setActiveTab] = useState<InputTab>('image');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('heatmap');
  const [streamUrl, setStreamUrl] = useState(INITIAL_STREAM_URL);
  const [selectedHistoryType, setSelectedHistoryType] = useState<string>('');
  const [selectedHistoryStatus, setSelectedHistoryStatus] = useState<string>('');
  const [message, setMessage] = useState('系统已就绪，可直接开始杂草分割分析，支持图片、视频和实时流。');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBackendOnline, setIsBackendOnline] = useState(true);
  const analysisSocketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let mounted = true;
    const dashboardSocket = openDashboardRealtimeSocket((payload) => {
      if (!mounted) return;
      setDashboard(payload);
      setIsBackendOnline(true);
    });
    dashboardSocket.onclose = () => {
      if (mounted) {
        setIsBackendOnline(false);
      }
    };
    dashboardSocket.onerror = () => {
      if (mounted) {
        setIsBackendOnline(false);
      }
    };

    void refreshHistory();

    return () => {
      mounted = false;
      dashboardSocket.close();
    };
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [selectedHistoryType, selectedHistoryStatus]);

  useEffect(() => {
    if (!selectedJob) {
      analysisSocketRef.current?.close();
      analysisSocketRef.current = null;
      return;
    }

    analysisSocketRef.current?.close();
    if (selectedJob.job.status !== 'running' && selectedJob.job.status !== 'pending') {
      return;
    }

    const socket = openAnalysisRealtimeSocket(selectedJob.job.id, (payload) => {
      setSelectedJob((current) => {
        if (!current || current.job.id !== payload.job.id) {
          return current;
        }
        const mergedFrames = payload.frames.length > 0
          ? [...current.frames.filter((frame) => frame.id !== payload.frames[0].id), ...payload.frames].slice(-10)
          : current.frames;
        return {
          job: payload.job,
          latest_result: payload.latest_result,
          frames: mergedFrames,
        };
      });
      void refreshHistory();
    });
    analysisSocketRef.current = socket;

    return () => {
      socket.close();
      if (analysisSocketRef.current === socket) {
        analysisSocketRef.current = null;
      }
    };
  }, [selectedJob?.job.id, selectedJob?.job.status]);

  const currentResult: AnalysisResult | null = selectedJob?.latest_result ?? null;
  const currentFrame: AnalysisFrame | null = selectedJob?.frames.at(-1) ?? null;
  const shouldRenderVideo = previewMode === 'source' && selectedJob?.job.source_type === 'video' && !!selectedJob.job.source_media_path;
  const imageSourcePath = useMemo(() => {
    if (previewMode === 'source') {
      if (selectedJob?.job.source_type === 'image') {
        return toAbsoluteAssetUrl(selectedJob.job.source_media_path || currentResult?.source_image_path);
      }
      if (selectedJob?.job.source_type === 'video') {
        return toAbsoluteAssetUrl(currentFrame?.source_frame_path);
      }
      return toAbsoluteAssetUrl(currentFrame?.source_frame_path ?? currentResult?.source_image_path);
    }
    if (previewMode === 'mask') {
      return toAbsoluteAssetUrl(currentFrame?.mask_image_path ?? currentResult?.mask_image_path);
    }
    return toAbsoluteAssetUrl(currentFrame?.heatmap_image_path ?? currentResult?.heatmap_image_path);
  }, [currentFrame, currentResult, previewMode, selectedJob]);

  const trendOption = useMemo(() => {
    const recent = [...historyJobs].slice(0, 8).reverse();
    return {
      backgroundColor: 'transparent',
      textStyle: { color: '#d7e7f6' },
      tooltip: { trigger: 'axis' },
      grid: { left: 36, right: 20, top: 30, bottom: 28 },
      xAxis: {
        type: 'category',
        data: recent.map((job) => new Date(job.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })),
        axisLabel: { color: '#8fa3b8' },
        axisLine: { lineStyle: { color: '#1f3246' } },
      },
      yAxis: [
        {
          type: 'value',
          name: '覆盖率',
          axisLabel: {
            color: '#8fa3b8',
            formatter: (value: number) => `${value * 100}%`,
          },
          splitLine: { lineStyle: { color: 'rgba(30, 54, 78, 0.5)' } },
        },
        {
          type: 'value',
          name: '植株估算',
          axisLabel: { color: '#8fa3b8' },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '覆盖率',
          type: 'line',
          smooth: true,
          data: recent.map((job) => job.average_coverage_ratio),
          lineStyle: { color: '#21d07a', width: 3 },
          areaStyle: { color: 'rgba(33, 208, 122, 0.16)' },
          symbolSize: 8,
        },
        {
          name: '植株估算',
          type: 'bar',
          yAxisIndex: 1,
          data: recent.map((job) => job.estimated_plant_count),
          itemStyle: { color: '#35a7ff', borderRadius: [6, 6, 0, 0] },
          barMaxWidth: 18,
        },
      ],
    };
  }, [historyJobs]);

  async function refreshHistory() {
    try {
      const response = await fetchJobList({ sourceType: selectedHistoryType, status: selectedHistoryStatus });
      setHistoryJobs(response.items);
      if (!selectedJob && response.items.length > 0) {
        const detail = await fetchJobDetail(response.items[0].id);
        setSelectedJob(detail);
      }
    } catch (error) {
      setMessage('历史记录读取失败，请检查后端分析服务。');
      setIsBackendOnline(false);
    }
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsSubmitting(true);
      setMessage(`正在分析图片：${file.name}，将输出杂草热力分割图与面积统计。`);
    try {
      const response = await uploadImage(file);
      setSelectedJob({
        job: response.job,
        latest_result: response.result,
        frames: [],
      });
      setPreviewMode('heatmap');
      setMessage('图片分析完成，杂草热力分割图与面积统计已更新。');
      await refreshHistory();
    } catch {
      setMessage('图片分析失败，请检查文件格式或后端模型服务。');
      setIsBackendOnline(false);
    } finally {
      setIsSubmitting(false);
      event.target.value = '';
    }
  }

  async function handleVideoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsSubmitting(true);
      setMessage(`视频任务已创建：${file.name}，正在抽帧进行杂草分割分析。`);
    try {
      const response = await uploadVideo(file);
      setSelectedJob(response);
      setPreviewMode('heatmap');
      await refreshHistory();
    } catch {
      setMessage('视频分析任务创建失败，请稍后重试。');
      setIsBackendOnline(false);
    } finally {
      setIsSubmitting(false);
      event.target.value = '';
    }
  }

  async function handleCreateStream() {
    setIsSubmitting(true);
      setMessage(`正在启动流分析：${streamUrl}，将持续输出杂草热力结果。`);
    try {
      const response = await createStreamJob(streamUrl);
      setSelectedJob(response);
      setPreviewMode('heatmap');
      setMessage('实时流任务已启动，正在接收最新杂草热力分割结果。');
      await refreshHistory();
    } catch {
      setMessage('流分析任务启动失败，请确认流地址可访问。');
      setIsBackendOnline(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStopCurrentJob() {
    if (!selectedJob) return;
    await stopJob(selectedJob.job.id);
    setMessage(`已请求停止任务 #${selectedJob.job.id}。`);
  }

  async function openHistoryJob(jobId: number) {
    const detail = await fetchJobDetail(jobId);
    setSelectedJob(detail);
    setPreviewMode(detail.job.source_type === 'image' ? 'heatmap' : previewMode);
  }

  const metricCards = [
    {
      label: '杂草覆盖面积占比',
      value: currentFrame ? formatPercent(currentFrame.weed_coverage_ratio) : currentResult ? formatPercent(currentResult.weed_coverage_ratio) : '--',
      tone: 'success',
    },
    {
      label: '杂草像素面积',
      value: currentFrame ? `${currentFrame.weed_pixel_area}` : currentResult ? `${currentResult.weed_pixel_area}` : '--',
      tone: 'info',
    },
    {
      label: '估算杂草植株数',
      value: currentFrame ? `${currentFrame.estimated_plant_count}` : currentResult ? `${currentResult.estimated_plant_count}` : '--',
      tone: 'warning',
    },
    {
      label: '分析耗时',
      value: currentResult ? `${currentResult.processing_time_ms} ms` : '--',
      tone: 'neutral',
    },
    {
      label: selectedJob?.job.source_type === 'image' ? '样本数' : '处理帧数',
      value: selectedJob ? `${selectedJob.job.frame_count || (selectedJob.job.source_type === 'image' ? 1 : 0)}` : '--',
      tone: 'neutral',
    },
    {
      label: '结果时间',
      value: currentResult ? formatDateTime(currentResult.result_time) : '--',
      tone: 'neutral',
    },
  ];

  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-title-row">
            <span className={`status-dot ${isBackendOnline ? 'online' : 'offline'}`} />
            <div>
              <h1>大田无人机巡检监控系统</h1>
              <p>Web 分析大屏 · 图像展示 · 模型部署 · 热力分割结果</p>
            </div>
          </div>
          <div className="status-banner">{message}</div>
        </div>

        <div className="topbar-center">
          <div className="clock">{dashboard ? formatDateTime(dashboard.system.server_time) : '--'}</div>
          <div className="clock-subtitle">{dashboard?.system.status ?? '等待系统状态'}</div>
        </div>

        <div className="topbar-metrics">
          <div className="status-pill">
            <span>RTMP</span>
            <strong>{dashboard?.video.rtmp_status ?? '--'}</strong>
          </div>
          <div className="status-pill">
            <span>HLS</span>
            <strong>{dashboard?.video.hls_status ?? '--'}</strong>
          </div>
          <div className="status-pill">
            <span>FPS</span>
            <strong>{dashboard?.video.fps?.toFixed(1) ?? '--'}</strong>
          </div>
          <div className="status-pill">
            <span>延迟</span>
            <strong>{dashboard ? `${dashboard.video.latency_ms} ms` : '--'}</strong>
          </div>
        </div>
      </header>

      <main className="workspace-grid">
        <section className="panel input-panel">
          <div className="panel-header">
            <h2>输入与任务控制</h2>
            <span>图片 / 视频 / 实时流</span>
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

          <div className="input-card">
            {activeTab === 'image' && (
              <>
                <p>上传单张田间图像，返回杂草概率热力图、二值掩码和覆盖面积统计。</p>
                <label className="upload-button">
                  选择图片
                  <input accept="image/*" hidden type="file" onChange={handleImageUpload} />
                </label>
              </>
            )}

            {activeTab === 'video' && (
              <>
                <p>上传巡检视频，系统将按采样帧率抽帧做杂草分割分析并保存历史记录。</p>
                <label className="upload-button">
                  选择视频
                  <input accept="video/*" hidden type="file" onChange={handleVideoUpload} />
                </label>
              </>
            )}

            {activeTab === 'stream' && (
              <>
                <p>支持 RTSP / RTMP / HLS 地址，也支持默认的演示流地址。</p>
                <input
                  className="text-input"
                  value={streamUrl}
                  onChange={(event) => setStreamUrl(event.target.value)}
                  placeholder="请输入流地址，例如 rtsp:// 或 demo://field-inspection"
                />
                <button className="primary-button" type="button" onClick={handleCreateStream}>
                  启动流分析
                </button>
              </>
            )}
          </div>

          <div className="input-card">
            <div className="card-title-row">
              <h3>当前任务摘要</h3>
              {selectedJob && <span className={`tag ${statusTone(selectedJob.job.status)}`}>{selectedJob.job.status}</span>}
            </div>
            {selectedJob ? (
              <dl className="detail-list">
                <div><dt>任务编号</dt><dd>#{selectedJob.job.id}</dd></div>
                <div><dt>来源类型</dt><dd>{sourceLabel(selectedJob.job.source_type)}</dd></div>
                <div><dt>模型后端</dt><dd>{selectedJob.job.model_backend}</dd></div>
                <div><dt>处理进度</dt><dd>{(selectedJob.job.progress * 100).toFixed(0)}%</dd></div>
              </dl>
            ) : (
              <p className="muted">暂无分析任务，先上传图片或视频即可。</p>
            )}

            <div className="action-row">
              <button type="button" className="secondary-button" onClick={() => void refreshHistory()}>
                刷新历史
              </button>
              <button
                type="button"
                className="ghost-danger-button"
                onClick={handleStopCurrentJob}
                disabled={!selectedJob || (selectedJob.job.status !== 'running' && selectedJob.job.status !== 'pending')}
              >
                停止任务
              </button>
            </div>
          </div>
        </section>

        <section className="panel preview-panel">
          <div className="panel-header">
            <h2>杂草分割展示</h2>
            <span>{selectedJob ? `${sourceLabel(selectedJob.job.source_type)} · ${selectedJob.job.source_name}` : '等待分析结果'}</span>
          </div>

          <div className="segmented-tabs compact">
            {(['source', 'heatmap', 'mask'] as PreviewMode[]).map((mode) => (
              <button
                key={mode}
                className={previewMode === mode ? 'active' : ''}
                onClick={() => setPreviewMode(mode)}
                type="button"
              >
                {mode === 'source' ? '原图/原帧' : mode === 'heatmap' ? '杂草热力图' : '杂草掩码图'}
              </button>
            ))}
          </div>

          <div className="media-stage">
            {shouldRenderVideo ? (
              <video src={toAbsoluteAssetUrl(selectedJob?.job.source_media_path)} controls muted playsInline />
            ) : imageSourcePath ? (
              <img src={imageSourcePath} alt="分析结果展示" />
            ) : (
              <div className="empty-stage">
                <strong>等待结果生成</strong>
                <span>上传图片、视频或启动流分析后，这里会展示原始画面与杂草分割结果。</span>
              </div>
            )}
          </div>

          <div className="legend-row">
            <span>杂草概率热度</span>
            <div className="heatmap-legend" />
            <span>低</span>
            <span>高</span>
          </div>

          <div className="thumbnail-strip">
            {selectedJob?.frames.map((frame) => (
              <button key={frame.id} type="button" className="thumbnail-card" onClick={() => setPreviewMode('heatmap')}>
                <img src={toAbsoluteAssetUrl(frame.heatmap_image_path)} alt={`关键帧 ${frame.frame_index}`} />
                <span>{frame.frame_timestamp_seconds.toFixed(1)}s</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel insight-panel">
          <div className="panel-header">
            <h2>统计与模型状态</h2>
            <span>{dashboard?.latest_analysis ? '已接入最近一次分析摘要' : '等待分析摘要'}</span>
          </div>

          <div className="metric-grid">
            {metricCards.map((card) => (
              <article key={card.label} className={`metric-card ${card.tone}`}>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
              </article>
            ))}
          </div>

          <div className="info-card">
            <div className="card-title-row">
              <h3>模型部署状态</h3>
              <span className="tag success">{selectedJob?.job.model_backend ?? 'mock'}</span>
            </div>
            <dl className="detail-list">
              <div><dt>当前后端</dt><dd>{apiBaseUrl}</dd></div>
              <div><dt>模型状态</dt><dd>{isBackendOnline ? '可用' : '离线'}</dd></div>
              <div><dt>结果说明</dt><dd>{currentResult?.summary_note ?? '等待推理结果'}</dd></div>
              <div><dt>估算口径</dt><dd>连通域估算植株数</dd></div>
            </dl>
          </div>

          <div className="info-card">
            <div className="card-title-row">
              <h3>系统态势</h3>
              <span className="tag info">{dashboard?.system.health ?? '--'}</span>
            </div>
            <dl className="detail-list">
              <div><dt>总检测数</dt><dd>{dashboard?.detection.total_count ?? '--'}</dd></div>
              <div><dt>当前分钟</dt><dd>{dashboard?.detection.current_minute_count ?? '--'}</dd></div>
              <div><dt>风险指数</dt><dd>{dashboard?.detection.risk_index?.toFixed(1) ?? '--'}</dd></div>
              <div><dt>最近分析</dt><dd>{dashboard?.latest_analysis ? `任务 #${dashboard.latest_analysis.job_id}` : '暂无'}</dd></div>
            </dl>
          </div>
        </section>
      </main>

      <section className="panel history-panel">
        <div className="panel-header">
          <h2>历史结果与趋势分析</h2>
          <div className="history-filters">
            <select value={selectedHistoryType} onChange={(event) => setSelectedHistoryType(event.target.value)}>
              <option value="">全部来源</option>
              <option value="image">图片</option>
              <option value="video">视频</option>
              <option value="stream">实时流</option>
            </select>
            <select value={selectedHistoryStatus} onChange={(event) => setSelectedHistoryStatus(event.target.value)}>
              <option value="">全部状态</option>
              <option value="completed">已完成</option>
              <option value="running">运行中</option>
              <option value="failed">失败</option>
              <option value="stopped">已停止</option>
            </select>
          </div>
        </div>

        <div className="history-layout">
          <div className="history-list">
            {historyJobs.map((job) => (
              <button
                key={job.id}
                type="button"
                className={`history-item ${selectedJob?.job.id === job.id ? 'active' : ''}`}
                onClick={() => void openHistoryJob(job.id)}
              >
                <div className="history-item-head">
                  <strong>#{job.id} · {sourceLabel(job.source_type)}</strong>
                  <span className={`tag ${statusTone(job.status)}`}>{job.status}</span>
                </div>
                <span className="history-name">{job.source_name}</span>
                <div className="history-item-meta">
                  <span>覆盖率 {formatPercent(job.average_coverage_ratio || 0)}</span>
                  <span>植株估算 {job.estimated_plant_count}</span>
                  <span>{formatDateTime(job.created_at)}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="trend-panel">
            <ReactECharts option={trendOption} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>
      </section>

      {isSubmitting && (
        <div className="loading-mask">
          <div className="loading-card">
            <strong>分析任务处理中</strong>
            <span>正在上传数据并等待模型返回热力分割结果...</span>
          </div>
        </div>
      )}
    </div>
  );
}
