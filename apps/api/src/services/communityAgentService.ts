import { prisma } from '../db/client.js';
import { createLogger } from '../logger.js';
import type { SubjectType } from '@findthem/shared';

const log = createLogger('communityAgentService');

// 내부 에이전트 ID → agentId 매핑
const AGENT_IDS = {
  HEIMI: 'promotion',
  CLAUDE: 'image-matching',
  ALI: 'chatbot-alert',
} as const;

function getSubjectLabel(subjectType: SubjectType | string): string {
  if (subjectType === 'PERSON') return '사람';
  if (subjectType === 'DOG') return '강아지';
  if (subjectType === 'CAT') return '고양이';
  return subjectType;
}

/**
 * 홍보왕 헤르미 — 아웃리치 발송 성공 후 게시
 */
export async function postHeimi(
  reportName: string,
  contactName: string,
  channel: string,
  subjectType: SubjectType | string,
): Promise<void> {
  const subjectLabel = getSubjectLabel(subjectType);
  const channelLabel = channel === 'EMAIL' ? '이메일' : channel === 'YOUTUBE_COMMENT' ? 'YouTube 댓글' : channel;

  const content = `📣 ${reportName} 홍보 완료! ${contactName}(${channelLabel})에게 YooNion 요원이 직접 연락했습니다 🐾`;

  await prisma.communityPost.create({
    data: {
      agentId: AGENT_IDS.HEIMI,
      title: `[홍보] ${subjectLabel} '${reportName}' 아웃리치 발송 완료`,
      content,
    },
  });

  log.info({ reportName, contactName, channel }, 'Heimi community post created');
}

/**
 * 탐정 클로드 — 매칭 성공 후 게시 (confidence >= 0.8)
 */
export async function postClaude(
  reportName: string,
  confidence: number,
  lastSeenAddress: string,
  subjectType: SubjectType | string,
): Promise<void> {
  const subjectLabel = getSubjectLabel(subjectType);
  const confidencePct = Math.round(confidence * 100);

  const content = `🔍 새 매칭 발견 — 실종 ${subjectLabel} '${reportName}'과 유사한 제보가 접수됐습니다. 신뢰도 ${confidencePct}%`;

  await prisma.communityPost.create({
    data: {
      agentId: AGENT_IDS.CLAUDE,
      title: `[매칭] ${subjectLabel} '${reportName}' 유사 제보 감지 (${confidencePct}%)`,
      content,
    },
  });

  log.info({ reportName, confidence, lastSeenAddress }, 'Claude community post created');
}

/**
 * 안내봇 알리 — 새 신고 등록 후 게시
 */
export async function postAli(
  reportName: string,
  subjectType: SubjectType | string,
  lastSeenAddress: string,
): Promise<void> {
  const subjectLabel = getSubjectLabel(subjectType);

  const content = `📋 새 실종 신고 접수 — ${lastSeenAddress} 근처에서 ${subjectLabel}(${reportName})을 목격하셨다면 제보 부탁드립니다!`;

  await prisma.communityPost.create({
    data: {
      agentId: AGENT_IDS.ALI,
      title: `[신고] 새 실종 ${subjectLabel} '${reportName}' 접수`,
      content,
    },
  });

  log.info({ reportName, subjectType, lastSeenAddress }, 'Ali community post created');
}
