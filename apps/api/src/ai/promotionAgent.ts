import { askClaudeWithImage } from './aiClient.js';
import { getSubjectTypeLabel, DEFAULT_LOCALE, type PlatformPromoTexts, type Locale } from '@findthem/shared';

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

// ── 시스템 프롬프트 다국어 맵 ──

const SYSTEM_PROMPTS: Record<Locale, string> = {
  ko: `당신은 실종자/실종 반려동물 찾기 서비스의 홍보 문구 작성 AI입니다.
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
  "instagram": "인스타그램용 (2200자 이내, 감성적 스토리텔링, 해시태그 최대 30개, 이모지 적극 활용)",
  "general": "일반 홍보용 (300자 이내, 공유에 적합한 형태)"
}`,

  en: `You are an AI that writes promotional content for a missing person/pet search service.
Based on the provided information and photo, write appropriate promotional text for each SNS platform.

Rules:
- Convey urgency without causing excessive panic
- Always include contact information
- Do not omit key identifying information (features, last seen location/time)
- Reflect features visible in the photo

Respond strictly in the following JSON format:
{
  "kakao": "For messaging app (within 500 chars, use emojis appropriately, structured format)",
  "twitter": "For X/Twitter (within 250 chars, include hashtags: #missing #helpfind)",
  "instagram": "For Instagram (within 2200 chars, emotional storytelling, up to 30 hashtags, use emojis freely)",
  "general": "General promo (within 300 chars, suitable for sharing)"
}`,

  ja: `あなたは行方不明者・行方不明ペット捜索サービスの広報文を作成するAIです。
提供された情報と写真をもとに、各SNSプラットフォームに適した広報文を作成してください。

ルール：
- 緊急性を伝えながら、過度な恐怖感を与えないようにしてください
- 連絡先情報を必ず含めてください
- 主要な識別情報（特徴、最終目撃場所・時刻）を省略しないでください
- 写真から見える特徴も反映してください

必ず以下のJSON形式で回答してください：
{
  "kakao": "メッセージアプリ用（500文字以内、絵文字適切に使用、構造化形式）",
  "twitter": "X/Twitter用（250文字以内、ハッシュタグ含む: #行方不明 #見つけてください）",
  "instagram": "Instagram用（2200文字以内、感情的なストーリーテリング、ハッシュタグ最大30個、絵文字積極活用）",
  "general": "一般広報用（300文字以内、シェアに適した形式）"
}`,

  'zh-TW': `您是一個為失蹤人口/失蹤寵物搜尋服務撰寫宣傳文案的AI。
請根據提供的資訊和照片，為各個SNS平台撰寫適合的宣傳文字。

規則：
- 傳達緊迫感，但避免引起過度恐慌
- 必須包含聯絡資訊
- 不要遺漏關鍵識別資訊（特徵、最後目擊地點/時間）
- 也要反映照片中可見的特徵

請嚴格以下列JSON格式回答：
{
  "kakao": "訊息應用程式用（500字以內，適當使用表情符號，結構化格式）",
  "twitter": "X/Twitter用（250字以內，含標籤：#失蹤 #請幫忙找）",
  "instagram": "Instagram用（2200字以內，情感化故事敘述，最多30個標籤，積極使用表情符號）",
  "general": "一般宣傳用（300字以內，適合分享的格式）"
}`,
};

// ── 컨텍스트 레이블 다국어 맵 ──

const CONTEXT_LABELS: Record<Locale, {
  headerPrefix: string;
  name: string;
  species: string;
  gender: { label: string; male: string; female: string; unknown: string };
  age: string;
  color: string;
  features: string;
  clothing: string;
  lastSeen: string;
  location: string;
  contact: string;
  reward: string;
  localeTag: string;
}> = {
  ko: {
    headerPrefix: '[실종',
    name: '이름',
    species: '품종',
    gender: { label: '성별', male: '수컷/남성', female: '암컷/여성', unknown: '모름' },
    age: '나이',
    color: '색상',
    features: '특징',
    clothing: '의상',
    lastSeen: '마지막 목격',
    location: '목격 장소',
    contact: '연락처',
    reward: '사례금',
    localeTag: 'ko-KR',
  },
  en: {
    headerPrefix: '[Missing',
    name: 'Name',
    species: 'Breed',
    gender: { label: 'Gender', male: 'Male', female: 'Female', unknown: 'Unknown' },
    age: 'Age',
    color: 'Color',
    features: 'Features',
    clothing: 'Clothing',
    lastSeen: 'Last Seen',
    location: 'Location',
    contact: 'Contact',
    reward: 'Reward',
    localeTag: 'en-US',
  },
  ja: {
    headerPrefix: '[行方不明の',
    name: '名前',
    species: '品種',
    gender: { label: '性別', male: 'オス/男性', female: 'メス/女性', unknown: '不明' },
    age: '年齢',
    color: '色',
    features: '特徴',
    clothing: '服装',
    lastSeen: '最終目撃',
    location: '目撃場所',
    contact: '連絡先',
    reward: '謝礼',
    localeTag: 'ja-JP',
  },
  'zh-TW': {
    headerPrefix: '[失蹤的',
    name: '名字',
    species: '品種',
    gender: { label: '性別', male: '雄/男性', female: '雌/女性', unknown: '不明' },
    age: '年齡',
    color: '顏色',
    features: '特徵',
    clothing: '服裝',
    lastSeen: '最後目擊',
    location: '目擊地點',
    contact: '聯絡方式',
    reward: '酬謝金',
    localeTag: 'zh-TW',
  },
};

function buildReportContext(report: ReportInfo, locale: Locale): string {
  const type = getSubjectTypeLabel(report.subjectType, locale);
  const l = CONTEXT_LABELS[locale];

  const lines = [
    `${l.headerPrefix} ${type} 정보]`,
    `${l.name}: ${report.name}`,
  ];
  if (report.species) lines.push(`${l.species}: ${report.species}`);
  if (report.gender) {
    const genderText =
      report.gender === 'MALE' ? l.gender.male
      : report.gender === 'FEMALE' ? l.gender.female
      : l.gender.unknown;
    lines.push(`${l.gender.label}: ${genderText}`);
  }
  if (report.age) lines.push(`${l.age}: ${report.age}`);
  if (report.color) lines.push(`${l.color}: ${report.color}`);
  lines.push(`${l.features}: ${report.features}`);
  if (report.clothingDesc) lines.push(`${l.clothing}: ${report.clothingDesc}`);
  lines.push(`${l.lastSeen}: ${report.lastSeenAt.toLocaleString(l.localeTag)}`);
  lines.push(`${l.location}: ${report.lastSeenAddress}`);
  lines.push(`${l.contact}: ${report.contactName} ${report.contactPhone}`);
  if (report.reward) lines.push(`${l.reward}: ${report.reward}`);

  return lines.join('\n');
}

export async function generatePromoTexts(
  report: ReportInfo,
  photoBase64: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<PlatformPromoTexts> {
  const context = buildReportContext(report, locale);
  const result = await askClaudeWithImage(
    SYSTEM_PROMPTS[locale],
    photoBase64,
    context,
    { maxTokens: 1024, agentId: 'promotion' },
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
      instagram: result.slice(0, 2200),
      general: result,
    };
  }
}
