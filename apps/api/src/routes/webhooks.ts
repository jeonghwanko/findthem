import type { Router } from 'express';
import { prisma } from '../db/client.js';
import { chatbotEngine } from '../chatbot/engine.js';
import { sightingAgent } from '../agent/sightingAgent.js';
import { createLogger } from '../logger.js';

const log = createLogger('webhooks');

export function registerWebhookRoutes(router: Router) {
  // 카카오톡 채널 웹훅
  router.post('/webhooks/kakao', async (req, res) => {
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
      // RACE-07: TODO — ChatSession에 @@unique([platformUserId, platform]) 제약이 없어서
      // prisma.chatSession.upsert 패턴을 적용할 수 없음.
      // 적용하려면 schema.prisma의 ChatSession 모델에 아래를 추가하고 마이그레이션 필요:
      //   @@unique([platformUserId, platform])
      // 현재는 findFirst fallback 패턴 유지.
      // 기존 활성 세션 찾기 (engineVersion 포함)
      let session = await prisma.chatSession.findFirst({
        where: {
          platformUserId: kakaoUserId,
          platform: 'KAKAO',
          status: 'ACTIVE',
        },
        select: {
          id: true,
          engineVersion: true,
          platform: true,
          platformUserId: true,
          status: true,
          state: true,
          context: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      });

      const isReset = utterance === '시작' || utterance === '처음';

      // v2 분기: 새 세션이거나 v2 세션인 경우
      if (!session || session.engineVersion === 'v2' || isReset) {
        if (!session || isReset) {
          // 모든 새 세션은 v2로 생성
          session = await prisma.chatSession.create({
            data: {
              platform: 'KAKAO',
              platformUserId: kakaoUserId,
              state: { currentStep: 'GREETING' },
              context: {},
              engineVersion: 'v2',
            },
            select: {
              id: true,
              engineVersion: true,
              platform: true,
              platformUserId: true,
              status: true,
              state: true,
              context: true,
              updatedAt: true,
            },
          });
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
