import { ADMIN_KEY_STORAGE_KEY, ADMIN_API_KEY_HEADER } from '@findthem/shared';

const BASE = '/api';

function getAdminKey(): string | null {
  return sessionStorage.getItem(ADMIN_KEY_STORAGE_KEY);
}

export function setAdminKey(key: string) {
  sessionStorage.setItem(ADMIN_KEY_STORAGE_KEY, key);
}

export function clearAdminKey() {
  sessionStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
}

async function adminRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = getAdminKey();
  if (!key) throw new Error('ADMIN_AUTH_REQUIRED');

  const headers: Record<string, string> = { [ADMIN_API_KEY_HEADER]: key };
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const b = await res.json().catch(() => null);
    throw new Error(b?.error || 'REQUEST_FAILED');
  }

  return res.json();
}

export const adminApi = {
  get: <T>(path: string) => adminRequest<T>('GET', path),
  post: <T>(path: string, body?: unknown) => adminRequest<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => adminRequest<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => adminRequest<T>('PATCH', path, body),
};

// --- 데브로그 ---

export interface DevlogPreviewRequest {
  context: string;
  commitCount?: number;
  publishStatus?: 'draft' | 'published';
  tags?: string[];
}

export interface CommitSummary {
  sha: string;
  message: string;
  date: string;
}

export interface DevlogPreviewResponse {
  title: string;
  markdown: string;
  html: string;
  excerpt: string;
  commitsSummary: CommitSummary[];
  diffStats: string;
}

export interface DevlogGenerateResponse extends DevlogPreviewResponse {
  ghostUrl: string;
  ghostPostId: string;
}

export const devlogApi = {
  preview: (body: DevlogPreviewRequest) =>
    adminApi.post<DevlogPreviewResponse>('/admin/devlog/preview', body),
  generate: (body: DevlogPreviewRequest) =>
    adminApi.post<DevlogGenerateResponse>('/admin/devlog/generate', body),
};
