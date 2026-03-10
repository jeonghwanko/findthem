import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestApp, authHeader } from '../helpers.js';

// chatbotEngine은 setup.ts에서 이미 mock됨

describe('Chat E2E', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── POST /api/chat/sessions ──
  describe('POST /api/chat/sessions', () => {
    it('세션 생성 → 201 + sessionId + 인사말', async () => {
      const res = await app
        .post('/api/chat/sessions')
        .send({});

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('sessionId');
    });

    it('reportId와 함께 생성', async () => {
      const res = await app
        .post('/api/chat/sessions')
        .send({ reportId: 'some-report-id' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('sessionId');
    });

    it('인증된 사용자로 생성', async () => {
      const res = await app
        .post('/api/chat/sessions')
        .set('Authorization', authHeader())
        .send({});

      expect(res.status).toBe(201);
    });
  });

  // ── POST /api/chat/sessions/:id/messages ──
  describe('POST /api/chat/sessions/:id/messages', () => {
    it('메시지 전송 → 200 + 봇 응답', async () => {
      const res = await app
        .post('/api/chat/sessions/mock-session-id/messages')
        .send({ message: '강아지를 봤어요' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('text');
    });

    it('빈 메시지 → 400', async () => {
      const res = await app
        .post('/api/chat/sessions/mock-session-id/messages')
        .send({ message: '' });

      expect(res.status).toBe(400);
    });

    it('message 필드 누락 → 400', async () => {
      const res = await app
        .post('/api/chat/sessions/mock-session-id/messages')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/chat/sessions/:id/stream (SSE) ──
  describe('GET /api/chat/sessions/:id/stream', () => {
    it('SSE 연결 → Content-Type text/event-stream + 초기 데이터', async () => {
      // SSE는 스트리밍 연결 — 첫 데이터 수신 후 즉시 abort
      const result = await new Promise<{ headers: Record<string, string>; text: string }>((resolve, reject) => {
        const req = app
          .get('/api/chat/sessions/mock-session-id/stream')
          .buffer(true)
          .parse((res, callback) => {
            let data = '';
            res.on('data', (chunk: Buffer) => {
              data += chunk.toString();
              // 첫 데이터 수신 후 연결 종료
              req.abort();
              resolve({
                headers: res.headers as Record<string, string>,
                text: data,
              });
            });
            res.on('end', () => callback(null, data));
            res.on('error', reject);
          })
          .end(() => {});
      });

      expect(result.headers['content-type']).toContain('text/event-stream');
      expect(result.text).toContain('connected');
    });
  });
});
