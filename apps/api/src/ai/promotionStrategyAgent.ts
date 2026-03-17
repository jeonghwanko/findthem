import { askClaude, askClaudeWithImage } from './aiClient.js';
import {
  getSubjectTypeLabel,
  REPOST_INTERVAL_HIGH,
  REPOST_INTERVAL_MEDIUM,
  REPOST_INTERVAL_LOW,
  REPOST_MAX_DEFAULT,
  type PromoUrgency,
  type PromoPlatform,
} from '@findthem/shared';

export interface StrategyReportInput {
  subjectType: string;
  name: string;
  age?: string | null;
  features: string;
  lastSeenAddress: string;
  lastSeenAt: Date;
  aiDescription?: string | null;
}

export interface PromotionStrategyResult {
  urgency: PromoUrgency;
  targetPlatforms: PromoPlatform[];
  repostIntervalH: number;
  maxReposts: number;
  keywords: string[];
  hashtags: string[];
  reasoning: string;
}

const STRATEGY_SYSTEM_PROMPT = `당신은 실종자/반려동물 찾기 플랫폼의 SNS 홍보 전략 전문가입니다.
주어진 신고 정보를 분석하여 최적의 홍보 전략을 JSON으로 반환하세요.

긴급도 판단 기준:
- HIGH (24시간 간격): 아동(10세 미만), 치매/노인(60세 이상), 실종 후 48시간 미만
- MEDIUM (72시간 간격): 일반 성인, 반려동물, 기본 정보 충분
- LOW (168시간 간격): 정보 부족, 장기 실종(30일 이상), 특이사항 없음

플랫폼 선택:
- TWITTER: 빠른 확산이 필요한 경우, 해시태그 홍보 효과
- KAKAO_CHANNEL: 지역 기반 제보 유도, 카카오 사용자 도달

반드시 아래 JSON 형식만 반환하세요:
{
  "urgency": "HIGH" | "MEDIUM" | "LOW",
  "targetPlatforms": ["TWITTER", "KAKAO_CHANNEL"],
  "repostIntervalH": 24 | 72 | 168,
  "maxReposts": 3,
  "keywords": ["키워드1", "키워드2"],
  "hashtags": ["#실종", "#찾아주세요"],
  "reasoning": "판단 근거 (한국어)"
}`;

function buildStrategyContext(report: StrategyReportInput): string {
  const typeLabel = getSubjectTypeLabel(report.subjectType);
  const lines = [
    `[실종 신고 정보]`,
    `유형: ${typeLabel}`,
    `이름: ${report.name}`,
  ];
  if (report.age) lines.push(`나이: ${report.age}`);
  lines.push(`특징: ${report.features}`);
  lines.push(`마지막 목격 장소: ${report.lastSeenAddress}`);
  lines.push(`마지막 목격 시간: ${report.lastSeenAt.toLocaleString('ko-KR')}`);
  if (report.aiDescription) lines.push(`AI 분석 설명: ${report.aiDescription}`);

  const daysSince = Math.floor(
    (Date.now() - report.lastSeenAt.getTime()) / (1000 * 60 * 60 * 24),
  );
  lines.push(`실종 경과 일수: ${daysSince}일`);

  return lines.join('\n');
}

const DEFAULT_STRATEGY: PromotionStrategyResult = {
  urgency: 'MEDIUM',
  targetPlatforms: ['TWITTER', 'KAKAO_CHANNEL'],
  repostIntervalH: REPOST_INTERVAL_MEDIUM,
  maxReposts: REPOST_MAX_DEFAULT,
  keywords: ['실종', '찾아주세요'],
  hashtags: ['#실종', '#찾아주세요', '#FindThem'],
  reasoning: '기본 전략 (AI 분석 실패)',
};

function parseIntervalH(urgency: PromoUrgency): number {
  switch (urgency) {
    case 'HIGH':
      return REPOST_INTERVAL_HIGH;
    case 'LOW':
      return REPOST_INTERVAL_LOW;
    default:
      return REPOST_INTERVAL_MEDIUM;
  }
}

export async function determineStrategy(
  report: StrategyReportInput,
  photoBase64?: string,
): Promise<PromotionStrategyResult> {
  const context = buildStrategyContext(report);

  try {
    const result = photoBase64
      ? await askClaudeWithImage(STRATEGY_SYSTEM_PROMPT, photoBase64, context, { maxTokens: 512, agentId: 'promotion' })
      : await askClaude(STRATEGY_SYSTEM_PROMPT, context, { maxTokens: 512, agentId: 'promotion' });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return DEFAULT_STRATEGY;

    const parsed = JSON.parse(jsonMatch[0]) as Partial<PromotionStrategyResult>;

    const urgency: PromoUrgency =
      parsed.urgency === 'HIGH' || parsed.urgency === 'LOW' ? parsed.urgency : 'MEDIUM';

    const targetPlatforms: PromoPlatform[] =
      Array.isArray(parsed.targetPlatforms) && parsed.targetPlatforms.length > 0
        ? (parsed.targetPlatforms.filter(
            (p) => p === 'TWITTER' || p === 'KAKAO_CHANNEL',
          ) as PromoPlatform[])
        : ['TWITTER', 'KAKAO_CHANNEL'];

    return {
      urgency,
      targetPlatforms,
      repostIntervalH:
        typeof parsed.repostIntervalH === 'number'
          ? parsed.repostIntervalH
          : parseIntervalH(urgency),
      maxReposts:
        typeof parsed.maxReposts === 'number' ? parsed.maxReposts : REPOST_MAX_DEFAULT,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : ['실종'],
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String) : ['#실종'],
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    };
  } catch {
    return DEFAULT_STRATEGY;
  }
}
