import { askClaude } from './aiClient.js';
import { createLogger } from '../logger.js';
import { getSubjectTypeLabel } from '@findthem/shared';
import { config } from '../config.js';

const log = createLogger('outreachContentAgent');

// ── Types ──

interface ReportForOutreach {
  id: string;
  subjectType: string;
  name: string;
  features: string;
  lastSeenAt: Date;
  lastSeenAddress: string;
  contactName: string;
  aiDescription?: string | null;
}

interface OutreachContactForContent {
  type: string;
  name: string;
  organization?: string | null;
  topics: string[];
}

export interface OutreachEmailDraft {
  subject: string;
  body: string;
}

// ── 이모지 안전 truncate (서로게이트 페어 경계 보호) ──

function safeTruncate(str: string, maxChars: number): string {
  const chars = [...str]; // 유니코드 코드 포인트 단위
  if (chars.length <= maxChars) return str;
  return chars.slice(0, maxChars - 3).join('') + '...';
}

// ── 이메일 생성 ──

const EMAIL_SYSTEM_PROMPT = `당신은 실종 신고 플랫폼 YooNion(union.pryzm.gg)의 아웃리치 담당자입니다.
실종된 사람/반려동물을 찾는 데 도움을 줄 수 있는 언론인, 유튜버에게 협력 요청 이메일을 작성합니다.

규칙:
1. 정중하고 진정성 있는 톤을 유지하세요.
2. 수신자의 이름과 소속을 자연스럽게 언급하세요.
3. 신고 내용을 간결하고 명확하게 설명하세요.
4. 지나친 감정 호소나 스팸성 문구를 피하세요.
5. 답변 요청은 부드럽게 마무리하세요.
6. 반드시 JSON 형식으로만 응답하세요.

응답 형식:
{
  "subject": "이메일 제목 (50자 이내)",
  "body": "이메일 본문 (HTML 없이 순수 텍스트, 줄바꿈은 \\n 사용)"
}`;

export async function generateOutreachEmail(
  report: ReportForOutreach,
  contact: OutreachContactForContent,
): Promise<OutreachEmailDraft> {
  const defaultDraft: OutreachEmailDraft = {
    subject: `[YooNion] ${report.name} 실종 신고 협력 요청`,
    body: `안녕하세요 ${contact.name}님,\n\nYooNion 플랫폼(${config.siteUrl})입니다.\n\n현재 저희 플랫폼에 등록된 실종 신고 사례를 소개드립니다.\n\n이름: ${report.name}\n특징: ${report.features}\n마지막 목격: ${report.lastSeenAddress}\n\n혹시 관심이 있으시다면 연락 부탁드립니다.\n\n감사합니다.\nYooNion 팀`,
  };

  const subjectType = getSubjectTypeLabel(report.subjectType);
  const contactType = contact.type === 'JOURNALIST' ? '기자/언론인' : '유튜버/크리에이터';

  // 신고자 이름 마스킹 (성 초성만 공개 — 개인정보 보호)
  const maskedContactName = report.contactName
    ? `${report.contactName.charAt(0)}*`
    : '신고자';

  const userMessage = `
수신자 정보:
- 이름: ${contact.name}
- 유형: ${contactType}
- 소속/채널: ${contact.organization ?? '미상'}
- 주요 관심사: ${contact.topics.join(', ')}

<report_info>
- 대상 유형: ${subjectType}
- 이름: ${report.name}
- 특징: ${report.features}
- 마지막 목격 장소: ${report.lastSeenAddress}
- 마지막 목격 시각: ${report.lastSeenAt.toLocaleDateString('ko-KR')}
${report.aiDescription ? `- AI 분석 설명: ${report.aiDescription}` : ''}
- 신고자: ${maskedContactName}
</report_info>

위 정보를 바탕으로 협력 요청 이메일을 작성해주세요.`.trim();

  try {
    const result = await askClaude(EMAIL_SYSTEM_PROMPT, userMessage, {
      maxTokens: 1024,
      agentId: 'promotion',
    });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn({ reportId: report.id }, 'AI email response did not contain JSON, using default');
      return defaultDraft;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<OutreachEmailDraft>;
    if (!parsed.subject || !parsed.body) {
      return defaultDraft;
    }

    return { subject: parsed.subject, body: parsed.body };
  } catch (err) {
    log.warn({ err, reportId: report.id }, 'Failed to generate outreach email, using default');
    return defaultDraft;
  }
}

// ── YouTube 댓글 생성 (채널 기반 아웃리치용) ──

