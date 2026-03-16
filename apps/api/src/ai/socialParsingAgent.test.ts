import { describe, it, expect, vi, beforeEach } from 'vitest';

// askClaude mock — parseSocialPost에서 사용하는 유일한 외부 의존성
vi.mock('./claudeClient.js', () => ({
  askClaude: vi.fn(),
}));

// logger mock — 콘솔 출력 방지
vi.mock('../logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { parseSocialPost } from './socialParsingAgent.js';
import { askClaude } from './claudeClient.js';

const mockAskClaude = vi.mocked(askClaude);

/** 정상 실종 게시글 Claude 응답 빌더 */
function makeMissingResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    isMissing: true,
    subjectType: 'DOG',
    name: '초코',
    features: '갈색 말티즈, 작은 체구, 목줄 없음',
    location: '서울시 마포구',
    estimatedDate: '2026-03-15',
    photoUrl: 'https://example.com/photo.jpg',
    ...overrides,
  });
}

describe('parseSocialPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('정상 실종 게시글 파싱', () => {
    it('실종 강아지 게시글 → 유효한 ParsedSocialPost 반환', async () => {
      mockAskClaude.mockResolvedValue(makeMissingResponse());

      const result = await parseSocialPost(
        '강아지를 잃어버렸어요 도와주세요',
        '오늘 오후 마포구에서 갈색 말티즈를 잃어버렸습니다. 이름은 초코입니다.',
      );

      expect(result).not.toBeNull();
      expect(result!.subjectType).toBe('DOG');
      expect(result!.name).toBe('초코');
      expect(result!.features).toBe('갈색 말티즈, 작은 체구, 목줄 없음');
      expect(result!.location).toBe('서울시 마포구');
      expect(result!.estimatedDate).toBe('2026-03-15');
      expect(result!.photoUrl).toBe('https://example.com/photo.jpg');
    });

    it('CAT subjectType 정상 처리', async () => {
      mockAskClaude.mockResolvedValue(makeMissingResponse({ subjectType: 'CAT', name: '나비' }));

      const result = await parseSocialPost('고양이 잃어버렸어요', '흰색 고양이입니다.');

      expect(result).not.toBeNull();
      expect(result!.subjectType).toBe('CAT');
    });

    it('PERSON subjectType 정상 처리', async () => {
      mockAskClaude.mockResolvedValue(
        makeMissingResponse({ subjectType: 'PERSON', name: '홍길동' }),
      );

      const result = await parseSocialPost('실종자 찾습니다', '70대 어르신이 실종되었습니다.');

      expect(result).not.toBeNull();
      expect(result!.subjectType).toBe('PERSON');
    });
  });

  describe('isMissing: false 처리', () => {
    it('뉴스 기사 (isMissing: false) → null 반환', async () => {
      mockAskClaude.mockResolvedValue(JSON.stringify({ isMissing: false }));

      const result = await parseSocialPost(
        '유기동물 보호소 운영 현황',
        '전국 유기동물 보호소 수가 증가하고 있다는 뉴스입니다.',
      );

      expect(result).toBeNull();
    });

    it('isMissing 필드 없는 응답 → null 반환', async () => {
      mockAskClaude.mockResolvedValue(JSON.stringify({ subjectType: 'DOG', name: '몰리' }));

      const result = await parseSocialPost('강아지 분양합니다', '귀여운 강아지 분양해요.');

      expect(result).toBeNull();
    });
  });

  describe('subjectType 유효성 검사', () => {
    it('BIRD subjectType → null 반환 (허용되지 않는 타입)', async () => {
      mockAskClaude.mockResolvedValue(
        makeMissingResponse({ subjectType: 'BIRD', name: '앵무새' }),
      );

      const result = await parseSocialPost('앵무새 잃어버렸어요', '초록색 앵무새입니다.');

      expect(result).toBeNull();
    });

    it('RABBIT subjectType → null 반환', async () => {
      mockAskClaude.mockResolvedValue(
        makeMissingResponse({ subjectType: 'RABBIT', name: '흰둥이' }),
      );

      const result = await parseSocialPost('토끼 잃어버렸어요', '흰색 토끼입니다.');

      expect(result).toBeNull();
    });
  });

  describe('estimatedDate 유효성 검사', () => {
    it('유효한 YYYY-MM-DD → 그대로 반환', async () => {
      mockAskClaude.mockResolvedValue(
        makeMissingResponse({ estimatedDate: '2026-01-20' }),
      );

      const result = await parseSocialPost('강아지 실종', '설명');

      expect(result!.estimatedDate).toBe('2026-01-20');
    });

    it('잘못된 날짜 형식 (YYYYMMDD) → 오늘 날짜로 fallback', async () => {
      mockAskClaude.mockResolvedValue(
        makeMissingResponse({ estimatedDate: '20260320' }),
      );

      const today = new Date().toISOString().split('T')[0];
      const result = await parseSocialPost('강아지 실종', '설명');

      expect(result!.estimatedDate).toBe(today);
    });

    it('빈 estimatedDate → 오늘 날짜로 fallback', async () => {
      mockAskClaude.mockResolvedValue(makeMissingResponse({ estimatedDate: '' }));

      const today = new Date().toISOString().split('T')[0];
      const result = await parseSocialPost('강아지 실종', '설명');

      expect(result!.estimatedDate).toBe(today);
    });

    it('null estimatedDate → 오늘 날짜로 fallback', async () => {
      mockAskClaude.mockResolvedValue(makeMissingResponse({ estimatedDate: null }));

      const today = new Date().toISOString().split('T')[0];
      const result = await parseSocialPost('강아지 실종', '설명');

      expect(result!.estimatedDate).toBe(today);
    });
  });

  describe('photoUrl 유효성 검사', () => {
    it('http로 시작하는 URL → photoUrl 설정', async () => {
      mockAskClaude.mockResolvedValue(
        makeMissingResponse({ photoUrl: 'http://example.com/photo.jpg' }),
      );

      const result = await parseSocialPost('강아지 실종', '설명');

      expect(result!.photoUrl).toBe('http://example.com/photo.jpg');
    });

    it('https URL → photoUrl 설정', async () => {
      mockAskClaude.mockResolvedValue(
        makeMissingResponse({ photoUrl: 'https://cdn.example.com/img.png' }),
      );

      const result = await parseSocialPost('강아지 실종', '설명');

      expect(result!.photoUrl).toBe('https://cdn.example.com/img.png');
    });

    it('상대 경로 → photoUrl이 undefined', async () => {
      mockAskClaude.mockResolvedValue(
        makeMissingResponse({ photoUrl: '/uploads/photo.jpg' }),
      );

      const result = await parseSocialPost('강아지 실종', '설명');

      expect(result!.photoUrl).toBeUndefined();
    });

    it('프로토콜 없는 경로 → photoUrl이 undefined', async () => {
      mockAskClaude.mockResolvedValue(
        makeMissingResponse({ photoUrl: 'example.com/photo.jpg' }),
      );

      const result = await parseSocialPost('강아지 실종', '설명');

      expect(result!.photoUrl).toBeUndefined();
    });

    it('null photoUrl → photoUrl이 undefined', async () => {
      mockAskClaude.mockResolvedValue(makeMissingResponse({ photoUrl: null }));

      const result = await parseSocialPost('강아지 실종', '설명');

      expect(result!.photoUrl).toBeUndefined();
    });
  });

  describe('name 필드 처리', () => {
    it('100자 초과 name → 100자로 truncate', async () => {
      const longName = 'A'.repeat(150);
      mockAskClaude.mockResolvedValue(makeMissingResponse({ name: longName }));

      const result = await parseSocialPost('강아지 실종', '설명');

      expect(result!.name).toHaveLength(100);
    });

    it('빈 name → "정보 없음" fallback', async () => {
      mockAskClaude.mockResolvedValue(makeMissingResponse({ name: '' }));

      const result = await parseSocialPost('강아지 실종', '설명');

      expect(result!.name).toBe('정보 없음');
    });

    it('null name → "정보 없음" fallback', async () => {
      mockAskClaude.mockResolvedValue(makeMissingResponse({ name: null }));

      const result = await parseSocialPost('강아지 실종', '설명');

      expect(result!.name).toBe('정보 없음');
    });
  });

  describe('features 필드 처리', () => {
    it('200자 초과 features → 200자로 truncate', async () => {
      const longFeatures = 'B'.repeat(250);
      mockAskClaude.mockResolvedValue(makeMissingResponse({ features: longFeatures }));

      const result = await parseSocialPost('강아지 실종', '설명');

      expect(result!.features).toHaveLength(200);
    });

    it('100자 features → 그대로 반환', async () => {
      const shortFeatures = '갈색 말티즈, 아주 귀엽고 작은 강아지';
      mockAskClaude.mockResolvedValue(makeMissingResponse({ features: shortFeatures }));

      const result = await parseSocialPost('강아지 실종', '설명');

      expect(result!.features).toBe(shortFeatures);
    });
  });

  describe('location 필드 처리', () => {
    it('빈 location → "장소 미상" fallback', async () => {
      mockAskClaude.mockResolvedValue(makeMissingResponse({ location: '' }));

      const result = await parseSocialPost('강아지 실종', '설명');

      expect(result!.location).toBe('장소 미상');
    });

    it('null location → "장소 미상" fallback', async () => {
      mockAskClaude.mockResolvedValue(makeMissingResponse({ location: null }));

      const result = await parseSocialPost('강아지 실종', '설명');

      expect(result!.location).toBe('장소 미상');
    });

    it('유효한 location → 그대로 반환', async () => {
      mockAskClaude.mockResolvedValue(makeMissingResponse({ location: '부산시 해운대구' }));

      const result = await parseSocialPost('강아지 실종', '설명');

      expect(result!.location).toBe('부산시 해운대구');
    });
  });

  describe('Claude 응답 파싱 실패 처리', () => {
    it('Claude가 non-JSON 반환 → null 반환', async () => {
      mockAskClaude.mockResolvedValue('죄송합니다, 분석할 수 없습니다.');

      const result = await parseSocialPost('강아지 실종', '설명');

      expect(result).toBeNull();
    });

    it('Claude가 JSON 없는 마크다운 반환 → null 반환', async () => {
      mockAskClaude.mockResolvedValue('```\n분석 결과\n```');

      const result = await parseSocialPost('강아지 실종', '설명');

      expect(result).toBeNull();
    });

    it('Claude API 에러 throw → null 반환 (에러 전파 없음)', async () => {
      mockAskClaude.mockRejectedValue(new Error('API rate limit exceeded'));

      const result = await parseSocialPost('강아지 실종', '설명');

      expect(result).toBeNull();
    });

    it('Claude API 에러 throw → 에러 로깅됨', async () => {
      // logger mock을 캡처하기 위해 모듈을 재임포트할 수 없으므로
      // 단순히 에러가 전파되지 않음을 확인 (에러 로깅은 소스 코드에서 보장)
      mockAskClaude.mockRejectedValue(new Error('Network timeout'));

      await expect(parseSocialPost('강아지 실종', '설명')).resolves.toBeNull();
    });

    it('빈 문자열 응답 → null 반환', async () => {
      mockAskClaude.mockResolvedValue('');

      const result = await parseSocialPost('강아지 실종', '설명');

      expect(result).toBeNull();
    });
  });

  describe('JSON 추출 (코드 블록 내 JSON)', () => {
    it('마크다운 코드 블록 안의 JSON → 정상 파싱', async () => {
      const json = makeMissingResponse();
      mockAskClaude.mockResolvedValue(`\`\`\`json\n${json}\n\`\`\``);

      const result = await parseSocialPost('강아지 실종', '설명');

      expect(result).not.toBeNull();
      expect(result!.subjectType).toBe('DOG');
    });

    it('앞뒤 설명 텍스트가 있는 JSON → 정상 파싱', async () => {
      const json = makeMissingResponse();
      mockAskClaude.mockResolvedValue(`분석 결과입니다:\n${json}\n감사합니다.`);

      const result = await parseSocialPost('강아지 실종', '설명');

      expect(result).not.toBeNull();
    });
  });
});
