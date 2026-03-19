import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InstagramAdapter } from './instagram.js';

// config mock — instagramAccessToken / instagramUserId 가 설정된 기본값으로 시작
vi.mock('../config.js', () => ({
  config: {
    instagramAccessToken: 'test-token',
    instagramUserId: 'test-user-id',
    siteUrl: 'https://union.pryzm.gg',
  },
}));

// pino logger mock (console 출력 억제)
vi.mock('../logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// global fetch mock
const fetchMock = vi.fn();
globalThis.fetch = fetchMock;

describe('InstagramAdapter', () => {
  let adapter: InstagramAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new InstagramAdapter();
  });

  // ── post() ────────────────────────────────────────────────────────────────

  describe('post()', () => {
    it('API 키 미설정 시 { postId: null, postUrl: null } 반환', async () => {
      // config 전체를 재mock하여 인증 정보 제거
      const { config } = await import('../config.js');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (config as any).instagramAccessToken = '';

      const result = await adapter.post('테스트 캡션', ['/uploads/reports/photo.jpg']);

      expect(result).toEqual({ postId: null, postUrl: null });
      expect(fetchMock).not.toHaveBeenCalled();

      // 이후 테스트를 위해 복원
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (config as any).instagramAccessToken = 'test-token';
    });

    it('imagePaths 비어있으면 { postId: null, postUrl: null } 반환', async () => {
      const result = await adapter.post('테스트 캡션', []);

      expect(result).toEqual({ postId: null, postUrl: null });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('/uploads/ 경로 → siteUrl과 결합하여 이미지 URL 구성', async () => {
      // createContainer → 성공
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'container-123' }),
          clone: () => ({ json: async () => ({}) }),
          text: async () => '',
        })
        // publishContainer → 성공
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'media-456' }),
          clone: () => ({ json: async () => ({}) }),
          text: async () => '',
        })
        // fetchPostUrl (shortcode)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ shortcode: 'Abc123' }),
        });

      const result = await adapter.post('캡션', ['/uploads/reports/photo.jpg']);

      // 첫 번째 fetch 호출 (createContainer)의 body에 siteUrl + path가 포함되어야 함
      const firstCall = fetchMock.mock.calls[0];
      const requestBody = firstCall[1].body as URLSearchParams;
      expect(requestBody.get('image_url')).toBe('https://union.pryzm.gg/uploads/reports/photo.jpg');

      expect(result.postId).toBe('media-456');
      expect(result.postUrl).toBe('https://www.instagram.com/p/Abc123/');
    });

    it('http(s)로 시작하는 외부 URL → 그대로 사용', async () => {
      const externalUrl = 'https://cdn.example.com/image.jpg';

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'container-789' }),
          clone: () => ({ json: async () => ({}) }),
          text: async () => '',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'media-999' }),
          clone: () => ({ json: async () => ({}) }),
          text: async () => '',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ shortcode: 'XyZ789' }),
        });

      const result = await adapter.post('외부 이미지 캡션', [externalUrl]);

      const firstCall = fetchMock.mock.calls[0];
      const requestBody = firstCall[1].body as URLSearchParams;
      expect(requestBody.get('image_url')).toBe(externalUrl);
      expect(result.postId).toBe('media-999');
    });

    it('/uploads/ 이외 로컬 경로 → { postId: null, postUrl: null } 반환 (path traversal 방지)', async () => {
      const result = await adapter.post('캡션', ['../../etc/passwd']);

      expect(result).toEqual({ postId: null, postUrl: null });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('상대 경로 (./로 시작) → { postId: null, postUrl: null } 반환', async () => {
      const result = await adapter.post('캡션', ['./uploads/reports/photo.jpg']);

      expect(result).toEqual({ postId: null, postUrl: null });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('성공 시 postId + shortcode 기반 postUrl 반환', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'container-001' }),
          clone: () => ({ json: async () => ({}) }),
          text: async () => '',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'media-001' }),
          clone: () => ({ json: async () => ({}) }),
          text: async () => '',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ shortcode: 'TestShortcode' }),
        });

      const result = await adapter.post('실종 신고 홍보 글', ['/uploads/reports/photo.jpg']);

      expect(result.postId).toBe('media-001');
      expect(result.postUrl).toBe('https://www.instagram.com/p/TestShortcode/');
    });

    it('shortcode 조회 실패 시 mediaId 기반 fallback URL 반환', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'container-002' }),
          clone: () => ({ json: async () => ({}) }),
          text: async () => '',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'media-002' }),
          clone: () => ({ json: async () => ({}) }),
          text: async () => '',
        })
        // fetchPostUrl 실패
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          json: async () => ({ error: { code: 100 } }),
          clone: () => ({ json: async () => ({ error: { code: 100 } }) }),
          text: async () => 'Not Found',
        });

      const result = await adapter.post('캡션', ['/uploads/reports/photo.jpg']);

      expect(result.postId).toBe('media-002');
      expect(result.postUrl).toBe('https://www.instagram.com/p/media-002/');
    });

    it('createContainer API 오류 → { postId: null, postUrl: null } 반환', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        clone: () => ({ json: async () => ({ error: { code: 100, message: 'Invalid param' } }) }),
        text: async () => 'Bad Request',
      });

      const result = await adapter.post('캡션', ['/uploads/reports/photo.jpg']);

      expect(result).toEqual({ postId: null, postUrl: null });
    });
  });

  // ── deletePost() ──────────────────────────────────────────────────────────

  describe('deletePost()', () => {
    it('Authorization 헤더에 OAuth 토큰 사용', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        clone: () => ({ json: async () => ({}) }),
        text: async () => '',
      });

      await adapter.deletePost('media-to-delete');

      expect(fetchMock).toHaveBeenCalledOnce();
      const callArgs = fetchMock.mock.calls[0];
      expect(callArgs[0]).toContain('media-to-delete');
      expect(callArgs[1].headers['Authorization']).toBe('OAuth test-token');
      expect(callArgs[1].method).toBe('DELETE');
    });

    it('성공 시 에러 없이 완료 (void 반환)', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        clone: () => ({ json: async () => ({}) }),
        text: async () => '',
      });

      await expect(adapter.deletePost('media-123')).resolves.toBeUndefined();
    });

    it('API 오류 응답이어도 예외를 throw하지 않음', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        clone: () => ({ json: async () => ({ error: { code: 100, message: 'Not Found' } }) }),
        text: async () => 'Not Found',
      });

      await expect(adapter.deletePost('nonexistent-media')).resolves.toBeUndefined();
    });

    it('네트워크 에러 시에도 예외를 throw하지 않음', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      await expect(adapter.deletePost('media-456')).resolves.toBeUndefined();
    });
  });
});
