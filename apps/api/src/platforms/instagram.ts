import { config } from '../config.js';
import type { PlatformAdapter, PlatformPostResult } from './types.js';
import type { PromotionMetrics } from '@findthem/shared';
import { createLogger } from '../logger.js';

const log = createLogger('instagram');

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

// Instagram Graph API rate limit 에러 코드
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

/** Authorization 헤더를 포함한 공통 GET fetch */
async function graphGet(
  url: string,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(url, {
    headers: { Authorization: `OAuth ${config.instagramAccessToken}` },
    ...(signal ? { signal } : {}),
  });
}

/** Authorization 헤더를 포함한 공통 POST fetch (application/x-www-form-urlencoded) */
async function graphPost(url: string, params: URLSearchParams): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `OAuth ${config.instagramAccessToken}`,
    },
    body: params,
  });
}

/** Graph API 에러 응답에서 에러 코드를 파싱하여 rate limit 여부를 확인 */
async function checkRateLimit(res: Response, context: string): Promise<boolean> {
  if (res.ok) return false;

  let errCode: number | undefined;
  try {
    const body = (await res.clone().json()) as { error?: { code?: number; message?: string } };
    errCode = body.error?.code;
    if (errCode !== undefined && RATE_LIMIT_CODES.has(errCode)) {
      log.warn(
        { context, status: res.status, errCode, message: body.error?.message },
        'Instagram rate limit exceeded',
      );
      return true;
    }
  } catch {
    // JSON 파싱 실패 시 rate limit이 아닌 것으로 처리
  }
  return false;
}

export class InstagramAdapter implements PlatformAdapter {
  readonly name = 'instagram';

  async post(text: string, imagePaths: string[]): Promise<PlatformPostResult> {
    if (!config.instagramAccessToken || !config.instagramUserId) {
      log.warn('Instagram credentials not configured, skipping');
      return { postId: null, postUrl: null };
    }

    const primaryPath = imagePaths[0];
    if (!primaryPath) {
      log.warn('No image path for Instagram post, skipping');
      return { postId: null, postUrl: null };
    }

    // [C3] 이미지 URL 구성 — path traversal 방지
    let imageUrl: string;
    if (primaryPath.startsWith('http://') || primaryPath.startsWith('https://')) {
      // 외부 URL은 그대로 사용
      imageUrl = primaryPath;
      log.info({ primaryPath }, 'Instagram post: using external image URL');
    } else if (primaryPath.startsWith('/uploads/')) {
      // 로컬 업로드 파일만 siteUrl로 변환
      imageUrl = `${config.siteUrl}${primaryPath}`;
    } else {
      // 그 외 경로 거부 (path traversal 방지)
      log.warn({ primaryPath }, 'Instagram post: rejected non-uploads local path');
      return { postId: null, postUrl: null };
    }

    try {
      // 1단계: Container 생성
      const containerId = await this.createContainer(imageUrl, text);
      if (!containerId) return { postId: null, postUrl: null };

      // 2단계: 게시 (Publish)
      const mediaId = await this.publishContainer(containerId);
      if (!mediaId) return { postId: null, postUrl: null };

      // [S12] shortcode 조회로 postUrl 구성
      const postUrl = await this.fetchPostUrl(mediaId);

      log.info({ mediaId, postUrl }, 'Instagram post published');
      return { postId: mediaId, postUrl };
    } catch (err) {
      log.error({ err }, 'Instagram post error');
      return { postId: null, postUrl: null };
    }
  }

