import type { ChangeEvent } from 'react';
import { Link } from 'react-router-dom';

import { AnalysisInputPanel } from '../components/AnalysisInputPanel';
import { DetailInspector } from '../components/DetailInspector';
import { MetricsPanel } from '../components/MetricsPanel';
import { ResultStage } from '../components/ResultStage';
import type {
  AnalysisJobDetail,
  DetailTarget,
  FramePreviewState,
  MetricCardData,
  PreviewMode,
  ResultGalleryItem,
  SourceType,
} from '../types';

type InputTab = 'image' | 'video' | 'stream';

interface AnalysisPageProps {
  activeTab: InputTab;
  setActiveTab: (tab: InputTab) => void;
  selectedJob: AnalysisJobDetail | null;
  imageFileName: string;
  videoFileName: string;
  streamUrl: string;
  setStreamUrl: (value: string) => void;
  onImageUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onVideoUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onDroppedFile: (file: File, tab: 'image' | 'video') => Promise<void>;
  onCreateStream: () => void;
  onRefreshHistory: () => void;
  onStopCurrentJob: () => void;
  sourceType: SourceType | null;
  sourceName: string;
  sourceLabelText: string;
  previewMode: PreviewMode;
  setPreviewMode: (mode: PreviewMode) => void;
  galleryItems: ResultGalleryItem[];
  showOverlay: boolean;
  overlayOpacity: number;
  fitMode: 'contain' | 'cover';
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleOverlay: () => void;
  onToggleFitMode: () => void;
  onResetView: () => void;
  onOverlayOpacityChange: (value: number) => void;
  thumbnails: FramePreviewState[];
  onFrameHover: (frameId: number | null) => void;
  onFrameClick: (frameId: number) => void;
  onStageDetailHover: (target: DetailTarget | null) => void;
  stageDetailTarget: DetailTarget;
  activeDetailTarget: DetailTarget;
  isDetailLocked: boolean;
  onUnlockDetail: () => void;
  metricCards: MetricCardData[];
  ratioChartData: Array<{ name: string; value: number; tone: 'success' | 'info' | 'warning' | 'danger' | 'muted' | 'neutral' }>;
  barChartData: Array<{ name: string; value: number; tone: 'success' | 'info' | 'warning' | 'danger' | 'muted' | 'neutral' }>;
  modelSummary: Array<{ label: string; value: string }>;
  systemSummary: Array<{ label: string; value: string }>;
  onMetricHover: (key: string | null) => void;
  onMetricClick: (key: string) => void;
  onCompositionHover: (target: DetailTarget | null) => void;
  compositionDetail: DetailTarget;
}

export function AnalysisPage(props: AnalysisPageProps) {
  return (
    <div className="page-body">
      <main className="workspace-grid analysis-page-grid">
        <AnalysisInputPanel
          activeTab={props.activeTab}
          setActiveTab={props.setActiveTab}
          selectedJob={props.selectedJob}
          imageFileName={props.imageFileName}
          videoFileName={props.videoFileName}
          streamUrl={props.streamUrl}
          setStreamUrl={props.setStreamUrl}
          onImageUpload={props.onImageUpload}
          onVideoUpload={props.onVideoUpload}
          onDroppedFile={props.onDroppedFile}
          onCreateStream={props.onCreateStream}
          onRefreshHistory={props.onRefreshHistory}
          onStopCurrentJob={props.onStopCurrentJob}
        />

        <div className="inspector-column">
          <DetailInspector
            detailTarget={props.activeDetailTarget}
            isLocked={props.isDetailLocked}
            onUnlock={props.onUnlockDetail}
          />
          <MetricsPanel
            metricCards={props.metricCards}
            ratioChartData={props.ratioChartData}
            barChartData={props.barChartData}
            modelSummary={props.modelSummary}
            systemSummary={props.systemSummary}
            onMetricHover={props.onMetricHover}
            onMetricClick={props.onMetricClick}
            onCompositionHover={props.onCompositionHover}
            compositionDetail={props.compositionDetail}
          />
        </div>

        <section className="analysis-main-column">
          <ResultStage
            sourceType={props.sourceType}
            sourceName={props.sourceName}
            sourceLabelText={props.sourceLabelText}
            previewMode={props.previewMode}
            setPreviewMode={props.setPreviewMode}
            galleryItems={props.galleryItems}
            showOverlay={props.showOverlay}
            overlayOpacity={props.overlayOpacity}
            fitMode={props.fitMode}
            zoomLevel={props.zoomLevel}
            onZoomIn={props.onZoomIn}
            onZoomOut={props.onZoomOut}
            onToggleOverlay={props.onToggleOverlay}
            onToggleFitMode={props.onToggleFitMode}
            onResetView={props.onResetView}
            onOverlayOpacityChange={props.onOverlayOpacityChange}
            thumbnails={props.thumbnails}
            onFrameHover={props.onFrameHover}
            onFrameClick={props.onFrameClick}
            onStageDetailHover={props.onStageDetailHover}
            stageDetailTarget={props.stageDetailTarget}
          />

          <div className="analysis-footer-link">
            <Link to="/history" className="secondary-button history-link-button">
              查看更多历史结果与趋势分析
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
