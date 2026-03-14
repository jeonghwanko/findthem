import { askClaudeWithImage, compareImages } from './claudeClient.js';
import { getSubjectTypeLabel, DEFAULT_LOCALE, type MatchResult, type Locale } from '@findthem/shared';

// ── analyzeImage 시스템 프롬프트 다국어 ──

const ANALYZE_IMAGE_PROMPTS: Record<Locale, {
  systemPrefix: string;
  systemBody: string;
  userMessage: string;
}> = {
  ko: {
    systemPrefix: '당신은 실종',
    systemBody: `식별 전문가입니다.
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
}`,
    userMessage: '를 식별하기 위한 특징을 분석해주세요.',
  },
  en: {
    systemPrefix: 'You are a missing',
    systemBody: `identification expert.
Analyze the photo and extract identifying features in structured JSON format.

JSON format:
{
  "species": "breed (for animals)",
  "color": "main color/coat color",
  "size": "estimated size (small/medium/large)",
  "distinctiveFeatures": ["feature1", "feature2"],
  "clothing": "clothing description (for people)",
  "accessories": "collar, glasses, etc.",
  "estimatedAge": "estimated age",
  "description": "overall description (2-3 sentences)"
}`,
    userMessage: 'Please analyze identifying features from this photo.',
  },
  ja: {
    systemPrefix: 'あなたは行方不明の',
    systemBody: `識別専門家です。
写真を分析し、識別に役立つ特徴を構造化されたJSONで抽出してください。

JSON形式：
{
  "species": "品種（動物の場合）",
  "color": "主な色／毛色",
  "size": "大きさの推定（小／中／大）",
  "distinctiveFeatures": ["特徴1", "特徴2"],
  "clothing": "服装の説明（人間の場合）",
  "accessories": "首輪、眼鏡などのアクセサリー",
  "estimatedAge": "推定年齢",
  "description": "総合説明（2〜3文）"
}`,
    userMessage: 'の識別のための特徴を分析してください。',
  },
  'zh-TW': {
    systemPrefix: '您是失蹤',
    systemBody: `識別專家。
請分析照片，以結構化JSON格式提取識別特徵。

JSON格式：
{
  "species": "品種（動物情況下）",
  "color": "主要顏色/毛色",
  "size": "大小估計（小/中/大）",
  "distinctiveFeatures": ["特徵1", "特徵2"],
  "clothing": "服裝描述（人物情況下）",
  "accessories": "項圈、眼鏡等配件",
  "estimatedAge": "估計年齡",
  "description": "綜合說明（2至3句）"
}`,
    userMessage: '的識別特徵，請分析此照片。',
  },
};

// ── matchImages 시스템 프롬프트 다국어 ──

