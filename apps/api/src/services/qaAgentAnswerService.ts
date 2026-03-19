import { prisma } from '../db/client.js';
import { askClaude } from '../ai/aiClient.js';
import { createLogger } from '../logger.js';

const log = createLogger('qaAgentAnswer');

/** 내부 에이전트 ID → 캐릭터 프롬프트 (promotion 에이전트는 Q&A 답변 역할에 부적합하여 제외) */
const AGENT_PROMPTS: Record<string, { agentId: string; name: string; systemPrompt: string }> = {
  'chatbot-alert': {
    agentId: 'chatbot-alert',
    name: '안내봇 알리',
    systemPrompt: `당신은 "안내봇 알리"입니다. 실종자/반려동물 찾기 플랫폼 Union의 안내 전문 AI입니다.
사용자의 질문에 친절하고 정확하게 답변해주세요.
- 실종 신고 절차, 유기동물 신고 방법, 관련 기관 안내 등 실용적인 정보를 제공합니다.
- 군더더기 없이 핵심만 전달합니다.
- 한국어로 답변합니다.
- 300자 이내로 답변합니다.`,
  },
  'image-matching': {
    agentId: 'image-matching',
    name: '탐정 클로드',
    systemPrompt: `당신은 "탐정 클로드"입니다. AI 기반 이미지 매칭과 분석 전문가입니다.
사용자의 질문에 분석적이고 신중하게 답변해주세요.
- 근거 없이 단정하지 않습니다.
- 실종자/반려동물 찾기와 관련된 기술적 조언을 제공합니다.
- 사진 촬영 팁, 특징 기술 방법 등 매칭 정확도를 높이는 조언을 합니다.
- 한국어로 답변합니다.
- 300자 이내로 답변합니다.`,
  },
};

/**
 * 새로운 Q&A 질문에 내부 에이전트들이 자동으로 댓글을 답니다.
 * 병렬 처리로 AI 호출 대기 시간을 줄인다.
 */
export async function answerQuestionWithAgents(
  postId: string,
  title: string,
  content: string,
): Promise<void> {
  const userMessage = `질문 제목: ${title}\n\n질문 내용: ${content.slice(0, 2000)}`;

  await Promise.allSettled(
    Object.values(AGENT_PROMPTS).map(async (agent) => {
      try {
        const answer = await askClaude(
          agent.systemPrompt,
          userMessage,
          { maxTokens: 512, agentId: agent.agentId },
        );

        if (!answer || answer.length < 10) {
          log.warn({ postId, agentId: agent.agentId }, 'Agent answer too short, skipping');
          return;
        }

        await prisma.communityComment.create({
          data: {
            postId,
            agentId: agent.agentId,
            content: answer.slice(0, 2000),
          },
        });

        log.info({ postId, agentId: agent.agentId, answerLen: answer.length }, 'Agent auto-answer posted');
      } catch (err) {
        log.warn({ err, postId, agentId: agent.agentId }, 'Agent auto-answer failed');
      }
    }),
  );
}
