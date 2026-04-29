import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import {
  apiBaseUrl,
  createStreamJob,
  fetchJobDetail,
  fetchJobList,
  openAnalysisRealtimeSocket,
  openDashboardRealtimeSocket,
  stopJob,
  toAbsoluteAssetUrl,
  uploadImage,
  uploadVideo,
} from './api';
import { AppShell } from './components/AppShell';
import { HistoryPage } from './pages/HistoryPage';
import { HomePage } from './pages/HomePage';
import { AnalysisPage } from './pages/AnalysisPage';
import type {
  AnalysisFrame,
  AnalysisJob,
  AnalysisJobDetail,
  AppRoute,
  DashboardRealtimePayload,
  DetailTarget,
  FramePreviewState,
  HistorySelectionState,
  HomeOverviewCard,
  MetricCardData,
  MetricDefinition,
  PreviewMode,
} from './types';
import { clamp, formatDateTime, formatNumber, formatPercent, sourceLabel, statusLabel, statusTone } from './utils';

type InputTab = 'image' | 'video' | 'stream';

const INITIAL_STREAM_URL = 'demo://field-inspection';

const metricDefinitions: MetricDefinition[] = [
  {
    key: 'coverage',
    label: '杂草覆盖面积占比',
    shortLabel: '覆盖率',
    description: '当前结果中被识别为杂草区域的像素面积占比，用于快速判断地块受杂草影响的范围。',
    formula: '杂草掩码像素数 / 有效图像像素数',
    tone: 'success',
  },
  {
    key: 'plants',
    label: '估算杂草植株数',
    shortLabel: '植株估算',
    description: '基于杂草二值掩码连通域的估算值，适合做批量趋势研判和任务对比。',
    formula: '杂草二值掩码连通域计数',
    tone: 'warning',
  },
  {
    key: 'confidence',
    label: '平均置信度',
    shortLabel: '置信度',
    description: '模型对当前杂草识别结果的平均概率信心，用来辅助判断结果是否稳定。',
    formula: '杂草区域平均概率',
    tone: 'info',
  },
  {
    key: 'samples',
    label: '处理样本数',
    shortLabel: '样本数',
    description: '图片任务显示样本数，视频和实时流任务显示已处理帧数。',
    formula: '图片=1；视频/流=累计关键帧数',
    tone: 'neutral',
  },
  {
    key: 'processing',
    label: '单次分析耗时',
    shortLabel: '分析耗时',
    description: '当前选中结果的模型推理与后处理耗时，用于判断分析链路的实时性。',
    formula: '图像预处理 + 模型推理 + 结果落盘',
    tone: 'info',
  },
  {
    key: 'resultTime',
    label: '结果时间',
    shortLabel: '结果时间',
    description: '当前结果生成的时间戳，适合配合趋势和历史任务做时序分析。',
    formula: '结果生成时间',
    tone: 'muted',
  },
];

