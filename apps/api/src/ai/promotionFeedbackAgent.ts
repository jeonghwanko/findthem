import { askClaude } from './claudeClient.js';
import { MIN_VIEWS_FOR_GOOD_PERFORMANCE, type PromotionMetrics, type PromoPlatform } from '@findthem/shared';

export interface PerformanceAnalysisResult {
  shouldRepost: boolean;
  improvementSuggestions: string[];
  suggestedChanges: string;
}

const FEEDBACK_SYSTEM_PROMPT = `당신은 SNS 마케팅 성과 분석 전문가입니다.
실종자/반려동물 찾기 게시물의 성과 데이터를 분석하고, 재게시 필요성과 개선 방향을 JSON으로 반환하세요.

판단 기준:
- shouldRepost: 조회수가 기준치 미만이거나 공유/리트윗이 낮으면 true
- improvementSuggestions: 구체적인 개선 방향 (2~4개)
- suggestedChanges: 다음 게시물에 반영할 구체적인 문구 변경 제안

반드시 아래 JSON 형식만 반환하세요:
{
  "shouldRepost": true | false,
  "improvementSuggestions": ["제안1", "제안2"],
  "suggestedChanges": "구체적인 변경 제안"
}`;

const DEFAULT_RESULT: PerformanceAnalysisResult = {
  shouldRepost: false,
  improvementSuggestions: ['성과 분석 불가 — 기본값 반환'],
  suggestedChanges: '',
};

export async function analyzePerformance(
  metrics: PromotionMetrics,
  content: string,
  platform: PromoPlatform,
): Promise<PerformanceAnalysisResult> {
  const context = [
    `[플랫폼: ${platform}]`,
    `[게시 성과]`,
    `조회수: ${metrics.views}`,
    `좋아요: ${metrics.likes}`,
    `리트윗: ${metrics.retweets}`,
    `공유: ${metrics.shares}`,
    `댓글: ${metrics.replies}`,
    `조회수 기준치: ${MIN_VIEWS_FOR_GOOD_PERFORMANCE}`,
    ``,
    `[게시 내용]`,
    content,
  ].join('\n');

  try {
    const result = await askClaude(FEEDBACK_SYSTEM_PROMPT, context, { maxTokens: 512 });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return DEFAULT_RESULT;

    const parsed = JSON.parse(jsonMatch[0]) as Partial<PerformanceAnalysisResult>;

    return {
      shouldRepost: typeof parsed.shouldRepost === 'boolean' ? parsed.shouldRepost : false,
      improvementSuggestions: Array.isArray(parsed.improvementSuggestions)
        ? (parsed.improvementSuggestions as string[])
        : [],
      suggestedChanges:
        typeof parsed.suggestedChanges === 'string' ? parsed.suggestedChanges : '',
    };
  } catch {
    return DEFAULT_RESULT;
  }
}
