import axios from 'axios';

import type {
  AnalysisDeleteResponse,
  AnalysisImageResponse,
  AnalysisJobDetail,
  AnalysisJobList,
  DashboardRealtimePayload,
} from './types';

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function readConfiguredUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimTrailingSlash(trimmed) : undefined;
}

function getBrowserHttpOrigin(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return trimTrailingSlash(window.location.origin);
}

function deriveWebSocketBaseUrl(apiBaseUrl: string): string {
  if (apiBaseUrl.startsWith('https://')) {
    return `wss://${apiBaseUrl.slice('https://'.length)}`;
  }
  if (apiBaseUrl.startsWith('http://')) {
    return `ws://${apiBaseUrl.slice('http://'.length)}`;
  }
  return apiBaseUrl;
}

const configuredApiBaseUrl = readConfiguredUrl(import.meta.env.VITE_API_BASE_URL as string | undefined);
const browserApiBaseUrl = getBrowserHttpOrigin();
const API_BASE_URL = configuredApiBaseUrl ?? browserApiBaseUrl ?? 'http://127.0.0.1:8001';

const configuredWsBaseUrl = readConfiguredUrl(import.meta.env.VITE_WS_BASE_URL as string | undefined);
const WS_BASE_URL = configuredWsBaseUrl ?? deriveWebSocketBaseUrl(API_BASE_URL);

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 180_000,
});

export const apiBaseUrl = API_BASE_URL;
export const wsBaseUrl = WS_BASE_URL;

export function toAbsoluteAssetUrl(path: string | null | undefined): string {
  if (!path) {
    return '';
  }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `${API_BASE_URL}${path}`;
}

export async function uploadImage(file: File): Promise<AnalysisImageResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post<AnalysisImageResponse>('/api/analysis/images', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function uploadVideo(file: File): Promise<AnalysisJobDetail> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post<AnalysisJobDetail>('/api/analysis/videos', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function createStreamJob(sourceUrl: string): Promise<AnalysisJobDetail> {
  const { data } = await apiClient.post<AnalysisJobDetail>('/api/analysis/streams', {
    source_url: sourceUrl,
  });
  return data;
}

export async function fetchJobDetail(jobId: number): Promise<AnalysisJobDetail> {
  const { data } = await apiClient.get<AnalysisJobDetail>(`/api/analysis/jobs/${jobId}`);
  return data;
}

export async function fetchJobList(filters: { sourceType?: string; status?: string } = {}): Promise<AnalysisJobList> {
  const { data } = await apiClient.get<AnalysisJobList>('/api/analysis/jobs', {
    params: {
      page: 1,
      page_size: 24,
      source_type: filters.sourceType || undefined,
      status: filters.status || undefined,
    },
  });
  return data;
}

export async function stopJob(jobId: number): Promise<void> {
  await apiClient.post(`/api/analysis/jobs/${jobId}/stop`);
}

export async function deleteJobHistory(jobId: number): Promise<AnalysisDeleteResponse> {
  const { data } = await apiClient.delete<AnalysisDeleteResponse>(`/api/analysis/jobs/${jobId}`);
  return data;
}

export function openDashboardRealtimeSocket(onMessage: (payload: DashboardRealtimePayload) => void): WebSocket {
  const socket = new WebSocket(`${WS_BASE_URL}/ws/realtime`);
  socket.onmessage = (event) => onMessage(JSON.parse(event.data) as DashboardRealtimePayload);
  return socket;
}

export function openAnalysisRealtimeSocket(jobId: number, onMessage: (payload: AnalysisJobDetail) => void): WebSocket {
  const socket = new WebSocket(`${WS_BASE_URL}/ws/analysis/${jobId}`);
  socket.onmessage = (event) => {
    const payload = JSON.parse(event.data) as {
      job: AnalysisJobDetail['job'];
      latest_result: AnalysisJobDetail['latest_result'];
      latest_frame: AnalysisJobDetail['frames'][number] | null;
    };
    onMessage({
      job: payload.job,
      latest_result: payload.latest_result,
      frames: payload.latest_frame ? [payload.latest_frame] : [],
    });
  };
  socket.onopen = () => socket.send('listen');
  return socket;
}
