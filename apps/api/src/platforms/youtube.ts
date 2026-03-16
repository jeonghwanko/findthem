import { config } from '../config.js';
import { createLogger } from '../logger.js';
import { getAccessToken } from './googleAuth.js';

const log = createLogger('youtube');

// ── API response types ──

interface CommentThreadInsertResponse {
  id?: string;
  error?: { message?: string };
}

interface YouTubeSearchItem {
  id?: { videoId?: string };
  snippet?: { title?: string; channelId?: string };
}

interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
  error?: { message?: string };
}

export interface YouTubeVideoResult {
  videoId: string;
  title: string;
  channelId: string;
}

// ── YouTubeAdapter class ──

export class YouTubeAdapter {
  /** OAuth2 인증으로 유튜브 댓글 게시 */
  async postComment(videoId: string, text: string): Promise<string> {
    const accessToken = await getAccessToken();

    const res = await fetch(
      'https://www.googleapis.com/youtube/v3/commentThreads?part=snippet',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          snippet: {
            videoId,
            topLevelComment: {
              snippet: {
                textOriginal: text,
              },
            },
          },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    const data = (await res.json()) as CommentThreadInsertResponse;

    if (!res.ok || !data.id) {
      const errMsg = data.error?.message ?? `HTTP ${res.status}`;
      log.error({ videoId, error: errMsg }, 'YouTube comment post failed');
      throw new Error(`YouTube comment failed: ${errMsg}`);
    }

    log.info({ videoId, commentId: data.id }, 'YouTube comment posted');
    return data.id;
  }

  /**
   * API key로 영상 검색 (read-only, OAuth 불필요).
   * @param query   검색 키워드
   * @param maxResults 최대 결과 수 (기본 10, 최대 50)
   * @param channelId  특정 채널로 검색 범위를 제한할 때 사용 (선택)
   */
  async searchVideos(query: string, maxResults = 10, channelId?: string): Promise<YouTubeVideoResult[]> {
    if (!config.youtubeApiKey) {
      log.warn('YouTube API key not configured, skipping search');
      return [];
    }

    try {
      const params = new URLSearchParams({
        key: config.youtubeApiKey,
        q: query,
        type: 'video',
        part: 'snippet',
        maxResults: String(Math.min(maxResults, 50)),
        relevanceLanguage: 'ko',
        order: 'relevance',
      });

      if (channelId) {
        params.set('channelId', channelId);
      }

      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
        { signal: AbortSignal.timeout(10_000) },
      );

      const data = (await res.json()) as YouTubeSearchResponse;

      if (!res.ok) {
        log.warn({ query, channelId, error: data.error?.message }, 'YouTube search failed');
        return [];
      }

      return (data.items ?? [])
        .filter((item) => item.id?.videoId && item.snippet?.title)
        .map((item) => ({
          videoId: item.id!.videoId!,
          title: item.snippet!.title!,
          channelId: item.snippet?.channelId ?? '',
        }));
    } catch (err) {
      log.warn({ err, query, channelId }, 'YouTube search error');
      return [];
    }
  }
}
