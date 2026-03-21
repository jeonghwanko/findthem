import { prisma } from '../db/client.js';
import { createLogger } from '../logger.js';
import { isPrismaUniqueError } from '../utils/prismaErrors.js';
import { selectAction, generateCharacterPost } from '../ai/agentDecision.js';
import type { SubjectType, AgentId, AgentDomainEvent, CandidateAction } from '@findthem/shared';
import { getSubjectTypeLabel } from '@findthem/shared';

const log = createLogger('communityAgentService');

/** UTC 기반 YYYY-MM-DD 포맷 (서버 로컬 타임존 의존 방지) */
function utcDateString(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function safeTrim(s: string): string {
  return s.slice(0, 50);
}

/**
 * 에이전트가 커뮤니티에 글을 게시하는 공통 흐름:
 * 1. 이벤트 구성
 * 2. 성격 기반 행동 선택 (stay_silent이면 중단)
 * 3. 캐릭터 일관성 텍스트 생성
 * 4. 커뮤니티 포스트 저장
 * 5. 의사결정 로그 fire-and-forget (모든 후보 점수 포함)
 */
async function runAgentPost(
  agentId: AgentId,
  event: AgentDomainEvent,
  title: string,
  deduplicationKey: string,
  fallbackContent: string,
  sourceUrl?: string,
): Promise<void> {
  const { selected: action, allCandidates } = selectAction(agentId, event);

  if (action.type === 'stay_silent') {
    log.info({ agentId, eventType: event.type, reportName: event.reportName }, 'Agent chose stay_silent, skipping post');
    void logDecision(agentId, event, action.type, true, null, allCandidates);
    return;
  }

  const content = await generateCharacterPost(agentId, event, action) ?? fallbackContent;

  const post = await prisma.communityPost.create({
    data: { agentId, title, content, deduplicationKey, ...(sourceUrl ? { sourceUrl } : {}) },
  }).catch((err: unknown) => {
    if (isPrismaUniqueError(err)) {
      log.info({ agentId, deduplicationKey }, 'Community post already exists today, skipping');
      return null;
    }
    log.error({ err, agentId, deduplicationKey }, 'Failed to create community post');
    return null;
  });

  void logDecision(agentId, event, action.type, false, post?.id ?? null, allCandidates);

  if (post) {
    log.info({ agentId, postId: post.id, eventType: event.type, reportName: event.reportName }, 'Community post created');
  }
}

async function logDecision(
  agentId: AgentId,
  event: AgentDomainEvent,
  selectedAction: string,
  stayedSilent: boolean,
  postId: string | null,
  allCandidates: CandidateAction[],
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
        candidateScores: allCandidates.map((c) => ({ type: c.type, score: c.score })),
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
  subjectType: SubjectType,
  reportId?: string,
  videoId?: string,
): Promise<void> {
  const subjectLabel = getSubjectTypeLabel(subjectType, 'ko');
  const channelLabel = channel === 'EMAIL' ? '이메일' : 'YouTube 댓글';
  const safeName = safeTrim(reportName);
  const safeContact = safeTrim(contactName);

  const event: AgentDomainEvent = {
    type: 'outreach_sent',
    reportName: safeName,
    subjectType,
    contactName: safeContact,
    channel,
    reportId,
  };

  const title = `헤르미 보고 🐾 — '${safeName}' 홍보 완료!`;
  const deduplicationKey = `${utcDateString(new Date())}_heimi_${safeName}_${channel}`;
  const fallback = `오늘도 헤르미가 열심히 뛰었어요 🐾 ${subjectLabel} '${safeName}'을 찾기 위해 ${safeContact}에게 ${channelLabel}로 직접 연락했답니다! 함께 찾아요 🎉`;
  const sourceUrl = videoId ? `https://youtube.com/watch?v=${videoId}#comments` : undefined;

  await runAgentPost('promotion', event, title, deduplicationKey, fallback, sourceUrl);
}

// ── 탐정 클로드 ──────────────────────────────────────────────────────────────

export async function postClaude(
  reportName: string,
  confidence: number,
  lastSeenAddress: string,
  subjectType: SubjectType,
  reportId?: string,
): Promise<void> {
  const confidencePct = Math.round(confidence * 100);
  const safeName = safeTrim(reportName);
  const safeAddress = safeTrim(lastSeenAddress);

  const event: AgentDomainEvent = {
    type: 'match_detected',
    reportName: safeName,
    subjectType,
    lastSeenAddress: safeAddress,
    confidence,
    reportId,
  };

  const title = `탐정 클로드 보고 🔍 — '${safeName}' 매칭 신뢰도 ${confidencePct}%`;
  const deduplicationKey = `${utcDateString(new Date())}_claude_${safeName}`;
  const fallback = `🔍 분석 완료. '${safeName}' 신고와 목격 제보 간 유의미한 패턴이 감지됐습니다. 신뢰도 ${confidencePct}% — 유망한 단서입니다. 신고자에게 알림을 전송했습니다.`;

  await runAgentPost('image-matching', event, title, deduplicationKey, fallback);
}

// ── 안내봇 알리 ──────────────────────────────────────────────────────────────

export async function postAli(
  reportName: string,
  subjectType: SubjectType,
  lastSeenAddress: string,
  reportId?: string,
): Promise<void> {
  const subjectLabel = getSubjectTypeLabel(subjectType, 'ko');
  const safeName = safeTrim(reportName);
  const safeAddress = safeTrim(lastSeenAddress);

  const event: AgentDomainEvent = {
    type: 'report_created',
    reportName: safeName,
    subjectType,
    lastSeenAddress: safeAddress,
    reportId,
  };

  const title = `알리 안내 📋 — ${subjectLabel} '${safeName}' 실종 신고 접수`;
  const deduplicationKey = `${utcDateString(new Date())}_ali_${safeName}`;
  const fallback = `📋 새 실종 신고가 접수됐어요. ${safeAddress} 근처에서 ${subjectLabel} '${safeName}'을 보셨다면 제보 부탁드립니다. 작은 제보가 큰 힘이 됩니다 🙏`;

  await runAgentPost('chatbot-alert', event, title, deduplicationKey, fallback);
}

/** 제보 AI 분석 완료 시 안내봇 알리가 커뮤니티에 게시 (위치 + AI 분석 결과 요약) */
export async function postAliSighting(
  address: string,
  subjectType: SubjectType,
  aiAnalysisSummary: string,
  sightingId: string,
): Promise<void> {
  const safeAddress = safeTrim(address);

  const event: AgentDomainEvent = {
    type: 'sighting_analyzed',
    reportName: safeAddress,
    subjectType,
    lastSeenAddress: safeAddress,
    aiAnalysis: aiAnalysisSummary,
  };

  const subjectLabel = getSubjectTypeLabel(subjectType, 'ko');
  const title = `알리 제보 📸 — ${safeAddress} 근처 ${subjectLabel} 제보 접수`;
  const deduplicationKey = `${utcDateString(new Date())}_ali_sighting_${sightingId}`;
  const fallback = `📸 새 제보가 접수됐어요. ${safeAddress} 근처에서 동물이 목격되었습니다. ${aiAnalysisSummary} — 혹시 이 동물의 보호자이시거나 주변에서 보신 분은 제보 부탁드립니다 🙏`;

  await runAgentPost('chatbot-alert', event, title, deduplicationKey, fallback);
}
