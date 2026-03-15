import type { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { optionalAuth } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';
import { agentLimiter } from '../middlewares/rateLimit.js';
import { prisma } from '../db/client.js';
import { imageService } from '../services/imageService.js';
import { sightingAgent } from '../agent/sightingAgent.js';
import { MAX_FILE_SIZE, ERROR_CODES } from '@findthem/shared';
import type { ChatMessage } from '@prisma/client';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new ApiError(400, 'IMAGE_ONLY') as unknown as null, false);
  },
});

const createSessionSchema = z.object({
  reportId: z.string().optional(),
  platform: z.enum(['WEB', 'KAKAO']).optional().default('WEB'),
});

const sendMessageSchema = z.object({
  message: z.string().min(1),
});

export function registerAgentRoutes(router: Router) {
  // POST /agent/sessions — 에이전트 세션 생성
  router.post('/agent/sessions', agentLimiter, optionalAuth, async (req, res) => {
    const { reportId, platform } = createSessionSchema.parse(req.body);

    const session = await prisma.chatSession.create({
      data: {
        userId: req.user?.userId ?? null,
        reportId: reportId ?? null,
        platform,
        state: { currentStep: 'GREETING' },
        context: {},
        status: 'ACTIVE',
        engineVersion: 'v2',
      },
    });

    const response = await sightingAgent.processMessage(
      {
        sessionId: session.id,
        userId: req.user?.userId,
        platform,
        reportId,
      },
      '안녕하세요',
    );

    res.status(201).json({
      sessionId: session.id,
      text: response.text,
      completed: response.completed,
      toolsUsed: response.toolsUsed,
    });
  });

  // POST /agent/sessions/:id/messages — 메시지 전송
  router.post('/agent/sessions/:id/messages', agentLimiter, optionalAuth, async (req, res) => {
    const sessionId = req.params.id as string;
    const { message } = sendMessageSchema.parse(req.body);

    const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new ApiError(404, ERROR_CODES.SESSION_NOT_FOUND);
    if (session.userId && session.userId !== req.user?.userId) throw new ApiError(403, ERROR_CODES.SESSION_OWNER_ONLY);
    if (session.status !== 'ACTIVE') throw new ApiError(400, ERROR_CODES.SESSION_COMPLETED);

    const response = await sightingAgent.processMessage(
      {
        sessionId,
        userId: req.user?.userId,
        platform: session.platform as 'WEB' | 'KAKAO',
        reportId: session.reportId ?? undefined,
      },
      message,
    );

    res.json(response);
  });

  // POST /agent/sessions/:id/upload — 사진 업로드 + 메시지
  router.post(
    '/agent/sessions/:id/upload',
    agentLimiter,
    optionalAuth,
    upload.single('photo'),
    async (req, res) => {
      const sessionId = req.params.id as string;
      const file = req.file;
      if (!file) throw new ApiError(400, ERROR_CODES.PHOTO_ATTACH_REQUIRED);

      const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
      if (!session) throw new ApiError(404, ERROR_CODES.SESSION_NOT_FOUND);
      if (session.userId && session.userId !== req.user?.userId) throw new ApiError(403, ERROR_CODES.SESSION_OWNER_ONLY);
      if (session.status !== 'ACTIVE') throw new ApiError(400, ERROR_CODES.SESSION_COMPLETED);

      const { photoUrl } = await imageService.processAndSave('sightings', file);

      const userMessage =
        typeof req.body?.message === 'string' && (req.body.message as string).trim()
          ? (req.body.message as string).trim()
          : '사진 첨부';

      const response = await sightingAgent.processMessage(
        {
          sessionId,
          userId: req.user?.userId,
          platform: session.platform as 'WEB' | 'KAKAO',
          reportId: session.reportId ?? undefined,
        },
        userMessage,
        photoUrl,
      );

      res.json({ photoUrl, ...response });
    },
  );

  // GET /agent/sessions/:id — 세션 상태/히스토리 조회
  router.get('/agent/sessions/:id', optionalAuth, async (req, res) => {
    const sessionId = req.params.id as string;

    const [session, messages] = await Promise.all([
      prisma.chatSession.findUnique({ where: { id: sessionId } }),
      prisma.chatMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!session) throw new ApiError(404, ERROR_CODES.SESSION_NOT_FOUND);
    if (session.userId && session.userId !== req.user?.userId) throw new ApiError(403, ERROR_CODES.SESSION_OWNER_ONLY);

    res.json({
      id: session.id,
      status: session.status,
      platform: session.platform,
      engineVersion: session.engineVersion,
      reportId: session.reportId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messages: messages.map((m: ChatMessage) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
    });
  });
}
