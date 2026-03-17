import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { createLogger } from '../logger.js';

const log = createLogger('ghostService');

export interface GhostPostInput {
  title: string;
  html: string;
  custom_excerpt: string;
  tags: Array<{ name: string }>;
  status: 'draft' | 'published';
}

export interface GhostPostResult {
  id: string;
  url: string;
  title: string;
  status: string;
}

export interface GhostSettingInput {
  key: string;
  value: string | number | boolean | null;
}

function buildGhostJwt(): string {
  const apiKey = config.ghostAdminApiKey;
  if (!apiKey) {
    throw new Error('GHOST_ADMIN_API_KEY가 설정되지 않았습니다.');
  }

  const colonIdx = apiKey.indexOf(':');
  if (colonIdx === -1) {
    throw new Error('GHOST_ADMIN_API_KEY 형식이 올바르지 않습니다. {id}:{secret} 형식이어야 합니다.');
  }

  const id = apiKey.slice(0, colonIdx);
  const secret = apiKey.slice(colonIdx + 1);

  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      iat: now,
      exp: now + 300,
      aud: '/admin/',
    },
    Buffer.from(secret, 'hex'),
    {
      algorithm: 'HS256',
      keyid: id,
      header: {
        alg: 'HS256',
        kid: id,
        typ: 'JWT',
      },
    },
  );
}

export async function createGhostPost(post: GhostPostInput): Promise<GhostPostResult> {
  const token = buildGhostJwt();
  const url = `${config.ghostApiUrl}/ghost/api/admin/posts/?source=html`;

  log.info({ title: post.title, status: post.status }, 'Ghost 포스트 생성 요청');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Ghost ${token}`,
    },
    body: JSON.stringify({
      posts: [
        {
          title: post.title,
          html: post.html,
          custom_excerpt: post.custom_excerpt,
          tags: post.tags,
          status: post.status,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    log.error({ status: response.status, body: errorBody }, 'Ghost API 오류');
    throw new Error(`Ghost API 오류: ${response.status}`);
  }

  const data = (await response.json()) as { posts: GhostPostResult[] };
  const created = data.posts[0];

  if (!created) {
    throw new Error('Ghost API 응답에서 포스트를 찾을 수 없습니다.');
  }

  log.info({ id: created.id, url: created.url }, 'Ghost 포스트 생성 완료');
  return created;
}

export interface GhostPostListItem {
  id: string;
  title: string;
  url: string;
  status: string;
  published_at: string | null;
  updated_at: string;
  excerpt: string | null;
}

export interface GhostPostListResult {
  posts: GhostPostListItem[];
  meta: {
    pagination: {
      page: number;
      limit: number;
      pages: number;
      total: number;
    };
  };
}

export async function listGhostPosts(page = 1, limit = 15): Promise<GhostPostListResult> {
  const token = buildGhostJwt();
  const url = `${config.ghostApiUrl}/ghost/api/admin/posts/?limit=${limit}&page=${page}&fields=id,title,url,status,published_at,updated_at,excerpt&order=updated_at+desc`;

  const response = await fetch(url, {
    headers: { Authorization: `Ghost ${token}` },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    log.error({ status: response.status, body: errorBody }, 'Ghost 포스트 목록 조회 오류');
    throw new Error(`Ghost API 오류: ${response.status}`);
  }

  return (await response.json()) as GhostPostListResult;
}

export async function deleteGhostPost(postId: string): Promise<void> {
  const token = buildGhostJwt();
  const url = `${config.ghostApiUrl}/ghost/api/admin/posts/${postId}/`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Ghost ${token}` },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    log.error({ status: response.status, postId, body: errorBody }, 'Ghost 포스트 삭제 오류');
    throw new Error(`Ghost API 오류: ${response.status}`);
  }

  log.info({ postId }, 'Ghost 포스트 삭제 완료');
}

export async function updateGhostSettings(settings: GhostSettingInput[]): Promise<void> {
  const token = buildGhostJwt();
  const url = `${config.ghostApiUrl}/ghost/api/admin/settings/`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Ghost ${token}`,
    },
    body: JSON.stringify({ settings }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    log.error({ status: response.status, body: errorBody }, 'Ghost 설정 업데이트 오류');
    throw new Error(`Ghost API 오류: ${response.status}`);
  }

  log.info({ keys: settings.map((s) => s.key) }, 'Ghost 설정 업데이트 완료');
}
