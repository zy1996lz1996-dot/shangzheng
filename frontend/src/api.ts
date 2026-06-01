import type { Report } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function staticUrl(path: string): string {
  return new URL(path, window.location.href).toString();
}

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

async function requestStatic<T>(path: string): Promise<T> {
  const response = await fetch(staticUrl(path));
  if (!response.ok) {
    throw new Error(`静态报告加载失败：${response.status}`);
  }
  return response.json();
}

export async function fetchLatestReport(): Promise<Report> {
  try {
    return await request<Report>('/api/reports/latest');
  } catch {
    return requestStatic<Report>('reports/latest.json');
  }
}

export async function fetchReports(): Promise<Report[]> {
  try {
    return await request<Report[]>('/api/reports?limit=90');
  } catch {
    return requestStatic<Report[]>('reports/index.json');
  }
}

export async function fetchReport(date: string): Promise<Report> {
  try {
    return await request<Report>(`/api/reports/${date}`);
  } catch {
    return requestStatic<Report>(`reports/${date}.json`);
  }
}