const MATCH_IMAGES_PROMPTS: Record<Locale, {
  systemPrefix: string;
  systemSuffix: string;
  jsonFormat: string;
  notes: string;
  contextLabels: { report: string; features: string; aiAnalysis: string; sighting: string; description: string };
  userPrompt: string;
}> = {
  ko: {
    systemPrefix: '당신은 실종',
    systemSuffix: '매칭 전문가입니다.\n두 사진을 비교하여 같은',
    jsonFormat: `반드시 아래 JSON 형식으로 응답:
{
  "confidence": 0.0~1.0 사이 확신도,
  "reasoning": "판단 근거 설명 (한국어, 2~3문장)",
  "matchingFeatures": ["일치하는 특징 목록"],
  "differingFeatures": ["다른 특징 목록"]
}`,
    notes: `주의:
- 조명, 각도, 카메라 차이를 고려하세요
- 같은 품종이라고 해서 같은 개체는 아닙니다
- 확신이 어려우면 0.3~0.5 범위를 사용하세요`,
    contextLabels: {
      report: '[실종 신고 정보]',
      features: '특징',
      aiAnalysis: 'AI 분석',
      sighting: '[목격 제보 정보]',
      description: '설명',
    },
    userPrompt: '이 두 사진이 같은',
  },
  en: {
    systemPrefix: 'You are a missing',
    systemSuffix: 'matching expert.\nCompare the two photos to determine if they show the same',
    jsonFormat: `Respond strictly in the following JSON format:
{
  "confidence": confidence between 0.0 and 1.0,
  "reasoning": "reasoning explanation (English, 2-3 sentences)",
  "matchingFeatures": ["list of matching features"],
  "differingFeatures": ["list of differing features"]
}`,
    notes: `Notes:
- Consider differences in lighting, angle, and camera
- Same breed does not mean the same individual
- Use 0.3~0.5 range when uncertain`,
    contextLabels: {
      report: '[Missing Report Info]',
      features: 'Features',
      aiAnalysis: 'AI Analysis',
      sighting: '[Sighting Report Info]',
      description: 'Description',
    },
    userPrompt: 'Compare these two photos to determine if they are the same',
  },
  ja: {
    systemPrefix: 'あなたは行方不明の',
    systemSuffix: 'マッチング専門家です。\n2枚の写真を比較し、同じ',
    jsonFormat: `必ず以下のJSON形式で回答してください：
{
  "confidence": 0.0〜1.0の確信度,
  "reasoning": "判断根拠の説明（日本語、2〜3文）",
  "matchingFeatures": ["一致する特徴のリスト"],
  "differingFeatures": ["異なる特徴のリスト"]
}`,
    notes: `注意：
- 照明・角度・カメラの違いを考慮してください
- 同じ品種だからといって同一個体ではありません
- 確信が持てない場合は0.3〜0.5の範囲を使用してください`,
    contextLabels: {
      report: '[行方不明届情報]',
      features: '特徴',
      aiAnalysis: 'AI分析',
      sighting: '[目撃情報]',
      description: '説明',
    },
    userPrompt: 'この2枚の写真が同じ',
  },
  'zh-TW': {
    systemPrefix: '您是失蹤',
    systemSuffix: '配對專家。\n請比較兩張照片，判斷是否為同一',
    jsonFormat: `請嚴格以下列JSON格式回答：
{
  "confidence": 0.0到1.0之間的信心度,
  "reasoning": "判斷依據說明（繁體中文，2至3句）",
  "matchingFeatures": ["相符特徵列表"],
  "differingFeatures": ["不同特徵列表"]
}`,
    notes: `注意：
- 請考慮照明、角度、相機差異
- 相同品種不代表是同一個體
- 不確定時請使用0.3至0.5範圍`,
    contextLabels: {
      report: '[失蹤通報資訊]',
      features: '特徵',
      aiAnalysis: 'AI分析',
      sighting: '[目擊報告資訊]',
      description: '描述',
    },
    userPrompt: '請比較這兩張照片，判斷是否為同一',
  },
};

/** 사진에서 식별 특징 추출 */
export async function analyzeImage(
  photoBase64: string,
  subjectType: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<Record<string, unknown>> {
  const type = getSubjectTypeLabel(subjectType, locale);
  const prompt = ANALYZE_IMAGE_PROMPTS[locale];

  const systemPrompt = `${prompt.systemPrefix} ${type} ${prompt.systemBody}`;
  const userMessage = locale === 'ko' || locale === 'ja'
    ? `이 사진의 ${type}${prompt.userMessage}`
    : `${type} — ${prompt.userMessage}`;

  const result = await askClaudeWithImage(
    systemPrompt,
    photoBase64,
    userMessage,
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
  locale: Locale = DEFAULT_LOCALE,
): Promise<MatchResult> {
  const type = getSubjectTypeLabel(reportInfo.subjectType, locale);
  const p = MATCH_IMAGES_PROMPTS[locale];

  const systemPrompt = [
    `${p.systemPrefix} ${type} ${p.systemSuffix} ${type}인지 판단해주세요.`,
    '',
    p.jsonFormat,
    '',
    p.notes,
  ].join('\n');

  const context = [
    p.contextLabels.report,
    `${p.contextLabels.features}: ${reportInfo.features}`,
    reportInfo.aiDescription ? `${p.contextLabels.aiAnalysis}: ${reportInfo.aiDescription}` : '',
    '',
    p.contextLabels.sighting,
    `${p.contextLabels.description}: ${sightingInfo.description}`,
    sightingInfo.aiAnalysis
      ? `${p.contextLabels.aiAnalysis}: ${JSON.stringify(sightingInfo.aiAnalysis)}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const userMessage = locale === 'ko'
    ? `첫 번째 사진: 실종 신고된 ${type}\n두 번째 사진: 목격 제보\n\n${context}\n\n${p.userPrompt} ${type}인지 비교 분석해주세요.`
    : locale === 'ja'
    ? `1枚目：行方不明届の${type}\n2枚目：目撃情報\n\n${context}\n\n${p.userPrompt}${type}かどうか比較分析してください。`
    : locale === 'zh-TW'
    ? `第一張：失蹤通報的${type}\n第二張：目擊報告\n\n${context}\n\n${p.userPrompt}${type}。`
    : `Photo 1: Reported missing ${type}\nPhoto 2: Sighting report\n\n${context}\n\n${p.userPrompt} ${type}.`;

  const result = await compareImages(
    systemPrompt,
    reportPhotoBase64,
    sightingPhotoBase64,
    userMessage,
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
