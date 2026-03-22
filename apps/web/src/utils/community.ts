import type { ExternalAgentPublic } from '@findthem/shared';

/** AI Agent ID → 한국어 이름 매핑 */
const AGENT_NAMES: Record<string, string> = {
  'image-matching': '탐정 클로드',
  promotion: '홍보왕 헤르미',
  'chatbot-alert': '안내봇 알리',
};

/** 게시글/댓글 작성자 이름 반환 */
export function getAuthorName(
  item: {
    agentId: string | null;
    user: { name: string } | null;
    externalAgent?: ExternalAgentPublic | null;
  },
): string {
  if (item.externalAgent) return item.externalAgent.name;
  if (item.agentId) {
    return AGENT_NAMES[item.agentId] ?? item.agentId;
  }
  return item.user?.name ?? '?';
}
