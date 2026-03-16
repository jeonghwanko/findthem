import { askClaude } from './claudeClient.js';
import type { SubjectType } from '@findthem/shared';

export interface ParsedSocialPost {
  subjectType: SubjectType;
  name: string;
  features: string;
  location: string;
  estimatedDate: string;
  photoUrl?: string;
}

const SYSTEM_PROMPT = `당신은 소셜 미디어 게시글에서 실종 정보를 추출하는 전문가입니다.
게시글 제목과 본문을 분석하여 실종 신고인지 판단하고, 구조화된 정보를 추출하세요.

판단 기준:
- 실제 실종/유기/발견 신고만 추출 (뉴스 기사, 광고, 일반 대화는 제외)
- 강아지/고양이/사람 중 하나에 해당해야 함

반드시 아래 JSON 형식만 반환하세요:
실종 신고가 아니면: { "isMissing": false }
실종 신고이면:
{
  "isMissing": true,
  "subjectType": "DOG" | "CAT" | "PERSON",
  "name": "실종 대상 이름 또는 설명 (예: '말티즈', '검은 고양이', '80세 할머니')",
  "features": "외형 특징, 상태 등 (최대 200자)",
  "location": "실종/발견 장소 (시/구 단위)",
  "estimatedDate": "YYYY-MM-DD 형식 (추정 날짜, 없으면 오늘 날짜)",
  "photoUrl": "게시글에 언급된 이미지 URL (없으면 null)"
}`;

const DEFAULT_RESULT = null;

export async function parseSocialPost(
  title: string,
  description: string,
): Promise<ParsedSocialPost | null> {
  const input = `[제목] ${title}\n\n[본문]\n${description}`;

  try {
    const result = await askClaude(SYSTEM_PROMPT, input, { maxTokens: 512 });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return DEFAULT_RESULT;

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    if (!parsed.isMissing) return DEFAULT_RESULT;

    const subjectType = parsed.subjectType as string;
    if (subjectType !== 'DOG' && subjectType !== 'CAT' && subjectType !== 'PERSON') {
      return DEFAULT_RESULT;
    }

    return {
      subjectType,
      name: typeof parsed.name === 'string' ? parsed.name.slice(0, 100) : '정보 없음',
      features: typeof parsed.features === 'string' ? parsed.features.slice(0, 300) : '',
      location: typeof parsed.location === 'string' ? parsed.location : '장소 미상',
      estimatedDate: typeof parsed.estimatedDate === 'string' ? parsed.estimatedDate : new Date().toISOString().split('T')[0],
      photoUrl: typeof parsed.photoUrl === 'string' && parsed.photoUrl.startsWith('http') ? parsed.photoUrl : undefined,
    };
  } catch {
    return DEFAULT_RESULT;
  }
}
