import type { Report } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function request<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { signal: controller.signal });
    if (!response.ok) {
      const message = await response.json().catch(() => null);
      throw new Error(message?.detail || `请求失败：${response.status}`);
    }
    return response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('后端服务暂不可用或响应超时');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function fetchLatestReport(): Promise<Report> {
  return request<Report>('/api/reports/latest');
}

export function fetchReports(): Promise<Report[]> {
  return request<Report[]>('/api/reports?limit=90');
}

export function fetchReport(date: string): Promise<Report> {
  return request<Report>(`/api/reports/${date}`);
}
