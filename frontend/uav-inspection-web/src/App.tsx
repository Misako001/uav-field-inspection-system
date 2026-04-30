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
  ResultGalleryItem,
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
    key: 'components',
    label: '杂草连通域数量',
    shortLabel: '连通域',
    description: '基于抑噪后杂草掩码连通域的计数结果，用于判断疑似杂草团块数量。',
    formula: '抑噪后的杂草二值掩码连通域计数',
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
  const [previewMode, setPreviewMode] = useState<PreviewMode>('heatmap');
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

  const heatmapImagePath = useMemo(
    () => toAbsoluteAssetUrl(selectedFrame?.heatmap_image_path ?? currentResult?.heatmap_image_path),
    [currentResult?.heatmap_image_path, selectedFrame?.heatmap_image_path],
  );
  const segmentationImagePath = useMemo(
    () => toAbsoluteAssetUrl(selectedFrame?.overlay_segmentation_path ?? currentResult?.overlay_segmentation_path ?? selectedFrame?.segmentation_image_path ?? currentResult?.segmentation_image_path),
    [currentResult?.overlay_segmentation_path, currentResult?.segmentation_image_path, selectedFrame?.overlay_segmentation_path, selectedFrame?.segmentation_image_path],
  );
  const maskImagePath = useMemo(
    () => toAbsoluteAssetUrl(selectedFrame?.mask_image_path ?? currentResult?.mask_image_path),
    [currentResult?.mask_image_path, selectedFrame?.mask_image_path],
  );

  const selectedMetrics = useMemo(() => {
    const weedAreaRatio = selectedFrame?.weed_area_ratio ?? currentResult?.weed_area_ratio ?? currentResult?.weed_coverage_ratio ?? 0;
    const cropAreaRatio = selectedFrame?.crop_area_ratio ?? currentResult?.crop_area_ratio ?? 0;
    const backgroundAreaRatio = selectedFrame?.background_area_ratio ?? currentResult?.background_area_ratio ?? Math.max(0, 1 - weedAreaRatio - cropAreaRatio);
    const weedPixelArea = selectedFrame?.weed_pixel_area ?? currentResult?.weed_pixel_area ?? 0;
    const componentCount = selectedFrame?.weed_component_count ?? currentResult?.weed_component_count ?? selectedFrame?.estimated_plant_count ?? currentResult?.estimated_plant_count ?? 0;
    const estimatedPlants = selectedFrame?.estimated_plant_count ?? currentResult?.estimated_plant_count ?? 0;
    const avgConfidence = selectedFrame?.average_confidence ?? currentResult?.average_confidence ?? selectedJob?.job.average_confidence ?? 0;
    const processingTime = currentResult?.processing_time_ms ?? 0;
    const resultTime = currentResult ? formatDateTime(currentResult.result_time) : '--';
    const totalRatio = weedAreaRatio + cropAreaRatio + backgroundAreaRatio;

    return {
      weedAreaRatio,
      cropAreaRatio,
      backgroundAreaRatio: totalRatio > 0 ? backgroundAreaRatio / totalRatio : backgroundAreaRatio,
      weedPixelArea,
      componentCount,
      estimatedPlants,
      avgConfidence,
      processingTime,
      resultTime,
    };
  }, [currentResult, selectedFrame, selectedJob?.job.average_confidence]);

  const framePreviewStates = useMemo<FramePreviewState[]>(() => {
    if (!selectedJob) {
      return [];
    }
    return selectedJob.frames.map((frame) => ({
      id: frame.id,
      title: `关键帧 ${frame.frame_index}`,
      timestampLabel: `${frame.frame_timestamp_seconds.toFixed(1)}s`,
      coverageLabel: `覆盖率 ${formatPercent(frame.weed_area_ratio || frame.weed_coverage_ratio)}`,
      plantLabel: `连通域 ${frame.weed_component_count || frame.estimated_plant_count}`,
      confidenceLabel: `置信度 ${(frame.average_confidence * 100).toFixed(1)}%`,
      previewImagePath: toAbsoluteAssetUrl(frame.overlay_segmentation_path || frame.heatmap_image_path),
      active: frame.id === selectedFrame?.id,
    }));
  }, [selectedFrame?.id, selectedJob]);

  const trendJobs = useMemo(() => [...historyJobs].slice(0, 8).reverse(), [historyJobs]);

  const metricCards = useMemo<MetricCardData[]>(() => {
    const sampleCount = selectedJob ? (selectedJob.job.source_type === 'image' ? 1 : Math.max(selectedJob.job.frame_count, selectedJob.frames.length)) : 0;

    return [
      {
        key: 'coverage',
        label: '杂草覆盖面积占比',
        value: currentResult || selectedFrame ? formatPercent(selectedMetrics.weedAreaRatio) : '--',
        tone: 'success',
        hint: '区域占比',
        footnote: '来自彩色分割图中的杂草像素占比。',
        meter: toneMeter(selectedMetrics.weedAreaRatio),
      },
      {
        key: 'components',
        label: '杂草连通域数量',
        value: currentResult || selectedFrame ? `${selectedMetrics.componentCount}` : '--',
        tone: 'warning',
        hint: '抑噪后统计',
        footnote: '经过连通域过滤，尽量压掉地膜边缘和细长误检。',
        meter: toneMeter(selectedMetrics.componentCount / 120),
      },
      {
        key: 'confidence',
        label: '平均置信度',
        value: currentResult || selectedFrame ? `${(selectedMetrics.avgConfidence * 100).toFixed(1)}%` : '--',
        tone: 'info',
        hint: '模型稳定性',
        footnote: '建议结合热力图和分割图一起复核高置信区域。',
        meter: toneMeter(selectedMetrics.avgConfidence),
      },
      {
        key: 'samples',
        label: selectedJob?.job.source_type === 'image' ? '处理样本数' : '处理帧数',
        value: selectedJob ? `${sampleCount}` : '--',
        tone: 'neutral',
        hint: '任务体量',
        footnote: '图片任务固定为 1，视频和流任务会随抽帧增长。',
        meter: toneMeter(sampleCount / 24),
      },
      {
        key: 'processing',
        label: '单次分析耗时',
        value: currentResult ? `${selectedMetrics.processingTime} ms` : '--',
        tone: 'info',
        hint: '结果延迟',
        footnote: '包含预处理、模型推理、后处理和结果落盘。',
        meter: toneMeter(selectedMetrics.processingTime / 4000),
      },
      {
        key: 'resultTime',
        label: '结果时间',
        value: selectedMetrics.resultTime,
        tone: 'muted',
        hint: '时间戳',
        footnote: '适合与历史任务和关键帧时间点做对照。',
        meter: currentResult ? 1 : 0,
      },
    ];
  }, [currentResult, selectedFrame, selectedJob, selectedMetrics]);

  const galleryItems = useMemo<ResultGalleryItem[]>(() => ([
    {
      key: 'source',
      label: '原图',
      description: '田间原始航拍图像',
      imagePath: sourceImagePath,
      tone: 'neutral',
    },
    {
      key: 'heatmap',
      label: '热力图',
      description: '杂草概率热度分布',
      imagePath: heatmapImagePath,
      tone: 'warning',
    },
    {
      key: 'segmentation',
      label: '分割结果图',
      description: '背景 / 烟株 / 杂草 三分类叠加图',
      imagePath: segmentationImagePath,
      tone: 'success',
    },
    {
      key: 'mask',
      label: '掩码图',
      description: '杂草二值掩码辅助视图',
      imagePath: maskImagePath,
      tone: 'info',
    },
  ]), [heatmapImagePath, maskImagePath, segmentationImagePath, sourceImagePath]);

  const activePreviewItem = useMemo(
    () => galleryItems.find((item) => item.key === previewMode) ?? galleryItems[0],
    [galleryItems, previewMode],
  );

  const ratioChartData = useMemo(
    () => [
      { name: '杂草', value: Number((selectedMetrics.weedAreaRatio * 100).toFixed(2)), tone: 'danger' as const },
      { name: '烟株', value: Number((selectedMetrics.cropAreaRatio * 100).toFixed(2)), tone: 'success' as const },
      { name: '背景', value: Number((selectedMetrics.backgroundAreaRatio * 100).toFixed(2)), tone: 'muted' as const },
    ],
    [selectedMetrics.backgroundAreaRatio, selectedMetrics.cropAreaRatio, selectedMetrics.weedAreaRatio],
  );

  const barChartData = useMemo(
    () => [
      { name: '杂草像素面积', value: selectedMetrics.weedPixelArea, tone: 'danger' as const },
      { name: '连通域数量', value: selectedMetrics.componentCount, tone: 'warning' as const },
      { name: '平均置信度(%)', value: Number((selectedMetrics.avgConfidence * 100).toFixed(1)), tone: 'info' as const },
    ],
    [selectedMetrics.avgConfidence, selectedMetrics.componentCount, selectedMetrics.weedPixelArea],
  );

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

    return {
      id: `summary-${selectedJob.job.id}`,
      type: 'summary',
      title: `${sourceLabel(selectedJob.job.source_type)}任务 #${selectedJob.job.id}`,
      subtitle: `${statusLabel(selectedJob.job.status)} · ${selectedJob.job.model_backend}`,
      description: currentResult?.summary_note ?? '当前详情面板正在汇总主舞台、指标卡和历史趋势中的关键结果。',
      tone: statusTone(selectedJob.job.status),
      badge: sourceLabel(selectedJob.job.source_type),
      imagePath: activePreviewItem?.imagePath || sourceImagePath || undefined,
      note: '建议把原图、热力图和彩色分割图一起对照，看统计值是否和图像里的烟株、杂草位置一致。',
      fields: [
        { label: '杂草占比', value: currentResult || selectedFrame ? formatPercent(selectedMetrics.weedAreaRatio) : '--', tone: 'danger' },
        { label: '烟株占比', value: currentResult || selectedFrame ? formatPercent(selectedMetrics.cropAreaRatio) : '--', tone: 'success' },
        { label: '连通域数量', value: currentResult || selectedFrame ? `${selectedMetrics.componentCount}` : '--', tone: 'warning' },
        { label: '结果时间', value: selectedMetrics.resultTime },
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
      note: `当前系统中该指标的计算口径为：${definition.formula}。建议结合右侧的原图、热力图和彩色分割图一起看，判断图像和数字是否一致。`,
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
      description: '这张关键帧是当前视频或实时流任务中的采样结果，可用于比对杂草热力分布、彩色分割边界和面积统计。',
      tone: 'info',
      badge: '关键帧',
      imagePath: toAbsoluteAssetUrl(
        previewMode === 'mask'
          ? frame.mask_image_path
          : previewMode === 'segmentation'
            ? frame.overlay_segmentation_path || frame.segmentation_image_path
            : frame.heatmap_image_path,
      ),
      note: '点击关键帧后，主舞台会锁定这张图像，右侧详情也会保持对应统计，方便逐帧对照查看。',
      fields: [
        { label: '杂草占比', value: formatPercent(frame.weed_area_ratio || frame.weed_coverage_ratio), tone: 'danger' },
        { label: '连通域数量', value: `${frame.weed_component_count || frame.estimated_plant_count}`, tone: 'warning' },
        { label: '置信度', value: `${(frame.average_confidence * 100).toFixed(1)}%`, tone: 'info' },
        { label: '采样时间', value: `${frame.frame_timestamp_seconds.toFixed(1)} s` },
      ],
    };
  }

  function buildJobDetailTarget(job: AnalysisJob, mode: 'history' | 'trend' = 'history'): DetailTarget {
    const matchedSummaryImage = selectedJob?.job.id === job.id
      ? activePreviewItem?.imagePath || sourceImagePath
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
    subtitle: '环图 / 柱图 / 任务摘要',
    description: '这组图表直接绑定当前图片结果：环图看面积构成，柱图看像素面积、连通域数量和置信度，不再使用假趋势占位。',
    tone: 'info',
    badge: '结果解读',
    note: '如果图里大片红色杂草区域对应的环图和柱图也明显升高，说明图像和统计是一致的；反之就该继续校准模型后处理。',
    fields: [
      { label: '杂草占比', value: currentResult || selectedFrame ? formatPercent(selectedMetrics.weedAreaRatio) : '--', tone: 'danger' },
      { label: '烟株占比', value: currentResult || selectedFrame ? formatPercent(selectedMetrics.cropAreaRatio) : '--', tone: 'success' },
      { label: '背景占比', value: currentResult || selectedFrame ? formatPercent(selectedMetrics.backgroundAreaRatio) : '--', tone: 'muted' },
      { label: '任务进度', value: selectedJob ? `${Math.round(selectedJob.job.progress * 100)}%` : '--', tone: 'warning' },
      { label: '任务状态', value: selectedJob ? statusLabel(selectedJob.job.status) : '待启动' },
    ],
  }), [currentResult, selectedFrame, selectedJob, selectedMetrics]);

  const analysisDefaultDetailTarget = useMemo(buildDefaultDetailTarget, [activePreviewItem?.imagePath, currentResult, dashboard, isBackendOnline, selectedFrame, selectedJob, selectedMetrics, sourceImagePath]);
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

  const modelSummary = useMemo(() => ([
    { label: '当前后端', value: apiBaseUrl },
    { label: '模型后端', value: selectedJob?.job.model_backend ?? '等待任务接入' },
    { label: '模型状态', value: isBackendOnline ? '可用' : '离线' },
    { label: '估算口径', value: '连通域过滤后计数' },
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

  async function refreshHistory(keepCurrentSelection = true, preferredJobId?: number | null) {
    try {
      const response = await fetchJobList({
        sourceType: historySelection.selectedHistoryType,
        status: historySelection.selectedHistoryStatus,
      });
      setHistoryJobs(response.items);

      const nextJobId = preferredJobId ?? (
        keepCurrentSelection
          ? (selectedJob?.job.id ?? response.items[0]?.id)
          : selectedJob?.job.id
      );

      if (nextJobId) {
        const detail = await fetchJobDetail(nextJobId);
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
      setLockedDetailTarget(null);
      setHoveredDetailTarget(null);
      setSelectedFrameId(null);
      setPreviewMode('heatmap');
      setMessage('图片分析完成，已切换到分析工作台的双栏对比视图。');
      navigate(`/analysis?jobId=${response.job.id}`);
      await refreshHistory(false, response.job.id);
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
      setLockedDetailTarget(null);
      setHoveredDetailTarget(null);
      setSelectedFrameId(null);
      setPreviewMode('heatmap');
      setMessage('视频分析任务已创建，等待关键帧与热力结果更新。');
      navigate(`/analysis?jobId=${response.job.id}`);
      await refreshHistory(false, response.job.id);
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
      setLockedDetailTarget(null);
      setHoveredDetailTarget(null);
      setSelectedFrameId(null);
      setPreviewMode('heatmap');
      setMessage('实时流任务已启动，分析工作台会持续接收最新热力分割结果。');
      navigate(`/analysis?jobId=${response.job.id}`);
      await refreshHistory(false, response.job.id);
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
      setPreviewMode('heatmap');
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
              previewMode={previewMode}
              setPreviewMode={setPreviewMode}
              galleryItems={galleryItems}
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
              ratioChartData={ratioChartData}
              barChartData={barChartData}
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