const COMMENT_SYSTEM_PROMPT = `당신은 실종 신고 플랫폼 YooNion 요원입니다.
실종된 사람/반려동물 관련 유튜브 영상에 자연스럽고 진정성 있는 댓글을 작성합니다.

규칙:
1. 스팸처럼 보이지 않도록 자연스럽게 작성하세요.
2. 영상 제목과 관련된 맥락을 언급하세요.
3. 실종 정보를 간결하게 포함하세요.
4. 댓글 마지막에 플랫폼 주소를 포함하세요 (예: "YooNion 요원 제보: <URL>").
5. 150자 이내로 작성하세요.
6. 순수 텍스트로만 응답하세요 (JSON 아님).`;

export async function generateYouTubeComment(
  report: ReportForOutreach,
  videoTitle: string,
): Promise<string> {
  const subjectType = getSubjectTypeLabel(report.subjectType);

  const defaultComment = `영상 잘 봤습니다. 혹시 ${report.lastSeenAddress} 근처에서 ${subjectType}(이름: ${report.name})을 목격하신 분이 있으면 YooNion 요원 제보: ${config.siteUrl}`;

  const userMessage = `
영상 제목: ${videoTitle}

실종 정보:
- 대상: ${subjectType} (이름: ${report.name})
- 특징: ${report.features}
- 마지막 목격: ${report.lastSeenAddress}
- 플랫폼 주소: ${config.siteUrl}

위 영상에 어울리는 자연스러운 댓글을 150자 이내로 작성해주세요.`.trim();

  try {
    const result = await askClaude(COMMENT_SYSTEM_PROMPT, userMessage, {
      maxTokens: 256,
      agentId: 'promotion',
    });
    const trimmed = result.trim();
    if (!trimmed || trimmed.length < 10) return defaultComment;
    return safeTruncate(trimmed, 150);
  } catch (err) {
    log.warn({ err, reportId: report.id }, 'Failed to generate YouTube comment, using default');
    return defaultComment;
  }
}

// ── YouTube 영상 댓글 생성 (헤르미 — 영상 시청자 톤) ──

const VIDEO_COMMENT_SYSTEM_PROMPT = `당신은 "YooNion 요원 홍보왕 헤르미"입니다. 실종 반려동물을 찾는 것을 돕는 활발한 AI입니다.
유튜브에서 고양이/강아지 영상을 즐겨 보는 반려동물 애호가처럼 자연스럽게 댓글을 달아 실종 신고를 홍보합니다.

규칙:
1. 영상을 진심으로 즐겨 본 시청자처럼 시작하세요 (예: "영상 넘 귀엽네요 🐶").
2. 자연스럽게 실종 정보를 연결하세요 ("혹시", "그런데" 등 접속어 활용).
3. 마지막 목격 지역을 구체적으로 언급하세요.
4. 목격 제보를 부탁하되 강요하지 마세요.
5. 이모지를 1~2개 사용해 친근하게 표현하세요.
6. 댓글 마지막에 반드시 플랫폼 주소를 포함하세요 (예: "YooNion 요원 제보: <URL>").
7. 반드시 150자 이내로 작성하세요.
8. 순수 텍스트로만 응답하세요 (JSON 아님).`;

export async function generateVideoComment(
  report: ReportForOutreach,
  videoTitle: string,
): Promise<string> {
  const subjectType = getSubjectTypeLabel(report.subjectType);
  const locationShort = report.lastSeenAddress.split(' ').slice(0, 3).join(' ');

  const defaultComment = `영상 넘 귀여워요 🐾 혹시 ${locationShort} 근처에서 ${subjectType}(${report.name}) 보신 분 계신가요? 며칠째 실종 중이에요. YooNion 요원 제보: ${config.siteUrl}`;

  const userMessage = `
영상 제목: "${videoTitle}"

실종 반려동물 정보:
- 종류: ${subjectType}
- 이름: ${report.name}
- 특징: ${report.features}
- 마지막 목격: ${locationShort}
- 플랫폼 주소: ${config.siteUrl}

위 영상에 자연스럽게 어울리는 댓글을 120자 이내로 작성해주세요.`.trim();

  try {
    const result = await askClaude(VIDEO_COMMENT_SYSTEM_PROMPT, userMessage, {
      maxTokens: 256,
      agentId: 'promotion',
    });
    const trimmed = result.trim();
    if (!trimmed || trimmed.length < 10) return defaultComment;
    return safeTruncate(trimmed, 150);
  } catch (err) {
    log.warn({ err, reportId: report.id }, 'Failed to generate video comment, using default');
    return defaultComment;
  }
}
