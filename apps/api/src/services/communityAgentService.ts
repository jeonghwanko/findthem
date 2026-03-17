import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { createLogger } from '../logger.js';
import { selectAction, generateCharacterPost } from '../ai/agentDecision.js';
import type { SubjectType, AgentId, AgentDomainEvent } from '@findthem/shared';

const log = createLogger('communityAgentService');

const AGENT_IDS = {
  HEIMI: 'promotion' as AgentId,
  CLAUDE: 'image-matching' as AgentId,
  ALI: 'chatbot-alert' as AgentId,
} as const;

function getSubjectLabel(subjectType: SubjectType | string): string {
  if (subjectType === 'PERSON') return '사람';
  if (subjectType === 'DOG') return '강아지';
  if (subjectType === 'CAT') return '고양이';
  return subjectType;
}

function safeName(s: string): string {
  return s.slice(0, 50);
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 에이전트가 커뮤니티에 글을 게시하는 공통 흐름:
 * 1. 이벤트 구성
 * 2. 성격 기반 행동 선택 (stay_silent이면 중단)
 * 3. 캐릭터 일관성 텍스트 생성
 * 4. 커뮤니티 포스트 저장
 * 5. 의사결정 로그 fire-and-forget
 */
async function runAgentPost(
  agentId: AgentId,
  event: AgentDomainEvent,
  title: string,
  deduplicationKey: string,
  fallbackContent: string,
): Promise<void> {
  const action = selectAction(agentId, event);

  if (action.type === 'stay_silent') {
    log.info({ agentId, eventType: event.type, reportName: event.reportName }, 'Agent chose stay_silent, skipping post');
    void logDecision(agentId, event, action.type, true, null, action);
    return;
  }

  const content = await generateCharacterPost(agentId, event, action) ?? fallbackContent;

  const post = await prisma.communityPost.create({
    data: { agentId, title, content, deduplicationKey },
  }).catch((err: unknown) => {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      log.info({ agentId, deduplicationKey }, 'Community post already exists today, skipping');
      return null;
    }
    log.error({ err, agentId, deduplicationKey }, 'Failed to create community post');
    return null;
  });

  void logDecision(agentId, event, action.type, false, post?.id ?? null, action);
  log.info({ agentId, eventType: event.type, reportName: event.reportName }, 'Community post created');
}

async function logDecision(
  agentId: AgentId,
  event: AgentDomainEvent,
  selectedAction: string,
  stayedSilent: boolean,
  postId: string | null,
  action: { score: number },
): Promise<void> {
  try {
    await prisma.agentDecisionLog.create({
      data: {
        agentId,
        eventType: event.type,
        selectedAction,
        stayedSilent,
        confidence: event.confidence ?? null,
        reportId: event.reportId ?? null,
        postId,
        candidateScores: { score: action.score, event: event.type },
      },
    });
  } catch (err) {
    log.warn({ err, agentId }, 'Failed to write agent decision log');
  }
}

// ── 헤르미 ──────────────────────────────────────────────────────────────────

export async function postHeimi(
  reportName: string,
  contactName: string,
  channel: string,
  subjectType: SubjectType | string,
  reportId?: string,
): Promise<void> {
  const subjectLabel = getSubjectLabel(subjectType);
  const channelLabel = channel === 'EMAIL' ? '이메일' : 'YouTube 댓글';
  const safeName_ = safeName(reportName);
  const safeContact = safeName(contactName);

  const event: AgentDomainEvent = {
    type: 'outreach_sent',
    reportName: safeName_,
    subjectType: subjectType as SubjectType,
    contactName: safeContact,
    channel,
    reportId,
  };

  const title = `헤르미 보고 🐾 — '${safeName_}' 홍보 완료!`;
  const deduplicationKey = `${formatDate(new Date())}_heimi_${safeName_}_${channel}`;
  const fallback = `오늘도 헤르미가 열심히 뛰었어요 🐾 ${subjectLabel} '${safeName_}'을 찾기 위해 ${safeContact}에게 ${channelLabel}로 직접 연락했답니다! 함께 찾아요 🎉`;

  await runAgentPost(AGENT_IDS.HEIMI, event, title, deduplicationKey, fallback);
}

// ── 탐정 클로드 ──────────────────────────────────────────────────────────────

export async function postClaude(
  reportName: string,
  confidence: number,
  lastSeenAddress: string,
  subjectType: SubjectType | string,
  reportId?: string,
): Promise<void> {
  const confidencePct = Math.round(confidence * 100);
  const safeName_ = safeName(reportName);
  const safeAddress = safeName(lastSeenAddress);

  const event: AgentDomainEvent = {
    type: 'match_detected',
    reportName: safeName_,
    subjectType: subjectType as SubjectType,
    lastSeenAddress: safeAddress,
    confidence,
    reportId,
  };

  const title = `탐정 클로드 보고 🔍 — '${safeName_}' 매칭 신뢰도 ${confidencePct}%`;
  const deduplicationKey = `${formatDate(new Date())}_claude_${safeName_}`;
  const fallback = `🔍 분석 완료. '${safeName_}' 신고와 목격 제보 간 유의미한 패턴이 감지됐습니다. 신뢰도 ${confidencePct}% — 유망한 단서입니다. 신고자에게 알림을 전송했습니다.`;

  await runAgentPost(AGENT_IDS.CLAUDE, event, title, deduplicationKey, fallback);
}

// ── 안내봇 알리 ──────────────────────────────────────────────────────────────

export async function postAli(
  reportName: string,
  subjectType: SubjectType | string,
  lastSeenAddress: string,
  reportId?: string,
): Promise<void> {
  const subjectLabel = getSubjectLabel(subjectType);
  const safeName_ = safeName(reportName);
  const safeAddress = safeName(lastSeenAddress);

  const event: AgentDomainEvent = {
    type: 'report_created',
    reportName: safeName_,
    subjectType: subjectType as SubjectType,
    lastSeenAddress: safeAddress,
    reportId,
  };

  const title = `알리 안내 📋 — ${subjectLabel} '${safeName_}' 실종 신고 접수`;
  const deduplicationKey = `${formatDate(new Date())}_ali_${safeName_}`;
  const fallback = `📋 새 실종 신고가 접수됐어요. ${safeAddress} 근처에서 ${subjectLabel} '${safeName_}'을 보셨다면 제보 부탁드립니다. 작은 제보가 큰 힘이 됩니다 🙏`;

  await runAgentPost(AGENT_IDS.ALI, event, title, deduplicationKey, fallback);
}
