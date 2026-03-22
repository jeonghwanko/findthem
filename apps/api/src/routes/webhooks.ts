import type { Router } from 'express';
import { createHmac } from 'node:crypto';
import { prisma } from '../db/client.js';
import { isPrismaUniqueError } from '../utils/prismaErrors.js';
import { config } from '../config.js';
import { chatbotEngine } from '../chatbot/engine.js';
import { sightingAgent } from '../agent/sightingAgent.js';
import { webhookLimiter } from '../middlewares/rateLimit.js';
import { createLogger } from '../logger.js';

const log = createLogger('webhooks');

/**
 * 카카오 웹훅 HMAC-SHA256 서명 검증.
 * kakaoChannelPublicKey가 설정된 경우에만 검증 (미설정 시 개발 환경으로 간주하고 통과).
 */
function verifyKakaoSignature(body: string, signature: string | undefined): boolean {
  if (!config.kakaoChannelPublicKey) return true; // 개발 환경
  if (!signature) return false;
  const expected = createHmac('sha256', config.kakaoChannelPublicKey)
    .update(body)
    .digest('base64');
  return expected === signature;
}

export function registerWebhookRoutes(router: Router) {
  // 카카오톡 채널 웹훅 (HMAC-SHA256 서명 검증)
  router.post('/webhooks/kakao', webhookLimiter, async (req, res) => {
    // 서명 검증
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const signature = req.headers['x-kakao-signature'] as string | undefined;
    if (!verifyKakaoSignature(rawBody, signature)) {
      log.warn('Kakao webhook signature verification failed');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
    // 카카오톡 채널 챗봇 요청 형식
    // https://chatbot.kakao.com/docs/skill-response-format
    const { userRequest } = req.body;

    if (!userRequest) {
      res.json({ version: '2.0', template: { outputs: [] } });
      return;
    }

    const kakaoUserId = userRequest.user?.id;
    const utterance = userRequest.utterance || '';
    const photoUrl = userRequest.params?.media?.url;

    if (!kakaoUserId) {
      res.json(buildKakaoResponse('잠시 후 다시 시도해주세요.'));
      return;
    }

    try {
      // RACE-07: partial unique index로 해결됨.
      // chat_session_active_platform_user_unique: (platformUserId, platform) WHERE status = 'ACTIVE'
      // → 동일 사용자의 ACTIVE 세션이 동시에 두 개 생성되면 DB가 P2002를 발생시킴.
      const SESSION_SELECT = {
        id: true,
        engineVersion: true,
        platform: true,
        platformUserId: true,
        status: true,
        state: true,
        context: true,
        updatedAt: true,
      } as const;

      // 기존 활성 세션 찾기
      let session = await prisma.chatSession.findFirst({
        where: { platformUserId: kakaoUserId, platform: 'KAKAO', status: 'ACTIVE' },
        select: SESSION_SELECT,
        orderBy: { updatedAt: 'desc' },
      });

      const isReset = utterance === '시작' || utterance === '처음';

      // v2 분기: 새 세션이거나 v2 세션인 경우
      if (!session || session.engineVersion === 'v2' || isReset) {
        if (!session || isReset) {
          // reset 시 기존 세션 먼저 ABANDONED 처리 (partial unique index 해제)
          if (isReset && session) {
            await prisma.chatSession.update({
              where: { id: session.id },
              data: { status: 'ABANDONED' },
            });
          }

          // 새 세션 생성 — 동시 요청 race 시 P2002 발생 가능 (optimistic create)
          try {
            session = await prisma.chatSession.create({
              data: {
                platform: 'KAKAO',
                platformUserId: kakaoUserId,
                state: { currentStep: 'GREETING' },
                context: {},
                engineVersion: 'v2',
              },
              select: SESSION_SELECT,
            });
          } catch (createErr) {
            // P2002: 동시 요청이 먼저 생성한 세션 사용
            if (isPrismaUniqueError(createErr)) {
              const existing = await prisma.chatSession.findFirst({
                where: { platformUserId: kakaoUserId, platform: 'KAKAO', status: 'ACTIVE' },
                select: SESSION_SELECT,
                orderBy: { updatedAt: 'desc' },
              });
              if (!existing) throw createErr;
              session = existing;
            } else {
              throw createErr;
            }
          }
        }

        // 4초 타임아웃 적용 (카카오 5초 제한 대응)
        const agentResult = await Promise.race([
          sightingAgent.processMessage(
            { sessionId: session.id, platform: 'KAKAO' },
            utterance || '안녕하세요',
            photoUrl,
          ),
          new Promise<{ text: string; timeout: true }>((resolve) =>
            setTimeout(
              () => resolve({ text: '분석 중입니다. 잠시만 기다려주세요.', timeout: true }),
              4000,
            )
          ),
        ]);

        res.json(buildKakaoResponse(agentResult.text));
        return;
      }

      // v1 세션: 기존 로직 유지
      let response;

      if (isReset) {
        const result = await chatbotEngine.startSession(
          'KAKAO',
          undefined,
          kakaoUserId,
        );
        response = result.response;
      } else {
        response = await chatbotEngine.processMessage(
          session.id,
          utterance,
          photoUrl,
        );
      }

      res.json(
        buildKakaoResponse(response.text, response.quickReplies),
      );
    } catch (err) {
      log.error({ err }, 'Kakao webhook error');
      res.json(buildKakaoResponse('처리 중 오류가 발생했습니다. 다시 시도해주세요.'));
    }
  });

  // 카카오톡 웹훅 검증 (서버 등록 시)
  router.get('/webhooks/kakao/verify', (_req, res) => {
    res.status(200).send('OK');
  });
}

/** 카카오 챗봇 스킬 응답 형식 */
function buildKakaoResponse(
  text: string,
  quickReplies?: string[],
) {
  const response: Record<string, unknown> = {
    version: '2.0',
    template: {
      outputs: [
        {
          simpleText: { text },
        },
      ],
      quickReplies: quickReplies?.map((label) => ({
        messageText: label,
        action: 'message',
        label,
      })),
    },
  };

  return response;
}
