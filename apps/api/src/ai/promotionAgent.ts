import { askClaudeWithImage } from './claudeClient.js';
import { getSubjectTypeLabel } from '@findthem/shared';
import type { PlatformPromoTexts } from '@findthem/shared';

interface ReportInfo {
  subjectType: string;
  name: string;
  species?: string | null;
  gender?: string | null;
  age?: string | null;
  color?: string | null;
  features: string;
  clothingDesc?: string | null;
  lastSeenAt: Date;
  lastSeenAddress: string;
  contactPhone: string;
  contactName: string;
  reward?: string | null;
}

const SYSTEM_PROMPT = `당신은 실종자/실종 반려동물 찾기 서비스의 홍보 문구 작성 AI입니다.
주어진 정보와 사진을 바탕으로 각 SNS 플랫폼에 적합한 홍보 글을 작성하세요.

규칙:
- 긴급성을 전달하되, 과도한 공포감 조성은 피하세요
- 연락처 정보를 반드시 포함하세요
- 핵심 식별 정보(특징, 마지막 목격 장소/시간)를 빠뜨리지 마세요
- 사진에서 보이는 특징도 반영하세요

응답은 반드시 아래 JSON 형식으로:
{
  "kakao": "카카오톡용 (500자 이내, 이모지 적절히 사용, 구조화된 형태)",
  "twitter": "X/트위터용 (250자 이내, 해시태그 포함: #실종 #찾아주세요)",
  "general": "일반 홍보용 (300자 이내, 공유에 적합한 형태)"
}`;

function buildReportContext(report: ReportInfo): string {
  const type = getSubjectTypeLabel(report.subjectType);
  const lines = [
    `[실종 ${type} 정보]`,
    `이름: ${report.name}`,
  ];
  if (report.species) lines.push(`품종: ${report.species}`);
  if (report.gender) lines.push(`성별: ${report.gender === 'MALE' ? '수컷/남성' : report.gender === 'FEMALE' ? '암컷/여성' : '모름'}`);
  if (report.age) lines.push(`나이: ${report.age}`);
  if (report.color) lines.push(`색상: ${report.color}`);
  lines.push(`특징: ${report.features}`);
  if (report.clothingDesc) lines.push(`의상: ${report.clothingDesc}`);
  lines.push(`마지막 목격: ${report.lastSeenAt.toLocaleString('ko-KR')}`);
  lines.push(`목격 장소: ${report.lastSeenAddress}`);
  lines.push(`연락처: ${report.contactName} ${report.contactPhone}`);
  if (report.reward) lines.push(`사례금: ${report.reward}`);

  return lines.join('\n');
}

export async function generatePromoTexts(
  report: ReportInfo,
  photoBase64: string,
): Promise<PlatformPromoTexts> {
  const context = buildReportContext(report);
  const result = await askClaudeWithImage(
    SYSTEM_PROMPT,
    photoBase64,
    context,
    { maxTokens: 1024 },
  );

  try {
    // JSON 블록 추출
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON not found in response');
    return JSON.parse(jsonMatch[0]) as PlatformPromoTexts;
  } catch {
    // 파싱 실패 시 전체 텍스트를 general로
    return {
      kakao: result,
      twitter: result.slice(0, 250),
      general: result,
    };
  }
}
