import type { SubjectType } from '@findthem/shared';
import { askClaudeWithImage } from '../../ai/claudeClient.js';
import { imageService } from '../../services/imageService.js';

export interface PhotoAnalysisResult {
  description: string;
  features: string[];
  subjectType?: SubjectType;
}

export async function analyzePhoto(
  photoUrl: string,
  subjectType?: SubjectType,
): Promise<PhotoAnalysisResult> {
  const fallback: PhotoAnalysisResult = { description: '사진 분석을 수행할 수 없습니다', features: [] };

  let base64: string;
  try {
    base64 = await imageService.toBase64(photoUrl);
  } catch {
    return fallback;
  }

  try {
    const subjectHint = subjectType
      ? `대상 유형: ${subjectType === 'PERSON' ? '사람' : subjectType === 'DOG' ? '강아지' : '고양이'}`
      : '대상 유형은 이미지에서 판단해주세요';

    const systemPrompt = `당신은 실종자/반려동물 사진을 분석하는 전문가입니다.
이미지를 분석하여 JSON 형식으로만 응답하세요.
응답 형식:
{
  "description": "한국어로 외형 특징 설명 (색상, 크기, 특징, 옷차림 등)",
  "features": ["특징1", "특징2", ...],
  "subjectType": "PERSON" | "DOG" | "CAT"
}`;

    const result = await askClaudeWithImage(
      systemPrompt,
      base64,
      `${subjectHint}. 이 이미지를 분석하여 JSON으로 응답하세요.`,
      { maxTokens: 512 },
    );

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback;

    const parsed = JSON.parse(jsonMatch[0]) as Partial<PhotoAnalysisResult>;
    return {
      description: parsed.description ?? '설명 없음',
      features: Array.isArray(parsed.features) ? parsed.features : [],
      subjectType: parsed.subjectType,
    };
  } catch {
    return fallback;
  }
}
