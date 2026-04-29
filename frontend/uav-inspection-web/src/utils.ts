import type { JobStatus, SourceType, Tone } from './types';

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatDateTime(value: string | null | undefined): string {
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

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--';
  }
  return value.toFixed(digits);
}

export function statusTone(status: JobStatus): Tone {
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

export function statusLabel(status: JobStatus): string {
  switch (status) {
    case 'completed':
      return '已完成';
    case 'running':
      return '运行中';
    case 'failed':
      return '失败';
    case 'stopped':
      return '已停止';
    default:
      return '等待中';
  }
}

export function sourceLabel(sourceType: SourceType): string {
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

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
