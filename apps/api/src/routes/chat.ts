import type { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { chatbotEngine } from '../chatbot/engine.js';
import { optionalAuth } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';
import { imageService } from '../services/imageService.js';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from '@findthem/shared';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new ApiError(400, 'IMAGE_ONLY') as unknown as null);
  },
});

const createSessionSchema = z.object({
  reportId: z.string().optional(),
  locale: z.enum(['ko', 'ja', 'zh-TW', 'en']).optional(),
});

const sendMessageSchema = z.object({
  message: z.string().min(1),
  locale: z.enum(['ko', 'ja', 'zh-TW', 'en']).optional(),
});

/** Accept-Language 헤더 또는 쿼리 파라미터에서 locale 추출 */
function resolveLocale(
  headerValue: string | undefined,
  queryValue: unknown,
  bodyValue: unknown,
): Locale {
  // 1. body/query에 명시된 locale 우선
  const explicit = (bodyValue || queryValue) as string | undefined;
  if (explicit && (SUPPORTED_LOCALES as readonly string[]).includes(explicit)) {
    return explicit as Locale;
  }
  // 2. Accept-Language 헤더 파싱 (예: "ko-KR,ko;q=0.9,en;q=0.8")
  if (headerValue) {
    const primary = headerValue.split(',')[0]?.split(';')[0]?.trim().toLowerCase();
    if (primary?.startsWith('ko')) return 'ko';
    if (primary?.startsWith('ja')) return 'ja';
    if (primary === 'zh-tw') return 'zh-TW';
    if (primary?.startsWith('zh')) return 'zh-TW';
    if (primary?.startsWith('en')) return 'en';
  }
  return DEFAULT_LOCALE;
}

export function registerChatRoutes(router: Router) {
  // 새 챗봇 세션 생성
  router.post('/chat/sessions', optionalAuth, async (req, res) => {
    const { reportId, locale: bodyLocale } = createSessionSchema.parse(req.body);
    const locale = resolveLocale(
      req.headers['accept-language'],
      req.query.locale,
      bodyLocale,
    );

    const { sessionId, response } = await chatbotEngine.startSession(
      'WEB',
      req.user?.userId,
      undefined,
      reportId,
      locale,
    );

    res.status(201).json({ sessionId, locale, ...response });
  });

  // 메시지 전송
  router.post('/chat/sessions/:id/messages', optionalAuth, async (req, res) => {
    const sessionId = req.params.id;
    const { message, locale: bodyLocale } = sendMessageSchema.parse(req.body);
    const locale = resolveLocale(
      req.headers['accept-language'],
      req.query.locale,
      bodyLocale,
    );

    const response = await chatbotEngine.processMessage(sessionId, message, undefined, locale);
    res.json(response);
  });

  // 사진 업로드 (채팅 중)
  router.post(
    '/chat/sessions/:id/upload',
    optionalAuth,
    upload.single('photo'),
    async (req, res) => {
      const sessionId = req.params.id;
      const file = req.file;
      if (!file) throw new ApiError(400, 'PHOTO_ATTACH_REQUIRED');

      const locale = resolveLocale(
        req.headers['accept-language'],
        req.query.locale,
        req.body?.locale,
      );

      const { photoUrl } = await imageService.processAndSave('sightings', file);

      // 사진을 메시지로 처리 (locale별 "사진 첨부" 문구 사용)
      const photoAttachMsg = {
        ko: '사진 첨부',
        en: 'Photo attached',
        ja: '写真添付',
        'zh-TW': '照片附件',
      }[locale];

      const response = await chatbotEngine.processMessage(
        sessionId,
        photoAttachMsg,
        photoUrl,
        locale,
      );

      res.json({ photoUrl, ...response });
    },
  );

  // SSE 스트림 (실시간 응답용 - 향후 확장)
  router.get('/chat/sessions/:id/stream', (req, res) => {
    const sessionId = req.params.id;

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
