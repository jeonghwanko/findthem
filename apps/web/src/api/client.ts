import { TOKEN_STORAGE_KEY } from '@findthem/shared';

// Re-export shared types for convenience
export type {
  UserPublic as User,
  Photo,
  ReportSummary as Report,
  ReportDetail,
  ReportListResponse,
  SightingListResponse,
  Sighting,
  Match,
  SubjectType,
  ReportStatus,
  MatchStatus,
  BotResponse,
  SponsorPublic,
  AgentId,
  XpStats,
  XpGrantResult,
  XpLogEntry,
} from '@findthem/shared';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;

  // FormData는 Content-Type 자동 설정
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'REQUEST_FAILED');
  }

  return res.json();
}

export const api = {
  get: <T>(path: string, options?: RequestInit) => request<T>(path, options),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'DELETE',
      ...(body != null ? { body: JSON.stringify(body) } : {}),
    }),
};
