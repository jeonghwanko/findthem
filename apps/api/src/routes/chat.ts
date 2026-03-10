import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { chatbotEngine } from '../chatbot/engine.js';
import { optionalAuth } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';
import { imageService } from '../services/imageService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new ApiError(400, '이미지 파일만 업로드 가능합니다.') as any);
  },
});

const createSessionSchema = z.object({
  reportId: z.string().optional(),
});

const sendMessageSchema = z.object({
  message: z.string().min(1),
});

export function registerChatRoutes(router: Router) {
  // 새 챗봇 세션 생성
  router.post('/chat/sessions', optionalAuth, async (req, res) => {
    const { reportId } = createSessionSchema.parse(req.body);

    const { sessionId, response } = await chatbotEngine.startSession(
      'WEB',
      req.user?.userId,
      undefined,
      reportId,
    );

    res.status(201).json({ sessionId, ...response });
  });

  // 메시지 전송
  router.post('/chat/sessions/:id/messages', optionalAuth, async (req, res) => {
    const sessionId = req.params.id as string;
    const { message } = sendMessageSchema.parse(req.body);

    const response = await chatbotEngine.processMessage(sessionId, message);
    res.json(response);
  });

  // 사진 업로드 (채팅 중)
  router.post(
    '/chat/sessions/:id/upload',
    optionalAuth,
    upload.single('photo'),
    async (req, res) => {
      const sessionId = req.params.id as string;
      const file = req.file;
      if (!file) throw new ApiError(400, '사진을 첨부해주세요.');

      const { photoUrl } = await imageService.processAndSave('sightings', file);

      // 사진을 메시지로 처리
      const response = await chatbotEngine.processMessage(
        sessionId,
        '사진 첨부',
        photoUrl,
      );

      res.json({ photoUrl, ...response });
    },
  );

  // SSE 스트림 (실시간 응답용 - 향후 확장)
  router.get('/chat/sessions/:id/stream', async (req, res) => {
    const sessionId = req.params.id as string;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // 초기 연결 확인
    res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);

    // 30초마다 keepalive
    const keepalive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepalive);
      }
    }, 30_000);

    req.on('close', () => {
      clearInterval(keepalive);
    });

    res.on('error', () => {
      clearInterval(keepalive);
    });
  });
}
