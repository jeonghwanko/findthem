import { askClaudeWithImage, compareImages } from './claudeClient.js';
import { getSubjectTypeLabel } from '@findthem/shared';
import type { MatchResult } from '@findthem/shared';

/** 사진에서 식별 특징 추출 */
export async function analyzeImage(
  photoBase64: string,
  subjectType: string,
): Promise<Record<string, unknown>> {
  const type = getSubjectTypeLabel(subjectType);

  const systemPrompt = `당신은 실종 ${type} 식별 전문가입니다.
사진을 분석하여 식별에 도움이 되는 특징을 구조화된 JSON으로 추출하세요.

JSON 형식:
{
  "species": "품종 (동물인 경우)",
  "color": "주요 색상/털색",
  "size": "크기 추정 (소/중/대)",
  "distinctiveFeatures": ["특징1", "특징2"],
  "clothing": "의상 설명 (사람인 경우)",
  "accessories": "목줄, 안경 등 액세서리",
  "estimatedAge": "추정 나이",
  "description": "종합 설명 (2~3문장)"
}`;

  const result = await askClaudeWithImage(
    systemPrompt,
    photoBase64,
    `이 사진의 ${type}를 식별하기 위한 특징을 분석해주세요.`,
  );

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { description: result };
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { description: result };
  }
}

/** 두 사진 비교 매칭 */
export async function matchImages(
  reportPhotoBase64: string,
  sightingPhotoBase64: string,
  reportInfo: {
    subjectType: string;
    features: string;
    aiDescription?: string | null;
  },
  sightingInfo: {
    description: string;
    aiAnalysis?: Record<string, unknown> | null;
  },
): Promise<MatchResult> {
  const type = getSubjectTypeLabel(reportInfo.subjectType);

  const systemPrompt = `당신은 실종 ${type} 매칭 전문가입니다.
두 사진을 비교하여 같은 ${type}인지 판단해주세요.

반드시 아래 JSON 형식으로 응답:
{
  "confidence": 0.0~1.0 사이 확신도,
  "reasoning": "판단 근거 설명 (한국어, 2~3문장)",
  "matchingFeatures": ["일치하는 특징 목록"],
  "differingFeatures": ["다른 특징 목록"]
}

주의:
- 조명, 각도, 카메라 차이를 고려하세요
- 같은 품종이라고 해서 같은 개체는 아닙니다
- 확신이 어려우면 0.3~0.5 범위를 사용하세요`;

  const context = [
    `[실종 신고 정보]`,
    `특징: ${reportInfo.features}`,
    reportInfo.aiDescription ? `AI 분석: ${reportInfo.aiDescription}` : '',
    ``,
    `[목격 제보 정보]`,
    `설명: ${sightingInfo.description}`,
    sightingInfo.aiAnalysis
      ? `AI 분석: ${JSON.stringify(sightingInfo.aiAnalysis)}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const result = await compareImages(
    systemPrompt,
    reportPhotoBase64,
    sightingPhotoBase64,
    `첫 번째 사진: 실종 신고된 ${type}\n두 번째 사진: 목격 제보\n\n${context}\n\n이 두 사진이 같은 ${type}인지 비교 분석해주세요.`,
    { maxTokens: 1024 },
  );

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON not found');
    return JSON.parse(jsonMatch[0]) as MatchResult;
  } catch {
    return {
      confidence: 0,
      reasoning: result,
      matchingFeatures: [],
      differingFeatures: [],
    };
  }
}
