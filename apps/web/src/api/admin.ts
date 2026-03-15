const BASE = '/api';

function getAdminKey(): string | null {
  return sessionStorage.getItem('ft_admin_key');
}

export function setAdminKey(key: string) {
  sessionStorage.setItem('ft_admin_key', key);
}

export function clearAdminKey() {
  sessionStorage.removeItem('ft_admin_key');
}

async function adminRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = getAdminKey();
  if (!key) throw new Error('관리자 인증이 필요합니다.');

  const headers: Record<string, string> = { 'x-api-key': key };
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const b = await res.json().catch(() => null);
    throw new Error(b?.error || '요청 실패');
  }

  return res.json();
}

export const adminApi = {
  get: <T>(path: string) => adminRequest<T>('GET', path),
  post: <T>(path: string, body?: unknown) => adminRequest<T>('POST', path, body),
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
