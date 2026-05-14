import type { DashboardRealtimePayload } from '../types';
import { formatDateTime } from '../utils';

interface DashboardHeaderProps {
  dashboard: DashboardRealtimePayload | null;
  isBackendOnline: boolean;
  message: string;
}

export function DashboardHeader({ dashboard, isBackendOnline, message }: DashboardHeaderProps) {
  return (
    <header className="topbar">
      <div className="brand-block">
        <div className="brand-title-row">
          <span className={`status-dot ${isBackendOnline ? 'online' : 'offline'}`} />
          <div>
            <h1>大田无人机巡检监控系统</h1>
            <p>Web 图像分析工作台 · 烟株分割 · 热力图联动详情</p>
          </div>
        </div>
        <div className="status-banner">{message}</div>
      </div>

      <div className="topbar-center">
        <div className="clock">{dashboard ? formatDateTime(dashboard.system.server_time) : '--'}</div>
        <div className="clock-subtitle">
          {dashboard?.system.status ?? '等待系统状态'} · {isBackendOnline ? '后端在线' : '离线回退'}
        </div>
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
  );
}