function toneMeter(value: number): number {
  return clamp(value, 0, 1);
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const analysisSocketRef = useRef<WebSocket | null>(null);

  const [dashboard, setDashboard] = useState<DashboardRealtimePayload | null>(null);
  const [historyJobs, setHistoryJobs] = useState<AnalysisJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<AnalysisJobDetail | null>(null);
  const [activeTab, setActiveTab] = useState<InputTab>('image');
  const [compareMode, setCompareMode] = useState<Exclude<PreviewMode, 'source'>>('heatmap');
  const [streamUrl, setStreamUrl] = useState(INITIAL_STREAM_URL);
  const [historySelection, setHistorySelection] = useState<HistorySelectionState>({
    selectedHistoryType: '',
    selectedHistoryStatus: '',
  });
  const [message, setMessage] = useState('系统已就绪，可直接开始杂草分割分析，支持图片、视频和实时流。');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBackendOnline, setIsBackendOnline] = useState(true);
  const [imageFileName, setImageFileName] = useState('');
  const [videoFileName, setVideoFileName] = useState('');
  const [selectedFrameId, setSelectedFrameId] = useState<number | null>(null);
  const [hoveredDetailTarget, setHoveredDetailTarget] = useState<DetailTarget | null>(null);
  const [lockedDetailTarget, setLockedDetailTarget] = useState<DetailTarget | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [overlayOpacity, setOverlayOpacity] = useState(0.78);
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain');
  const [zoomLevel, setZoomLevel] = useState(1);

  useEffect(() => {
    let mounted = true;
    const dashboardSocket = openDashboardRealtimeSocket((payload) => {
      if (!mounted) {
        return;
      }
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
  }, [historySelection.selectedHistoryStatus, historySelection.selectedHistoryType]);

  useEffect(() => {
    setHoveredDetailTarget(null);
    setLockedDetailTarget(null);
  }, [location.pathname]);

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
          ? [...current.frames.filter((frame) => frame.id !== payload.frames[0].id), ...payload.frames].slice(-12)
          : current.frames;
        return {
          job: payload.job,
          latest_result: payload.latest_result,
          frames: mergedFrames,
        };
      });
      void refreshHistory(false);
    });
    analysisSocketRef.current = socket;

    return () => {
      socket.close();
      if (analysisSocketRef.current === socket) {
        analysisSocketRef.current = null;
      }
    };
  }, [selectedJob?.job.id, selectedJob?.job.status]);

  useEffect(() => {
    if (!selectedJob) {
      setSelectedFrameId(null);
      return;
    }
    if (selectedJob.frames.length === 0) {
      setSelectedFrameId(null);
      return;
    }
    setSelectedFrameId((current) => {
      if (current && selectedJob.frames.some((frame) => frame.id === current)) {
        return current;
      }
      return selectedJob.frames.at(-1)?.id ?? null;
    });
  }, [selectedJob?.job.id, selectedJob?.frames]);

  useEffect(() => {
    if (location.pathname !== '/analysis') {
      return;
    }
    const rawJobId = searchParams.get('jobId');
    if (!rawJobId) {
      return;
    }
    const jobId = Number(rawJobId);
    if (!Number.isFinite(jobId) || jobId <= 0 || selectedJob?.job.id === jobId) {
      return;
    }

    void openHistoryJob(jobId, false);
  }, [location.pathname, searchParams, selectedJob?.job.id]);

  const currentResult = selectedJob?.latest_result ?? null;
  const selectedFrame = useMemo(() => {
    if (!selectedJob || selectedJob.frames.length === 0) {
      return null;
    }
    return selectedJob.frames.find((frame) => frame.id === selectedFrameId) ?? selectedJob.frames.at(-1) ?? null;
  }, [selectedFrameId, selectedJob]);

  const sourceImagePath = useMemo(() => {
    if (selectedFrame?.source_frame_path) {
      return toAbsoluteAssetUrl(selectedFrame.source_frame_path);
    }
    if (selectedJob?.job.source_type === 'image') {
      return toAbsoluteAssetUrl(selectedJob.job.source_media_path || currentResult?.source_image_path);
    }
    return toAbsoluteAssetUrl(currentResult?.source_image_path);
  }, [currentResult?.source_image_path, selectedFrame?.source_frame_path, selectedJob]);

  const compareImagePath = useMemo(() => {
    if (compareMode === 'mask') {
      return toAbsoluteAssetUrl(selectedFrame?.mask_image_path ?? currentResult?.mask_image_path);
    }
    return toAbsoluteAssetUrl(selectedFrame?.heatmap_image_path ?? currentResult?.heatmap_image_path);
  }, [compareMode, currentResult?.heatmap_image_path, currentResult?.mask_image_path, selectedFrame?.heatmap_image_path, selectedFrame?.mask_image_path]);

  const sourceVideoPath = toAbsoluteAssetUrl(selectedJob?.job.source_media_path);
  const shouldRenderSourceVideo = selectedJob?.job.source_type === 'video' && !selectedFrame && !!selectedJob.job.source_media_path;

  const framePreviewStates = useMemo<FramePreviewState[]>(() => {
    if (!selectedJob) {
      return [];
    }
    return selectedJob.frames.map((frame) => ({
      id: frame.id,
      title: `关键帧 ${frame.frame_index}`,
      timestampLabel: `${frame.frame_timestamp_seconds.toFixed(1)}s`,
      coverageLabel: `覆盖率 ${formatPercent(frame.weed_coverage_ratio)}`,
      plantLabel: `植株 ${frame.estimated_plant_count}`,
      confidenceLabel: `置信度 ${(frame.average_confidence * 100).toFixed(1)}%`,
      previewImagePath: toAbsoluteAssetUrl(frame.heatmap_image_path),
      active: frame.id === selectedFrame?.id,
    }));
  }, [selectedFrame?.id, selectedJob]);

  const trendJobs = useMemo(() => [...historyJobs].slice(0, 8).reverse(), [historyJobs]);

  const metricCards = useMemo<MetricCardData[]>(() => {
    const coverageRatio = selectedFrame?.weed_coverage_ratio ?? currentResult?.weed_coverage_ratio ?? 0;
    const estimatedPlants = selectedFrame?.estimated_plant_count ?? currentResult?.estimated_plant_count ?? 0;
    const avgConfidence = selectedFrame?.average_confidence ?? currentResult?.average_confidence ?? selectedJob?.job.average_confidence ?? 0;
    const sampleCount = selectedJob ? (selectedJob.job.source_type === 'image' ? 1 : Math.max(selectedJob.job.frame_count, selectedJob.frames.length)) : 0;
    const processingTime = currentResult?.processing_time_ms ?? 0;
    const resultTime = currentResult ? formatDateTime(currentResult.result_time) : '--';

    return [
      {
        key: 'coverage',
        label: '杂草覆盖面积占比',
        value: currentResult || selectedFrame ? formatPercent(coverageRatio) : '--',
        tone: 'success',
        hint: '识别范围',
        footnote: '越高表示当前画面中杂草区域越集中',
        meter: toneMeter(coverageRatio),
        trend: trendJobs.map((job) => job.average_coverage_ratio),
      },
      {
        key: 'plants',
        label: '估算杂草植株数',
        value: currentResult || selectedFrame ? `${estimatedPlants}` : '--',
        tone: 'warning',
        hint: '连通域估算',
        footnote: '适合做批次趋势对比，不代表逐株精确计数',
        meter: toneMeter(estimatedPlants / 200),
        trend: trendJobs.map((job) => job.estimated_plant_count),
      },
      {
        key: 'confidence',
        label: '平均置信度',
        value: currentResult || selectedFrame ? `${(avgConfidence * 100).toFixed(1)}%` : '--',
        tone: 'info',
        hint: '模型稳定性',
        footnote: '当热力分布很散时，建议结合原图与掩码一起复核',
        meter: toneMeter(avgConfidence),
        trend: trendJobs.map((job) => job.average_confidence),
      },
      {
        key: 'samples',
        label: selectedJob?.job.source_type === 'image' ? '处理样本数' : '处理帧数',
        value: selectedJob ? `${sampleCount}` : '--',
        tone: 'neutral',
        hint: '任务体量',
        footnote: '样本越多，趋势判断越稳，但任务耗时也会增加',
        meter: toneMeter(sampleCount / 24),
        trend: trendJobs.map((job) => job.frame_count || (job.source_type === 'image' ? 1 : 0)),
      },
      {
        key: 'processing',
        label: '单次分析耗时',
        value: currentResult ? `${processingTime} ms` : '--',
        tone: 'info',
        hint: '结果延迟',
        footnote: '当前图像完成一次推理与后处理所消耗的时间',
        meter: toneMeter(processingTime / 4000),
        trend: trendJobs.map((job) => job.frame_count || 1),
      },
      {
        key: 'resultTime',
        label: '结果时间',
        value: resultTime,
        tone: 'muted',
        hint: '时间戳',
        footnote: '适合与实时流状态、历史趋势和关键帧对照查看',
        meter: currentResult ? 1 : 0,
        trend: trendJobs.map((_, index) => index + 1),
      },
    ];
  }, [currentResult, selectedFrame, selectedJob, trendJobs]);

  const trendOption = useMemo(() => ({
    backgroundColor: 'transparent',
    animation: false,
    textStyle: { color: '#d7e7f6' },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(9, 18, 28, 0.96)',
      borderColor: '#274561',
      textStyle: { color: '#ecf5ff' },
      formatter: (params: Array<{ seriesName: string; data: number; axisValueLabel: string }>) => {
        const lines = params.map((item) => {
          if (item.seriesName === '覆盖率') {
            return `${item.seriesName}: ${(item.data * 100).toFixed(1)}%`;
          }
          if (item.seriesName === '平均置信度') {
            return `${item.seriesName}: ${(item.data * 100).toFixed(1)}%`;
          }
          return `${item.seriesName}: ${item.data}`;
        });
        return [params[0]?.axisValueLabel ?? '', ...lines].join('<br/>');
      },
    },
    grid: { left: 44, right: 24, top: 38, bottom: 34 },
    legend: {
      top: 4,
      textStyle: { color: '#92aac0' },
    },
    xAxis: {
      type: 'category',
      data: trendJobs.map((job) => new Date(job.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })),
      axisLabel: { color: '#8fa3b8' },
      axisLine: { lineStyle: { color: '#1f3246' } },
    },
    yAxis: [
      {
        type: 'value',
        name: '覆盖率 / 置信度',
        min: 0,
        max: 1,
        axisLabel: {
          color: '#8fa3b8',
          formatter: (value: number) => `${Math.round(value * 100)}%`,
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
        data: trendJobs.map((job) => job.average_coverage_ratio),
        lineStyle: { color: '#21d07a', width: 3 },
        areaStyle: { color: 'rgba(33, 208, 122, 0.16)' },
        itemStyle: { color: '#21d07a' },
        symbolSize: 8,
      },
      {
        name: '平均置信度',
        type: 'line',
        smooth: true,
        data: trendJobs.map((job) => job.average_confidence),
        lineStyle: { color: '#35a7ff', width: 2, type: 'dashed' },
        itemStyle: { color: '#35a7ff' },
        symbolSize: 7,
      },
      {
        name: '植株估算',
        type: 'bar',
        yAxisIndex: 1,
        data: trendJobs.map((job) => job.estimated_plant_count),
        itemStyle: { color: '#f5c24e', borderRadius: [6, 6, 0, 0] },
        barMaxWidth: 18,
      },
    ],
  }), [trendJobs]);

  function buildDefaultDetailTarget(): DetailTarget {
    if (!selectedJob) {
      return {
        id: 'default-empty',
        type: 'summary',
        title: '等待分析任务',
        subtitle: '系统已就绪',
        description: '上传图片、视频或实时流后，这里会解释当前图像、统计指标和历史趋势之间的关系。',
        tone: 'muted',
        badge: '待接入',
        note: '当前没有选中的分析任务。建议先上传一张田间图像，工作台会自动进入双栏对比与详情联动模式。',
        fields: [
          { label: '后端地址', value: apiBaseUrl },
          { label: '模型状态', value: isBackendOnline ? '可用' : '离线', tone: isBackendOnline ? 'success' : 'danger' },
          { label: '实时流', value: dashboard?.video.hls_status ?? '--' },
          { label: '当前模式', value: '图像优先工作台' },
        ],
      };
    }

    const coverage = selectedFrame?.weed_coverage_ratio ?? currentResult?.weed_coverage_ratio ?? 0;
    const plants = selectedFrame?.estimated_plant_count ?? currentResult?.estimated_plant_count ?? 0;
    const confidence = selectedFrame?.average_confidence ?? currentResult?.average_confidence ?? selectedJob.job.average_confidence ?? 0;

    return {
      id: `summary-${selectedJob.job.id}`,
      type: 'summary',
      title: `${sourceLabel(selectedJob.job.source_type)}任务 #${selectedJob.job.id}`,
      subtitle: `${statusLabel(selectedJob.job.status)} · ${selectedJob.job.model_backend}`,
      description: currentResult?.summary_note ?? '当前详情面板正在汇总主舞台、指标卡和历史趋势中的关键结果。',
      tone: statusTone(selectedJob.job.status),
      badge: sourceLabel(selectedJob.job.source_type),
      imagePath: compareImagePath || sourceImagePath || undefined,
      note: '如果你想持续查看某个统计口径或关键帧，可以直接点击它，详情检查器会锁定内容。',
      fields: [
        { label: '覆盖率', value: currentResult || selectedFrame ? formatPercent(coverage) : '--', tone: 'success' },
        { label: '植株估算', value: currentResult || selectedFrame ? `${plants}` : '--', tone: 'warning' },
        { label: '平均置信度', value: currentResult || selectedFrame ? `${(confidence * 100).toFixed(1)}%` : '--', tone: 'info' },
        { label: '结果时间', value: currentResult ? formatDateTime(currentResult.result_time) : '--' },
      ],
    };
  }

  function buildMetricDetailTarget(metricKey: string): DetailTarget | null {
    const definition = metricDefinitions.find((item) => item.key === metricKey);
    const card = metricCards.find((item) => item.key === metricKey);
    if (!definition || !card) {
      return null;
    }
    return {
      id: `metric-${definition.key}`,
      type: 'metric',
      title: definition.label,
      subtitle: `指标口径 · ${definition.shortLabel}`,
      description: definition.description,
      tone: definition.tone,
      badge: '指标说明',
      note: `当前系统中该指标的计算口径为：${definition.formula}。结合主舞台的热力图和掩码图一起看，会更容易判断这个数字是否合理。`,
      fields: [
        { label: '当前值', value: card.value, tone: definition.tone },
        { label: '解释重点', value: card.hint },
        { label: '当前提示', value: card.footnote },
        { label: '计算口径', value: definition.formula },
      ],
    };
  }

  function buildFrameDetailTarget(frame: AnalysisFrame): DetailTarget {
    return {
      id: `frame-${frame.id}`,
      type: 'frame',
      title: `关键帧 ${frame.frame_index}`,
      subtitle: `${frame.frame_timestamp_seconds.toFixed(1)}s · hover 预览`,
      description: '这张关键帧是当前视频或实时流任务中的采样结果，可用于比对杂草热力分布与分割边界。',
      tone: 'info',
      badge: '关键帧',
      imagePath: toAbsoluteAssetUrl(compareMode === 'heatmap' ? frame.heatmap_image_path : frame.mask_image_path),
      note: '点击关键帧后，主舞台会锁定这张图像，右侧详情也会保持对应统计，方便逐帧对照查看。',
      fields: [
        { label: '覆盖率', value: formatPercent(frame.weed_coverage_ratio), tone: 'success' },
        { label: '植株估算', value: `${frame.estimated_plant_count}`, tone: 'warning' },
        { label: '置信度', value: `${(frame.average_confidence * 100).toFixed(1)}%`, tone: 'info' },
        { label: '采样时间', value: `${frame.frame_timestamp_seconds.toFixed(1)} s` },
      ],
    };
  }

  function buildJobDetailTarget(job: AnalysisJob, mode: 'history' | 'trend' = 'history'): DetailTarget {
    const matchedSummaryImage = selectedJob?.job.id === job.id
      ? compareImagePath || sourceImagePath
      : dashboard?.latest_analysis?.job_id === job.id
        ? toAbsoluteAssetUrl(dashboard.latest_analysis.heatmap_image_path)
        : undefined;

    return {
      id: `${mode}-${job.id}`,
      type: mode === 'trend' ? 'trend' : 'job',
      title: `${sourceLabel(job.source_type)}任务 #${job.id}`,
      subtitle: `${statusLabel(job.status)} · ${mode === 'trend' ? '趋势点联动' : '历史任务'}`,
      description: '这里汇总了该任务的来源、结果表现和历史上下文，便于你快速回看过去的分析结论。',
      tone: statusTone(job.status),
      badge: mode === 'trend' ? '趋势详情' : '历史详情',
      imagePath: matchedSummaryImage || undefined,
      note: '点击历史卡片或趋势点后，可以跳回分析工作台继续查看图像结果和关键帧。',
      fields: [
        { label: '来源类型', value: sourceLabel(job.source_type) },
        { label: '覆盖率', value: formatPercent(job.average_coverage_ratio || 0), tone: 'success' },
        { label: '植株估算', value: `${job.estimated_plant_count}`, tone: 'warning' },
        { label: '平均置信度', value: `${(job.average_confidence * 100).toFixed(1)}%`, tone: 'info' },
      ],
    };
  }

  const compositionDetail = useMemo<DetailTarget>(() => ({
    id: 'composition',
    type: 'summary',
    title: '当前结果构成',
    subtitle: '覆盖率 / 置信度 / 进度',
    description: '这组条形构成卡把当前结果拆成几个最常用的判断维度，让你不用来回切换也能看懂当前任务是否值得继续追踪。',
    tone: 'info',
    badge: '结果解读',
    note: '如果覆盖率高、置信度稳定、进度持续推进，通常说明当前任务的分割结果具备进一步分析价值。',
    fields: [
      { label: '覆盖率条', value: currentResult || selectedFrame ? formatPercent(selectedFrame?.weed_coverage_ratio ?? currentResult?.weed_coverage_ratio ?? 0) : '--', tone: 'success' },
      { label: '置信度条', value: currentResult || selectedFrame ? `${((selectedFrame?.average_confidence ?? currentResult?.average_confidence ?? 0) * 100).toFixed(1)}%` : '--', tone: 'info' },
      { label: '任务进度', value: selectedJob ? `${Math.round(selectedJob.job.progress * 100)}%` : '--', tone: 'warning' },
      { label: '任务状态', value: selectedJob ? statusLabel(selectedJob.job.status) : '待启动' },
    ],
  }), [currentResult, selectedFrame, selectedJob]);

  const analysisDefaultDetailTarget = useMemo(buildDefaultDetailTarget, [compareImagePath, currentResult, dashboard, isBackendOnline, selectedFrame, selectedJob, sourceImagePath]);
  const analysisActiveDetailTarget = lockedDetailTarget ?? hoveredDetailTarget ?? analysisDefaultDetailTarget;

  const historyDefaultDetailTarget = useMemo<DetailTarget>(() => {
    if (selectedJob) {
      return buildJobDetailTarget(selectedJob.job);
    }
    if (historyJobs.length > 0) {
      return buildJobDetailTarget(historyJobs[0]);
    }
    return {
      id: 'history-empty',
      type: 'summary',
      title: '暂无历史结果',
      subtitle: '等待任务沉淀',
      description: '历史分析页用于筛选、对比和回看过去的任务结果。当系统积累了更多图片、视频和实时流任务后，这里会更有价值。',
      tone: 'muted',
      badge: '历史页',
      note: '你可以先去分析工作台上传图片或视频，结果会自动出现在历史分析页。',
      fields: [
        { label: '历史任务', value: '0' },
        { label: '趋势点', value: '0' },
        { label: '分析入口', value: '分析工作台' },
        { label: '当前状态', value: '等待任务' },
      ],
    };
  }, [historyJobs, selectedJob]);
  const historyActiveDetailTarget = lockedDetailTarget ?? hoveredDetailTarget ?? historyDefaultDetailTarget;

  const compositionItems = useMemo(() => {
    const coverage = selectedFrame?.weed_coverage_ratio ?? currentResult?.weed_coverage_ratio ?? 0;
    const confidence = selectedFrame?.average_confidence ?? currentResult?.average_confidence ?? 0;
    const progress = selectedJob?.job.progress ?? 0;
    return [
      { label: '覆盖率条', value: currentResult || selectedFrame ? formatPercent(coverage) : '--', meter: toneMeter(coverage), tone: 'success' },
      { label: '置信度条', value: currentResult || selectedFrame ? `${(confidence * 100).toFixed(1)}%` : '--', meter: toneMeter(confidence), tone: 'info' },
      { label: '任务进度', value: selectedJob ? `${Math.round(progress * 100)}%` : '--', meter: toneMeter(progress), tone: 'warning' },
    ];
  }, [currentResult, selectedFrame, selectedJob]);

  const modelSummary = useMemo(() => ([
    { label: '当前后端', value: apiBaseUrl },
    { label: '模型后端', value: selectedJob?.job.model_backend ?? '等待任务接入' },
    { label: '模型状态', value: isBackendOnline ? '可用' : '离线' },
    { label: '估算口径', value: '连通域估算植株数' },
  ]), [isBackendOnline, selectedJob?.job.model_backend]);

  const systemSummary = useMemo(() => ([
    { label: '总检测数', value: `${dashboard?.detection.total_count ?? '--'}` },
    { label: '当前分钟', value: `${dashboard?.detection.current_minute_count ?? '--'}` },
    { label: '风险指数', value: dashboard ? formatNumber(dashboard.detection.risk_index, 1) : '--' },
    { label: '最近分析', value: dashboard?.latest_analysis ? `任务 #${dashboard.latest_analysis.job_id}` : '暂无' },
  ]), [dashboard]);

  const latestAnalysisTarget = useMemo<DetailTarget>(() => {
    if (dashboard?.latest_analysis) {
      return {
        id: `latest-${dashboard.latest_analysis.job_id}`,
        type: 'summary',
        title: `最近分析任务 #${dashboard.latest_analysis.job_id}`,
        subtitle: `${sourceLabel(dashboard.latest_analysis.source_type)} · ${statusLabel(dashboard.latest_analysis.status)}`,
        description: '首页只展示最近一次分析摘要，点击功能入口后再进入更完整的图像对比或历史回看页面。',
        tone: statusTone(dashboard.latest_analysis.status),
        badge: '最近分析',
        imagePath: dashboard.latest_analysis.heatmap_image_path ? toAbsoluteAssetUrl(dashboard.latest_analysis.heatmap_image_path) : undefined,
        fields: [
          { label: '覆盖率', value: dashboard.latest_analysis.coverage_ratio !== undefined ? formatPercent(dashboard.latest_analysis.coverage_ratio) : '--', tone: 'success' },
          { label: '植株估算', value: dashboard.latest_analysis.estimated_plant_count !== undefined ? `${dashboard.latest_analysis.estimated_plant_count}` : '--', tone: 'warning' },
          { label: '结果时间', value: dashboard.latest_analysis.result_time ? formatDateTime(dashboard.latest_analysis.result_time) : '--' },
          { label: '任务状态', value: statusLabel(dashboard.latest_analysis.status), tone: statusTone(dashboard.latest_analysis.status) },
        ],
        note: '首页只做概览。真正的图像对比、关键帧浏览和趋势联动，请分别进入分析工作台或历史分析页。',
      };
    }
    return analysisDefaultDetailTarget;
  }, [analysisDefaultDetailTarget, dashboard]);

  const overviewCards = useMemo<HomeOverviewCard[]>(() => ([
    {
      id: 'health',
      title: '系统在线状态',
      subtitle: dashboard?.system.health ?? '等待状态',
      description: '汇总当前后端、流媒体和模型运行状态，适合作为首页第一眼判断。',
      value: isBackendOnline ? '在线' : '离线',
      tone: isBackendOnline ? 'success' : 'danger',
    },
    {
      id: 'latest',
      title: '最近一次分析',
      subtitle: dashboard?.latest_analysis ? `${sourceLabel(dashboard.latest_analysis.source_type)}任务` : '暂无结果',
      description: '展示最近分析的任务类型与状态，帮助你决定是继续查看工作台还是先回看历史。',
      value: dashboard?.latest_analysis ? `#${dashboard.latest_analysis.job_id}` : '--',
      tone: dashboard?.latest_analysis ? statusTone(dashboard.latest_analysis.status) : 'muted',
    },
    {
      id: 'video',
      title: '实时流状态',
      subtitle: `${dashboard?.video.rtmp_status ?? '--'} / ${dashboard?.video.hls_status ?? '--'}`,
      description: '集中展示 RTMP、HLS、FPS 和延迟，适合快速判断实时链路是否稳定。',
      value: dashboard ? `${dashboard.video.fps.toFixed(1)} FPS` : '--',
      tone: 'info',
    },
    {
      id: 'risk',
      title: '风险指数',
      subtitle: '检测态势',
      description: '结合检测总数与当前分钟统计，作为首页上的总体态势提示。',
      value: dashboard ? formatNumber(dashboard.detection.risk_index, 1) : '--',
      tone: 'warning',
    },
  ]), [dashboard, isBackendOnline]);

  const entryCards = useMemo<HomeOverviewCard[]>(() => ([
    {
      id: 'entry-analysis',
      title: '进入分析工作台',
      subtitle: '上传与图像对照',
      description: '在双栏图像舞台中查看原图、热力图和掩码图，适合处理当前任务。',
      value: selectedJob ? `当前任务 #${selectedJob.job.id}` : '开始分析',
      tone: 'success',
      route: 'analysis',
    },
    {
      id: 'entry-history',
      title: '查看历史分析',
      subtitle: '趋势与回看',
      description: '进入历史分析页筛选任务、查看趋势，并回跳到分析工作台继续看图。',
      value: historyJobs.length > 0 ? `${historyJobs.length} 条记录` : '暂无历史',
      tone: 'info',
      route: 'history',
    },
    {
      id: 'entry-system',
      title: '查看实时系统状态',
      subtitle: '首页总览',
      description: '保留总览视角，快速确认系统状态、最近一次分析和风险指数。',
      value: dashboard?.system.status ?? '总览',
      tone: 'warning',
      route: 'home',
    },
  ]), [dashboard?.system.status, historyJobs.length, selectedJob]);

  async function refreshHistory(keepCurrentSelection = true) {
    try {
      const response = await fetchJobList({
        sourceType: historySelection.selectedHistoryType,
        status: historySelection.selectedHistoryStatus,
      });
      setHistoryJobs(response.items);

      const preferredJobId = keepCurrentSelection
        ? (selectedJob?.job.id ?? response.items[0]?.id)
        : selectedJob?.job.id;

      if (preferredJobId) {
        const detail = await fetchJobDetail(preferredJobId);
        setSelectedJob(detail);
      } else if (response.items.length === 0) {
        setSelectedJob(null);
      }
    } catch {
      setMessage('历史记录读取失败，请检查后端分析服务。');
      setIsBackendOnline(false);
    }
  }

  async function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setImageFileName(file.name);
    setIsSubmitting(true);
    setMessage(`正在分析图片：${file.name}，将输出杂草热力分割图与面积统计。`);
    try {
      const response = await uploadImage(file);
      setSelectedJob({
        job: response.job,
        latest_result: response.result,
        frames: [],
      });
      setCompareMode('heatmap');
      setMessage('图片分析完成，已切换到分析工作台的双栏对比视图。');
      navigate('/analysis');
      await refreshHistory();
    } catch {
      setMessage('图片分析失败，请检查文件格式或后端模型服务。');
      setIsBackendOnline(false);
    } finally {
      setIsSubmitting(false);
      event.target.value = '';
    }
  }

  async function handleVideoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setVideoFileName(file.name);
    setIsSubmitting(true);
    setMessage(`视频任务已创建：${file.name}，正在抽帧进行杂草分割分析。`);
    try {
      const response = await uploadVideo(file);
      setSelectedJob(response);
      setCompareMode('heatmap');
      setMessage('视频分析任务已创建，等待关键帧与热力结果更新。');
      navigate('/analysis');
      await refreshHistory();
    } catch {
      setMessage('视频分析任务创建失败，请稍后重试。');
      setIsBackendOnline(false);
    } finally {
      setIsSubmitting(false);
      event.target.value = '';
    }
  }

  async function handleDroppedFile(file: File, tab: 'image' | 'video') {
    const mockEvent = {
      target: {
        files: [file],
        value: '',
      },
    } as unknown as ChangeEvent<HTMLInputElement>;

    if (tab === 'image') {
      await handleImageUpload(mockEvent);
      return;
    }
    await handleVideoUpload(mockEvent);
  }

  async function handleCreateStream() {
    setIsSubmitting(true);
    setMessage(`正在启动流分析：${streamUrl}，将持续输出杂草热力结果。`);
    try {
      const response = await createStreamJob(streamUrl);
      setSelectedJob(response);
      setCompareMode('heatmap');
      setMessage('实时流任务已启动，分析工作台会持续接收最新热力分割结果。');
      navigate('/analysis');
      await refreshHistory();
    } catch {
      setMessage('流分析任务启动失败，请确认流地址可访问。');
      setIsBackendOnline(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStopCurrentJob() {
    if (!selectedJob) {
      return;
    }
    try {
      await stopJob(selectedJob.job.id);
      setMessage(`已请求停止任务 #${selectedJob.job.id}。`);
      await refreshHistory();
    } catch {
      setMessage(`停止任务 #${selectedJob.job.id} 失败，请稍后重试。`);
    }
  }

  async function openHistoryJob(jobId: number, navigateToAnalysis = false) {
    try {
      const detail = await fetchJobDetail(jobId);
      setSelectedJob(detail);
      setCompareMode('heatmap');
      if (navigateToAnalysis) {
        navigate(`/analysis?jobId=${jobId}`);
      }
      setMessage(`已打开任务 #${jobId}，可继续查看图像结果或历史趋势。`);
    } catch {
      setMessage(`任务 #${jobId} 打开失败，请稍后重试。`);
    }
  }

  function handleMetricHover(metricKey: string | null) {
    setHoveredDetailTarget(metricKey ? buildMetricDetailTarget(metricKey) : null);
  }

  function handleMetricClick(metricKey: string) {
    const detail = buildMetricDetailTarget(metricKey);
    if (detail) {
      setLockedDetailTarget(detail);
    }
  }

  function handleFrameHover(frameId: number | null) {
    if (!frameId || !selectedJob) {
      setHoveredDetailTarget(null);
      return;
    }
    const frame = selectedJob.frames.find((item) => item.id === frameId);
    setHoveredDetailTarget(frame ? buildFrameDetailTarget(frame) : null);
  }

  function handleFrameClick(frameId: number) {
    if (!selectedJob) {
      return;
    }
    setSelectedFrameId(frameId);
    const frame = selectedJob.frames.find((item) => item.id === frameId);
    if (frame) {
      setLockedDetailTarget(buildFrameDetailTarget(frame));
    }
  }

  function handleJobHover(jobId: number | null) {
    if (!jobId) {
      setHoveredDetailTarget(null);
      return;
    }
    const job = historyJobs.find((item) => item.id === jobId);
    setHoveredDetailTarget(job ? buildJobDetailTarget(job) : null);
  }

  function handleJobLock(jobId: number) {
    const job = historyJobs.find((item) => item.id === jobId);
    if (job) {
      setLockedDetailTarget(buildJobDetailTarget(job));
    }
  }

  function handleTrendHover(index: number | null) {
    if (index === null || index < 0 || index >= trendJobs.length) {
      setHoveredDetailTarget(null);
      return;
    }
    const job = trendJobs[index];
    setHoveredDetailTarget(buildJobDetailTarget(job, 'trend'));
  }

  function handleTrendClick(index: number | null) {
    if (index === null || index < 0 || index >= trendJobs.length) {
      return;
    }
    const job = trendJobs[index];
    setLockedDetailTarget(buildJobDetailTarget(job, 'trend'));
    void openHistoryJob(job.id);
  }

  function handleZoomIn() {
    setZoomLevel((current) => clamp(current + 0.12, 1, 2.2));
  }

  function handleZoomOut() {
    setZoomLevel((current) => clamp(current - 0.12, 0.8, 2.2));
  }

  function handleResetView() {
    setZoomLevel(1);
    setFitMode('contain');
    setShowOverlay(true);
    setOverlayOpacity(0.78);
  }

  function navigateToRoute(route: AppRoute) {
    if (route === 'analysis') {
      navigate(selectedJob ? `/analysis?jobId=${selectedJob.job.id}` : '/analysis');
      return;
    }
    if (route === 'history') {
      navigate('/history');
      return;
    }
    navigate('/');
  }

  return (
    <AppShell dashboard={dashboard} isBackendOnline={isBackendOnline} message={message}>
      <Routes>
        <Route
          path="/"
          element={(
            <HomePage
              dashboard={dashboard}
              latestDetailTarget={latestAnalysisTarget}
              overviewCards={overviewCards}
              entryCards={entryCards}
              onEntryClick={navigateToRoute}
            />
          )}
        />
        <Route
          path="/analysis"
          element={(
            <AnalysisPage
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              selectedJob={selectedJob}
              imageFileName={imageFileName}
              videoFileName={videoFileName}
              streamUrl={streamUrl}
              setStreamUrl={setStreamUrl}
              onImageUpload={handleImageUpload}
              onVideoUpload={handleVideoUpload}
              onDroppedFile={handleDroppedFile}
              onCreateStream={handleCreateStream}
              onRefreshHistory={() => void refreshHistory()}
              onStopCurrentJob={() => void handleStopCurrentJob()}
              sourceType={selectedJob?.job.source_type ?? null}
              sourceName={selectedJob?.job.source_name ?? '未选择任务'}
              sourceLabelText={selectedJob ? sourceLabel(selectedJob.job.source_type) : '等待结果'}
              compareMode={compareMode}
              setCompareMode={setCompareMode}
              sourceImagePath={sourceImagePath}
              compareImagePath={compareImagePath}
              sourceVideoPath={sourceVideoPath}
              shouldRenderSourceVideo={Boolean(shouldRenderSourceVideo)}
              showOverlay={showOverlay}
              overlayOpacity={overlayOpacity}
              fitMode={fitMode}
              zoomLevel={zoomLevel}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onToggleOverlay={() => setShowOverlay((current) => !current)}
              onToggleFitMode={() => setFitMode((current) => current === 'contain' ? 'cover' : 'contain')}
              onResetView={handleResetView}
              onOverlayOpacityChange={setOverlayOpacity}
              thumbnails={framePreviewStates}
              onFrameHover={handleFrameHover}
              onFrameClick={handleFrameClick}
              onStageDetailHover={setHoveredDetailTarget}
              stageDetailTarget={analysisDefaultDetailTarget}
              activeDetailTarget={analysisActiveDetailTarget}
              isDetailLocked={Boolean(lockedDetailTarget)}
              onUnlockDetail={() => setLockedDetailTarget(null)}
              metricCards={metricCards}
              compositionItems={compositionItems}
              modelSummary={modelSummary}
              systemSummary={systemSummary}
              onMetricHover={handleMetricHover}
              onMetricClick={handleMetricClick}
              onCompositionHover={setHoveredDetailTarget}
              compositionDetail={compositionDetail}
            />
          )}
        />
        <Route
          path="/history"
          element={(
            <HistoryPage
              historyJobs={historyJobs}
              selectedJobId={selectedJob?.job.id ?? null}
              selectedHistoryType={historySelection.selectedHistoryType}
              selectedHistoryStatus={historySelection.selectedHistoryStatus}
              onSelectHistoryType={(value) => setHistorySelection((current) => ({ ...current, selectedHistoryType: value }))}
              onSelectHistoryStatus={(value) => setHistorySelection((current) => ({ ...current, selectedHistoryStatus: value }))}
              onOpenJob={(jobId) => void openHistoryJob(jobId)}
              onJobHover={handleJobHover}
              onJobLock={handleJobLock}
              historyDetailTarget={historyActiveDetailTarget}
              isDetailLocked={Boolean(lockedDetailTarget)}
              onUnlockDetail={() => setLockedDetailTarget(null)}
              trendOption={trendOption}
              onPointHover={handleTrendHover}
              onPointClick={handleTrendClick}
              analysisLinkJobId={selectedJob?.job.id ?? null}
            />
          )}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {isSubmitting && (
        <div className="loading-mask">
          <div className="loading-card">
            <strong>分析任务处理中</strong>
            <span>正在上传数据并等待模型返回热力分割结果...</span>
          </div>
        </div>
      )}
    </AppShell>
  );
}