  async deletePost(postId: string): Promise<void> {
    if (!config.instagramAccessToken) {
      log.warn('Instagram credentials not configured, skipping deletePost');
      return;
    }

    try {
      // [C2] access_token을 쿼리 파라미터 대신 Authorization 헤더로 전달
      const url = `${GRAPH_API_BASE}/${postId}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `OAuth ${config.instagramAccessToken}` },
      });

      if (!res.ok) {
        const isRateLimit = await checkRateLimit(res, 'deletePost');
        if (!isRateLimit) {
          const errText = await res.text();
          log.warn({ postId, status: res.status, err: errText }, 'Instagram deletePost failed');
        }
      }
    } catch (err) {
      log.warn({ err, postId }, 'Instagram deletePost error');
    }
  }

  async getMetrics(postId: string): Promise<PromotionMetrics | null> {
    if (!config.instagramAccessToken) {
      log.warn('Instagram credentials not configured, skipping getMetrics');
      return null;
    }

    try {
      // [S14] likes_count는 Insights API에서 제거됨.
      // like_count / comments_count는 Media 필드로, impressions / reach는 Insights API로 분리 조회.
      const [mediaMetrics, insightsMetrics] = await Promise.all([
        this.fetchMediaFields(postId),
        this.fetchInsights(postId),
      ]);

      return {
        views: insightsMetrics.impressions,
        likes: mediaMetrics.like_count,
        retweets: 0,
        shares: insightsMetrics.reach, // Instagram은 shares 대신 reach 사용
        replies: mediaMetrics.comments_count,
      };
    } catch (err) {
      log.warn({ err, postId }, 'Instagram metrics error');
      return null;
    }
  }

  /** Media 필드 직접 조회 (like_count, comments_count) */
  private async fetchMediaFields(postId: string): Promise<{ like_count: number; comments_count: number }> {
    // [C2] Authorization 헤더 방식
    const url = `${GRAPH_API_BASE}/${postId}?fields=like_count,comments_count`;
    const res = await graphGet(url, AbortSignal.timeout(10_000));

    if (!res.ok) {
      await checkRateLimit(res, 'fetchMediaFields');
      log.warn({ postId, status: res.status }, 'Instagram media fields fetch failed');
      return { like_count: 0, comments_count: 0 };
    }

    const body = (await res.json()) as { like_count?: number; comments_count?: number };
    return {
      like_count: body.like_count ?? 0,
      comments_count: body.comments_count ?? 0,
    };
  }

  /** Insights API 조회 (impressions, reach) */
  private async fetchInsights(postId: string): Promise<{ impressions: number; reach: number }> {
    // [C2] Authorization 헤더 방식
    const url = `${GRAPH_API_BASE}/${postId}/insights?metric=impressions,reach`;
    const res = await graphGet(url, AbortSignal.timeout(10_000));

    if (!res.ok) {
      await checkRateLimit(res, 'fetchInsights');
      log.warn({ postId, status: res.status }, 'Instagram insights fetch failed');
      return { impressions: 0, reach: 0 };
    }

    const body = (await res.json()) as {
      data?: { name: string; values: { value: number }[] }[];
    };

    const getValue = (name: string): number => {
      const metric = body.data?.find((d) => d.name === name);
      return metric?.values?.[0]?.value ?? 0;
    };

    return {
      impressions: getValue('impressions'),
      reach: getValue('reach'),
    };
  }

  /** [S12] 게시 후 shortcode를 조회하여 postUrl을 구성 */
  private async fetchPostUrl(mediaId: string): Promise<string> {
    try {
      const url = `${GRAPH_API_BASE}/${mediaId}?fields=shortcode`;
      const res = await graphGet(url, AbortSignal.timeout(5_000));

      if (res.ok) {
        const data = (await res.json()) as { shortcode?: string };
        if (data.shortcode) {
          return `https://www.instagram.com/p/${data.shortcode}/`;
        }
      }
    } catch (err) {
      log.warn({ err, mediaId }, 'Instagram shortcode fetch failed, using mediaId fallback');
    }

    // shortcode 조회 실패 시 mediaId로 fallback
    return `https://www.instagram.com/p/${mediaId}/`;
  }

  private async createContainer(imageUrl: string, caption: string): Promise<string | null> {
    const url = `${GRAPH_API_BASE}/${config.instagramUserId}/media`;
    // [C2] access_token을 body 파라미터 대신 Authorization 헤더로 전달
    const params = new URLSearchParams({
      image_url: imageUrl,
      caption,
    });

    const res = await graphPost(url, params);

    if (!res.ok) {
      const isRateLimit = await checkRateLimit(res, 'createContainer');
      if (!isRateLimit) {
        const errText = await res.text();
        log.error({ status: res.status, err: errText }, 'Instagram container creation failed');
      }
      return null;
    }

    const data = (await res.json()) as { id?: string };
    return data.id ?? null;
  }

  private async publishContainer(containerId: string): Promise<string | null> {
    const url = `${GRAPH_API_BASE}/${config.instagramUserId}/media_publish`;
    // [C2] access_token을 body 파라미터 대신 Authorization 헤더로 전달
    const params = new URLSearchParams({
      creation_id: containerId,
    });

    const res = await graphPost(url, params);

    if (!res.ok) {
      const isRateLimit = await checkRateLimit(res, 'publishContainer');
      if (!isRateLimit) {
        const errText = await res.text();
        log.error({ status: res.status, err: errText }, 'Instagram publish failed');
      }
      return null;
    }

    const data = (await res.json()) as { id?: string };
    return data.id ?? null;
  }
}
