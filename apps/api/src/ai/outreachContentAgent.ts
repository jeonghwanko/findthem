import { askClaude } from './claudeClient.js';
import { createLogger } from '../logger.js';

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

// ── 이메일 생성 ──

const EMAIL_SYSTEM_PROMPT = `당신은 실종 신고 플랫폼 FindThem의 아웃리치 담당자입니다.
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
    subject: `[FindThem] ${report.name} 실종 신고 협력 요청`,
    body: `안녕하세요 ${contact.name}님,\n\nFindThem 플랫폼입니다.\n\n현재 저희 플랫폼에 등록된 실종 신고 사례를 소개드립니다.\n\n이름: ${report.name}\n특징: ${report.features}\n마지막 목격: ${report.lastSeenAddress}\n\n혹시 관심이 있으시다면 연락 부탁드립니다.\n\n감사합니다.\nFindThem 팀`,
  };

  const subjectType =
    report.subjectType === 'DOG'
      ? '강아지'
      : report.subjectType === 'CAT'
        ? '고양이'
        : '사람';

  const contactType = contact.type === 'JOURNALIST' ? '기자/언론인' : '유튜버/크리에이터';

  // Mask the contact name for privacy — only show the surname initial
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
    const result = await askClaude(EMAIL_SYSTEM_PROMPT, userMessage, { maxTokens: 1024 });

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

// ── YouTube 댓글 생성 ──

const COMMENT_SYSTEM_PROMPT = `당신은 실종 신고 플랫폼 FindThem의 아웃리치 담당자입니다.
실종된 사람/반려동물 관련 유튜브 영상에 자연스럽고 진정성 있는 댓글을 작성합니다.

규칙:
1. 스팸처럼 보이지 않도록 자연스럽게 작성하세요.
2. 영상 제목과 관련된 맥락을 언급하세요.
3. 실종 정보를 간결하게 포함하세요.
4. 링크 대신 "FindThem 플랫폼"이라고만 언급하세요.
5. 150자 이내로 작성하세요.
6. 순수 텍스트로만 응답하세요 (JSON 아님).`;

export async function generateYouTubeComment(
  report: ReportForOutreach,
  videoTitle: string,
): Promise<string> {
  const subjectType =
    report.subjectType === 'DOG'
      ? '강아지'
      : report.subjectType === 'CAT'
        ? '고양이'
        : '실종자';

  const defaultComment = `영상 잘 봤습니다. 혹시 ${report.lastSeenAddress} 근처에서 ${subjectType}(이름: ${report.name})을 목격하신 분이 있으면 FindThem 플랫폼에 제보 부탁드립니다.`;

  const userMessage = `
영상 제목: ${videoTitle}

실종 정보:
- 대상: ${subjectType} (이름: ${report.name})
- 특징: ${report.features}
- 마지막 목격: ${report.lastSeenAddress}

위 영상에 어울리는 자연스러운 댓글을 150자 이내로 작성해주세요.`.trim();

  try {
    const result = await askClaude(COMMENT_SYSTEM_PROMPT, userMessage, { maxTokens: 256 });
    const trimmed = result.trim();
    if (!trimmed || trimmed.length < 10) return defaultComment;
    // 150자 초과 시 자름
    return trimmed.length > 150 ? trimmed.slice(0, 147) + '...' : trimmed;
  } catch (err) {
    log.warn({ err, reportId: report.id }, 'Failed to generate YouTube comment, using default');
    return defaultComment;
  }
}
