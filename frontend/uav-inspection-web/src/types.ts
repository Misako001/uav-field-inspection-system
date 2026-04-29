export type SourceType = 'image' | 'video' | 'stream';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped';
export type PreviewMode = 'source' | 'heatmap' | 'mask';
export type Tone = 'success' | 'info' | 'warning' | 'danger' | 'muted' | 'neutral';
export type DetailTargetType = 'summary' | 'metric' | 'frame' | 'job' | 'trend';
export type AppRoute = 'home' | 'analysis' | 'history';

export interface SystemStatus {
  system_name: string;
  status: string;
  running: boolean;
  server_time: string;
  health: string;
}

export interface VideoStatus {
  rtmp_status: string;
  hls_status: string;
  fps: number;
  latency_ms: number;
  resolution: string;
}

export interface DetectionStatistics {
  total_count: number;
  current_minute_count: number;
  risk_index: number;
  recorded_at: string;
}

export interface AlertEvent {
  id: number;
  occurred_at: string;
  alert_type: string;
  content: string;
  confidence: number;
  status: string;
}

export interface AnalysisSummary {
  job_id: number;
  source_type: SourceType;
  status: JobStatus;
  progress?: number;
  coverage_ratio?: number;
  estimated_plant_count?: number;
  result_time?: string;
  heatmap_image_path?: string;
}

export interface DashboardRealtimePayload {
  event: string;
  emitted_at: string;
  system: SystemStatus;
  video: VideoStatus;
  detection: DetectionStatistics;
  alerts: AlertEvent[];
  latest_analysis?: AnalysisSummary | null;
}

export interface AnalysisJob {
  id: number;
  source_type: SourceType;
  source_name: string;
  source_uri: string;
  source_media_path: string;
  status: JobStatus;
  progress: number;
  model_backend: string;
  frame_count: number;
  average_coverage_ratio: number;
  estimated_plant_count: number;
  average_confidence: number;
  latest_result_id: number | null;
  error_message: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface AnalysisResult {
  id: number;
  job_id: number;
  source_image_path: string;
  heatmap_image_path: string;
  mask_image_path: string;
  thumbnail_path: string;
  weed_coverage_ratio: number;
  weed_pixel_area: number;
  estimated_plant_count: number;
  average_confidence: number;
  processing_time_ms: number;
  result_time: string;
  summary_note: string;
}

export interface AnalysisFrame {
  id: number;
  job_id: number;
  frame_index: number;
  frame_timestamp_seconds: number;
  source_frame_path: string;
  heatmap_image_path: string;
  mask_image_path: string;
  weed_coverage_ratio: number;
  weed_pixel_area: number;
  estimated_plant_count: number;
  average_confidence: number;
  created_at: string;
}

export interface AnalysisJobDetail {
  job: AnalysisJob;
  latest_result: AnalysisResult | null;
  frames: AnalysisFrame[];
}

export interface AnalysisJobList {
  items: AnalysisJob[];
  total: number;
  page: number;
  page_size: number;
}

export interface AnalysisImageResponse {
  job: AnalysisJob;
  result: AnalysisResult;
}

export interface AnalysisRealtimePayload {
  event: string;
  emitted_at: string;
  job: AnalysisJob;
  latest_result: AnalysisResult | null;
  latest_frame: AnalysisFrame | null;
}

export interface DetailField {
  label: string;
  value: string;
  tone?: Tone;
}

export interface DetailTarget {
  id: string;
  type: DetailTargetType;
  title: string;
  subtitle: string;
  description: string;
  tone: Tone;
  badge?: string;
  note?: string;
  imagePath?: string;
  fields: DetailField[];
}

export interface MetricDefinition {
  key: string;
  label: string;
  shortLabel: string;
  description: string;
  formula: string;
  tone: Tone;
}

export interface MetricCardData {
  key: string;
  label: string;
  value: string;
  tone: Tone;
  hint: string;
  footnote: string;
  meter: number;
  trend: number[];
}

export interface FramePreviewState {
  id: number;
  title: string;
  timestampLabel: string;
  coverageLabel: string;
  plantLabel: string;
  confidenceLabel: string;
  previewImagePath: string;
  active: boolean;
}

export interface HomeOverviewCard {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  value: string;
  tone: Tone;
  route?: AppRoute;
}

export interface HistorySelectionState {
  selectedHistoryType: string;
  selectedHistoryStatus: string;
}

export interface AnalysisPageQueryState {
  jobId: number | null;
}
