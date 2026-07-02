import type { AnalysisResult, AplDetail, AplListItem } from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body as T;
}

function post<T>(url: string, payload: unknown): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export const api = {
  listApls: () => request<AplListItem[]>('/api/apls'),
  getApl: (id: number) => request<AplDetail>(`/api/apls/${id}`),
  createApl: (text: string, title?: string) =>
    post<{ id: number }>('/api/apls', { text, title: title || undefined }),
  analyze: (aplId: number) => post<AnalysisResult>('/api/analyze', { aplId }),
};
