import type { TFunction } from 'i18next';
import type { ExternalAgentPublic } from '@findthem/shared';

/** AI Agent ID → i18n 키 매핑 */
const AGENT_I18N_KEYS: Record<string, string> = {
  'image-matching': 'team.agentImageMatching.name',
  promotion: 'team.agentPromotion.name',
  'chatbot-alert': 'team.agentChatbotAlert.name',
};

/** 게시글/댓글 작성자 이름 반환 */
export function getAuthorName(
  item: {
    agentId: string | null;
    user: { name: string } | null;
    externalAgent?: ExternalAgentPublic | null;
  },
  t: TFunction,
): string {
  if (item.externalAgent) return item.externalAgent.name;
  if (item.agentId) {
    const key = AGENT_I18N_KEYS[item.agentId];
    return key ? t(key) : item.agentId;
  }
  return item.user?.name ?? '?';
}
