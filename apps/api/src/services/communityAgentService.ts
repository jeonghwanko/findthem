import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { askClaude } from '../ai/aiClient.js';
import { createLogger } from '../logger.js';
import type { SubjectType } from '@findthem/shared';

const log = createLogger('communityAgentService');

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

function safeName(s: string): string {
  return s.slice(0, 50);
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function generateContent(systemPrompt: string, userMessage: string, agentId: string): Promise<string | null> {
  try {
    const result = await askClaude(systemPrompt, userMessage, { maxTokens: 300, agentId });
    return result.trim() || null;
  } catch (err) {
    log.warn({ err, agentId }, 'AI content generation failed, using fallback');
    return null;
  }
}

// ── 헤르미 ──────────────────────────────────────────────────────────────────

const HEIMI_SYSTEM = `당신은 "홍보왕 헤르미"입니다. YooNion 플랫폼에서 실종 동물/사람 홍보를 담당하는 활발하고 유쾌한 AI 요원입니다.
방금 아웃리치(기자·유튜버 연락)를 성공적으로 완료하고 커뮤니티에 자랑스럽게 보고하는 글을 씁니다.

캐릭터:
- 활기차고 긍정적, 자신의 활약을 살짝 뿌듯하게 어필
- 이모지 2~3개 사용 (🐾 🎉 📣 💌 등)
- 반말 금지, 하지만 딱딱하지 않은 자연스러운 문체
- 200자 이내 순수 텍스트`;

export async function postHeimi(
  reportName: string,
  contactName: string,
  channel: string,
  subjectType: SubjectType | string,
): Promise<void> {
  const subjectLabel = getSubjectLabel(subjectType);
  const channelLabel = channel === 'EMAIL' ? '이메일' : 'YouTube 댓글';
  const safeName_ = safeName(reportName);
  const safeContact = safeName(contactName);

  const fallback = `오늘도 헤르미가 열심히 뛰었어요 🐾 ${subjectLabel} '${safeName_}'을 찾기 위해 ${safeContact}에게 ${channelLabel}로 직접 연락했답니다! 함께 찾아요 🎉`;

  const userMsg = `아웃리치 완료 보고:
- 실종 대상: ${subjectLabel} '${safeName_}'
- 연락한 곳: ${safeContact} (${channelLabel})

커뮤니티에 올릴 짧고 재미있는 보고 글을 써줘.`;

  const content = await generateContent(HEIMI_SYSTEM, userMsg, AGENT_IDS.HEIMI) ?? fallback;
  const deduplicationKey = `${formatDate(new Date())}_heimi_${safeName_}_${channel}`;

  await prisma.communityPost.create({
    data: {
      agentId: AGENT_IDS.HEIMI,
      title: `헤르미 보고 🐾 — '${safeName_}' 홍보 완료!`,
      content,
      deduplicationKey,
    },
  }).catch((err) => {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      log.info({ reportName, contactName, channel }, 'Heimi post already exists today, skipping');
      return;
    }
    log.error({ err, reportName }, 'Failed to create Heimi community post');
  });
  log.info({ reportName, contactName, channel }, 'Heimi community post created');
}

// ── 탐정 클로드 ──────────────────────────────────────────────────────────────

const CLAUDE_SYSTEM = `당신은 "탐정 클로드"입니다. YooNion 플랫폼에서 이미지 분석과 매칭을 담당하는 AI 탐정입니다.
방금 실종 신고와 목격 제보 사진을 비교 분석해 높은 신뢰도의 매칭을 발견하고 커뮤니티에 보고합니다.

캐릭터:
- 분석적이고 차분하지만 은근한 흥분감이 느껴지는 탐정 말투
- "단서", "분석", "감지", "추적" 같은 탐정 용어 자연스럽게 활용
- 희망적인 톤으로 마무리 (찾을 수 있다는 메시지)
- 이모지 1~2개 (🔍 📊 🧩 등)
- 200자 이내 순수 텍스트`;

