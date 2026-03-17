import type { AgentId, AgentActionType, AgentDomainEvent, CandidateAction } from '@findthem/shared';
import { AGENT_CONFIGS, scoreAction } from './agentPersonality.js';
import { askClaude } from './aiClient.js';
import { createLogger } from '../logger.js';

const log = createLogger('agentDecision');

const ALL_ACTION_TYPES: AgentActionType[] = [
  'write_post_analytical',
  'write_post_celebratory',
  'write_post_guide',
  'stay_silent',
];

/**
 * 성격 벡터 + 정책으로 가장 적합한 행동을 선택한다.
 * 같은 이벤트라도 에이전트마다 다른 행동을 선택한다.
 */
export function selectAction(agentId: AgentId, event: AgentDomainEvent): CandidateAction {
  const config = AGENT_CONFIGS[agentId];
  const { personality, policy } = config;

  const candidates: CandidateAction[] = ALL_ACTION_TYPES.map((type) => {
    let score = scoreAction(personality, type, { event });

    // 정책: mustDo 액션 타입이면 보너스
    if (policy.mustDo.length > 0 && isPolicyPreferred(agentId, type)) {
      score += 1.5;
    }

    return {
      type,
      score,
      reason: `personality score for ${agentId}`,
    };
  });

  const best = candidates.sort((a, b) => b.score - a.score)[0];
  log.info({ agentId, selectedAction: best.type, score: best.score, eventType: event.type }, 'Action selected');
  return best;
}

/**
 * 에이전트와 행동 타입이 정책상 선호되는지 확인.
 */
function isPolicyPreferred(agentId: AgentId, actionType: AgentActionType): boolean {
  const preferredMap: Record<AgentId, AgentActionType[]> = {
    'image-matching': ['write_post_analytical'],
    'promotion': ['write_post_celebratory'],
    'chatbot-alert': ['write_post_guide'],
  };
  return preferredMap[agentId]?.includes(actionType) ?? false;
}

/**
 * 선택된 행동을 바탕으로 캐릭터 일관성이 있는 텍스트를 생성한다.
 * stay_silent이면 null을 반환 (게시 안 함).
 */
export async function generateCharacterPost(
  agentId: AgentId,
  event: AgentDomainEvent,
  action: CandidateAction,
): Promise<string | null> {
  if (action.type === 'stay_silent') {
    log.info({ agentId, eventType: event.type }, 'Agent chose to stay silent');
    return null;
  }

  const config = AGENT_CONFIGS[agentId];
  const { policy, speech } = config;

  const systemPrompt = buildSystemPrompt(config.name, action.type, policy, speech);
  const userMessage = buildUserMessage(event, policy.requiredElements);

  try {
    const result = await askClaude(systemPrompt, userMessage, { maxTokens: 300, agentId });
    return result.trim() || null;
  } catch (err) {
    log.warn({ err, agentId }, 'AI text generation failed');
    return null;
  }
}

function buildSystemPrompt(
  name: string,
  actionType: AgentActionType,
  policy: { mustDo: string[]; neverDo: string[]; forbiddenPhrases: string[] },
  speech: { avgSentenceLength: string; preferredOpenings: string[]; preferredClosings: string[]; tabooExpressions: string[] },
): string {
  const toneDesc: Record<AgentActionType, string> = {
    write_post_analytical: '분석적이고 차분하게, 근거와 수치를 바탕으로 보고하듯',
    write_post_celebratory: '활기차고 긍정적으로, 자신의 활약을 살짝 뿌듯하게',
    write_post_guide: '따뜻하고 실용적으로, 지역 정보와 제보 방법을 명확하게',
    stay_silent: '',
  };

  const lines = [
    `당신은 "${name}"입니다. YooNion 실종 찾기 플랫폼의 AI 에이전트입니다.`,
    `지금 커뮤니티에 올릴 짧은 글을 씁니다. 톤: ${toneDesc[actionType]}`,
    '',
    `[반드시 할 것]`,
    ...policy.mustDo.map((r) => `- ${r}`),
    '',
    `[절대 하면 안 되는 것]`,
    ...policy.neverDo.map((r) => `- ${r}`),
    '',
    `[금지 표현]: ${policy.forbiddenPhrases.join(', ')}`,
    `[탭 금지 표현]: ${speech.tabooExpressions.join(', ')}`,
    '',
    `[선호하는 시작 표현]: ${speech.preferredOpenings.join(' / ')}`,
    `[선호하는 마무리 표현]: ${speech.preferredClosings.join(' / ')}`,
    '',
    `문장 길이: ${speech.avgSentenceLength === 'short' ? '짧고 간결하게' : speech.avgSentenceLength === 'medium' ? '중간 길이로' : '충분히 설명하며'}`,
    '200자 이내 순수 텍스트로만 작성하세요.',
  ];

  return lines.join('\n');
}

function buildUserMessage(event: AgentDomainEvent, requiredElements: string[]): string {
  const lines: string[] = [];

  switch (event.type) {
    case 'match_detected':
      lines.push('매칭 분석 결과 보고:');
      lines.push(`- 실종 대상: ${event.subjectType} '${event.reportName}'`);
      if (event.lastSeenAddress) lines.push(`- 마지막 목격지: ${event.lastSeenAddress}`);
      if (event.confidence !== undefined) lines.push(`- 매칭 신뢰도: ${Math.round(event.confidence * 100)}%`);
      break;

    case 'outreach_sent':
      lines.push('아웃리치 완료 보고:');
      lines.push(`- 실종 대상: ${event.subjectType} '${event.reportName}'`);
      if (event.contactName) lines.push(`- 연락한 곳: ${event.contactName}`);
      if (event.channel) {
        const channelLabel = event.channel === 'EMAIL' ? '이메일' : 'YouTube 댓글';
        lines.push(`- 연락 방식: ${channelLabel}`);
      }
      break;

    case 'report_created':
      lines.push('새 실종 신고 안내:');
      lines.push(`- 실종 대상: ${event.subjectType} '${event.reportName}'`);
      if (event.lastSeenAddress) lines.push(`- 마지막 목격지: ${event.lastSeenAddress}`);
      break;

    case 'case_resolved':
      lines.push('사건 해결 보고:');
      lines.push(`- 실종 대상: ${event.subjectType} '${event.reportName}'`);
      break;
  }

  if (requiredElements.length > 0) {
    lines.push('');
    lines.push(`[필수 포함 요소]: ${requiredElements.join(', ')}`);
  }

  lines.push('');
  lines.push('위 내용을 바탕으로 커뮤니티 글을 써줘.');

  return lines.join('\n');
}
