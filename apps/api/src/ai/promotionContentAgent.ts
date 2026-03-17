import { askClaude, askClaudeWithImage } from './aiClient.js';
import { getSubjectTypeLabel, type PlatformPromoTexts, type PromotionMetrics } from '@findthem/shared';

// 기존 generatePromoTexts re-export
export { generatePromoTexts } from './promotionAgent.js';

interface RepostReportInput {
  subjectType: string;
  name: string;
  features: string;
  lastSeenAddress: string;
  lastSeenAt: Date;
  contactPhone: string;
  contactName: string;
}

const REPOST_SYSTEM_PROMPT = `당신은 실종자/반려동물 찾기 서비스의 SNS 홍보 문구 작성 AI입니다.
이전에 게시된 홍보 문구가 충분한 반응을 얻지 못했거나 재홍보가 필요한 상황입니다.
성과 데이터를 참고하여 더 효과적인 새로운 문구를 작성하세요.

규칙:
- 이전 문구와 다른 표현, 다른 강조점 사용
- 경과 시간을 반영하여 긴급성 강조
- 핵심 식별 정보(특징, 장소, 시간)는 반드시 유지
- 연락처 정보 포함 필수

반드시 아래 JSON 형식만 반환하세요:
{
  "kakao": "카카오톡용 (500자 이내, 이모지 사용, 구조화 형태)",
  "twitter": "X/트위터용 (250자 이내, 해시태그 포함)",
  "general": "일반 홍보용 (300자 이내)"
}`;

const THANK_YOU_SYSTEM_PROMPT = `당신은 실종자/반려동물 찾기 서비스의 SNS 홍보 문구 작성 AI입니다.
실종된 대상이 발견되었습니다. 도움을 주신 분들께 감사 인사 및 발견 소식을 전하는 문구를 작성하세요.

규칙:
- 따뜻하고 긍정적인 어조
- 도움 주신 모든 분들께 감사 표현
- 서비스 홍보 요소 자연스럽게 포함 가능

반드시 아래 JSON 형식만 반환하세요:
{
  "kakao": "카카오톡용 (500자 이내, 이모지 사용)",
  "twitter": "X/트위터용 (250자 이내, 해시태그 포함)",
  "general": "일반용 (300자 이내)"
}`;

function buildRepostContext(
  report: RepostReportInput,
  previousContent: string,
  metrics: PromotionMetrics | null,
  version: number,
): string {
  const typeLabel = getSubjectTypeLabel(report.subjectType);
  const daysSince = Math.floor(
    (Date.now() - report.lastSeenAt.getTime()) / (1000 * 60 * 60 * 24),
  );

  const lines = [
    `[실종 신고 정보 - ${version}차 재홍보]`,
    `유형: ${typeLabel}`,
    `이름: ${report.name}`,
    `특징: ${report.features}`,
    `마지막 목격 장소: ${report.lastSeenAddress}`,
    `마지막 목격 시간: ${report.lastSeenAt.toLocaleString('ko-KR')}`,
    `실종 경과 일수: ${daysSince}일`,
    `연락처: ${report.contactName} ${report.contactPhone}`,
    ``,
    `[이전 홍보 문구]`,
    previousContent,
  ];

  if (metrics) {
    lines.push(
      ``,
      `[이전 게시물 성과]`,
      `조회수: ${metrics.views}`,
      `좋아요: ${metrics.likes}`,
      `리트윗/공유: ${metrics.retweets + metrics.shares}`,
      `댓글: ${metrics.replies}`,
    );
  }

  return lines.join('\n');
}

const DEFAULT_PROMO_TEXTS: PlatformPromoTexts = {
  kakao: '🔍 실종 신고가 접수되었습니다. 목격하신 분은 연락 부탁드립니다.',
  twitter: '🔍 실종 신고 #실종 #찾아주세요',
  general: '실종 신고가 접수되었습니다. 목격 정보를 제공해 주세요.',
};

export async function generateRepostContent(
  report: RepostReportInput,
  photoBase64: string,
  previousContent: string,
  metrics: PromotionMetrics | null,
  version: number,
): Promise<PlatformPromoTexts> {
  const context = buildRepostContext(report, previousContent, metrics, version);

  try {
    const result = await askClaudeWithImage(REPOST_SYSTEM_PROMPT, photoBase64, context, {
      maxTokens: 1024, agentId: 'promotion',
    });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return DEFAULT_PROMO_TEXTS;
    return JSON.parse(jsonMatch[0]) as PlatformPromoTexts;
  } catch {
    return DEFAULT_PROMO_TEXTS;
  }
}

export async function generateThankYouMessage(report: RepostReportInput): Promise<PlatformPromoTexts> {
  const typeLabel = getSubjectTypeLabel(report.subjectType);
  const context = [
    `[발견 완료 신고]`,
    `유형: ${typeLabel}`,
    `이름: ${report.name}`,
    `마지막 목격 장소: ${report.lastSeenAddress}`,
    `실종 기간: ${Math.floor(
      (Date.now() - report.lastSeenAt.getTime()) / (1000 * 60 * 60 * 24),
    )}일`,
  ].join('\n');

  try {
    const result = await askClaude(THANK_YOU_SYSTEM_PROMPT, context, { maxTokens: 512, agentId: 'promotion' });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return DEFAULT_PROMO_TEXTS;
    return JSON.parse(jsonMatch[0]) as PlatformPromoTexts;
  } catch {
    return {
      kakao: `${typeLabel} "${report.name}"을(를) 찾았습니다! 도움 주신 모든 분들께 감사드립니다. 🙏`,
      twitter: `발견 완료 🎉 "${report.name}" 찾았습니다! 감사합니다. #FindThem #실종`,
      general: `"${report.name}" 발견 완료. 제보해 주신 모든 분들께 감사드립니다.`,
    };
  }
}
