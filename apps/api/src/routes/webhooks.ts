import { Router } from 'express';
import { prisma } from '../db/client.js';
import { chatbotEngine } from '../chatbot/engine.js';
import { config } from '../config.js';

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
      // 기존 활성 세션 찾기 또는 새로 생성
      let session = await prisma.chatSession.findFirst({
        where: {
          platformUserId: kakaoUserId,
          platform: 'KAKAO',
          status: 'ACTIVE',
        },
        orderBy: { updatedAt: 'desc' },
      });

      let response;

      if (!session || utterance === '시작' || utterance === '처음') {
        // 새 세션
        const result = await chatbotEngine.startSession(
          'KAKAO',
          undefined,
          kakaoUserId,
        );
        response = result.response;
      } else {
        // 기존 세션에 메시지 처리
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
      console.error('Kakao webhook error:', err);
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