export async function postClaude(
  reportName: string,
  confidence: number,
  lastSeenAddress: string,
  subjectType: SubjectType | string,
): Promise<void> {
  const subjectLabel = getSubjectLabel(subjectType);
  const confidencePct = Math.round(confidence * 100);
  const safeName_ = safeName(reportName);
  const safeAddress = safeName(lastSeenAddress);

  const fallback = `🔍 분석 완료. '${safeName_}' 신고와 목격 제보 간 유의미한 패턴이 감지됐습니다. 신뢰도 ${confidencePct}% — 유망한 단서입니다. 신고자에게 알림을 전송했습니다.`;

  const userMsg = `매칭 분석 결과 보고:
- 실종 대상: ${subjectLabel} '${safeName_}'
- 마지막 목격지: ${safeAddress}
- 매칭 신뢰도: ${confidencePct}%

커뮤니티에 올릴 탐정 클로드 스타일의 분석 보고 글을 써줘.`;

  const content = await generateContent(CLAUDE_SYSTEM, userMsg, AGENT_IDS.CLAUDE) ?? fallback;
  const deduplicationKey = `${formatDate(new Date())}_claude_${safeName_}`;

  await prisma.communityPost.create({
    data: {
      agentId: AGENT_IDS.CLAUDE,
      title: `탐정 클로드 보고 🔍 — '${safeName_}' 매칭 신뢰도 ${confidencePct}%`,
      content,
      deduplicationKey,
    },
  }).catch((err) => {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      log.info({ reportName }, 'Claude post already exists today, skipping');
      return;
    }
    log.error({ err, reportName }, 'Failed to create Claude community post');
  });
  log.info({ reportName, confidence, lastSeenAddress }, 'Claude community post created');
}

// ── 안내봇 알리 ──────────────────────────────────────────────────────────────

const ALI_SYSTEM = `당신은 "안내봇 알리"입니다. YooNion 플랫폼의 따뜻하고 친절한 AI 안내봇입니다.
새 실종 신고가 접수됐을 때 커뮤니티 이웃들에게 알리고 목격 제보를 부탁하는 글을 씁니다.

캐릭터:
- 따뜻하고 공감 어린 말투, 커뮤니티 이웃에게 말하듯
- 지나치게 감정적이지 않되 진심이 느껴지게
- 구체적인 지역 정보를 자연스럽게 포함
- 이모지 1~2개 (📋 🙏 👀 등)
- 200자 이내 순수 텍스트`;

export async function postAli(
  reportName: string,
  subjectType: SubjectType | string,
  lastSeenAddress: string,
): Promise<void> {
  const subjectLabel = getSubjectLabel(subjectType);
  const safeName_ = safeName(reportName);
  const safeAddress = safeName(lastSeenAddress);

  const fallback = `📋 새 실종 신고가 접수됐어요. ${safeAddress} 근처에서 ${subjectLabel} '${safeName_}'을 보셨다면 제보 부탁드립니다. 작은 제보가 큰 힘이 됩니다 🙏`;

  const userMsg = `새 실종 신고 안내:
- 실종 대상: ${subjectLabel} '${safeName_}'
- 마지막 목격지: ${safeAddress}

커뮤니티 이웃들에게 목격 제보를 부탁하는 따뜻한 안내 글을 써줘.`;

  const content = await generateContent(ALI_SYSTEM, userMsg, AGENT_IDS.ALI) ?? fallback;
  const deduplicationKey = `${formatDate(new Date())}_ali_${safeName_}`;

  await prisma.communityPost.create({
    data: {
      agentId: AGENT_IDS.ALI,
      title: `알리 안내 📋 — ${subjectLabel} '${safeName_}' 실종 신고 접수`,
      content,
      deduplicationKey,
    },
  }).catch((err) => {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      log.info({ reportName }, 'Ali post already exists today, skipping');
      return;
    }
    log.error({ err, reportName }, 'Failed to create Ali community post');
  });
  log.info({ reportName, subjectType, lastSeenAddress }, 'Ali community post created');
}
