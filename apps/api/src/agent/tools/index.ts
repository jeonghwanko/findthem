import type Anthropic from '@anthropic-ai/sdk';
import type { SubjectType } from '@findthem/shared';
import { analyzePhoto } from './analyzePhoto.js';
import { searchReports } from './searchReports.js';
import { geocodeAddress } from './geocodeAddress.js';
import { saveSighting, type SaveSightingInput } from './saveSighting.js';
import { getCurrentTime } from './getCurrentTime.js';

// ── 도구 정의 (Claude Messages API Tool[] 형식) ──

export const SIGHTING_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'analyze_photo',
    description:
      '업로드된 사진을 AI로 분석하여 외형 특징, 대상 유형 등을 추출합니다. 사용자가 사진을 업로드하면 반드시 호출하세요.',
    input_schema: {
      type: 'object' as const,
      properties: {
        photoUrl: {
          type: 'string',
          description: '분석할 사진의 URL 경로 (예: /uploads/sightings/xxx.jpg)',
        },
        subjectType: {
          type: 'string',
          enum: ['PERSON', 'DOG', 'CAT'],
          description: '이미 알고 있는 대상 유형 (선택)',
        },
      },
      required: ['photoUrl'],
    },
  },
  {
    name: 'search_reports',
    description:
      '유사한 실종 신고를 검색합니다. 대상 유형이 파악된 후 호출하여 관련 신고를 사용자에게 안내하세요.',
    input_schema: {
      type: 'object' as const,
      properties: {
        subjectType: {
          type: 'string',
          enum: ['PERSON', 'DOG', 'CAT'],
          description: '대상 유형',
        },
        description: {
          type: 'string',
          description: '외형 설명 (선택, 관련성 높은 신고를 찾는 데 사용)',
        },
        address: {
          type: 'string',
          description: '목격 주소 (선택, 관련성 높은 신고를 찾는 데 사용)',
        },
        limit: {
          type: 'number',
          description: '반환할 최대 신고 수 (기본값: 5)',
        },
      },
      required: ['subjectType'],
    },
  },
  {
    name: 'geocode_address',
    description: '한국어 주소를 위도/경도 좌표로 변환합니다. 목격 장소가 수집되면 호출하세요.',
    input_schema: {
      type: 'object' as const,
      properties: {
        address: {
          type: 'string',
          description: '좌표로 변환할 주소 (예: 서울시 강남구 역삼역 3번출구 앞)',
        },
      },
      required: ['address'],
    },
  },
  {
    name: 'save_sighting',
    description:
      '수집된 모든 필수 정보를 데이터베이스에 저장합니다. subjectType, description, address, sightedAt가 모두 수집된 후에만 호출하세요.',
    input_schema: {
      type: 'object' as const,
      properties: {
        subjectType: {
          type: 'string',
          enum: ['PERSON', 'DOG', 'CAT'],
          description: '대상 유형',
        },
        description: {
          type: 'string',
          description: '외형 설명',
        },
        address: {
          type: 'string',
          description: '목격 장소 주소',
        },
        sightedAt: {
          type: 'string',
          description: '목격 시간 (ISO 8601 형식)',
        },
        lat: {
          type: 'number',
          description: '위도 (선택)',
        },
        lng: {
          type: 'number',
          description: '경도 (선택)',
        },
        photoUrls: {
          type: 'array',
          items: { type: 'string' },
          description: '사진 URL 목록 (선택)',
        },
        tipsterName: {
          type: 'string',
          description: '제보자 이름 (선택)',
        },
        tipsterPhone: {
          type: 'string',
          description: '제보자 연락처 (선택)',
        },
        reportId: {
          type: 'string',
          description: '연결할 특정 신고 ID (선택)',
        },
      },
      required: ['subjectType', 'description', 'address', 'sightedAt'],
    },
  },
  {
    name: 'get_current_time',
    description:
      '현재 한국 시각을 반환합니다. 사용자가 "지금", "방금" 등 상대적 시간을 언급할 때 사용하세요.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

// ── 도구 핸들러 디스패처 ──

export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  userId?: string,
): Promise<Record<string, unknown>> {
  switch (name) {
    case 'analyze_photo': {
      const photoUrl = input['photoUrl'] as string;
      const subjectType = input['subjectType'] as SubjectType | undefined;
      const result = await analyzePhoto(photoUrl, subjectType);
      return result as unknown as Record<string, unknown>;
    }

    case 'search_reports': {
      const subjectType = input['subjectType'] as SubjectType;
      const description = input['description'] as string | undefined;
      const address = input['address'] as string | undefined;
      const limit = input['limit'] as number | undefined;
      const result = await searchReports(subjectType, description, address, limit);
      return result as unknown as Record<string, unknown>;
    }

    case 'geocode_address': {
      const address = input['address'] as string;
      const result = await geocodeAddress(address);
      return result as unknown as Record<string, unknown>;
    }

    case 'save_sighting': {
      const sightingInput: SaveSightingInput = {
        subjectType: input['subjectType'] as SubjectType,
        description: input['description'] as string,
        address: input['address'] as string,
        sightedAt: input['sightedAt'] as string,
        lat: (input['lat'] as number | undefined) ?? null,
        lng: (input['lng'] as number | undefined) ?? null,
        photoUrls: input['photoUrls'] as string[] | undefined,
        tipsterName: (input['tipsterName'] as string | undefined) ?? null,
        tipsterPhone: (input['tipsterPhone'] as string | undefined) ?? null,
        reportId: (input['reportId'] as string | undefined) ?? null,
        userId,
      };
      const result = await saveSighting(sightingInput);
      return result as unknown as Record<string, unknown>;
    }

    case 'get_current_time': {
      const result = getCurrentTime();
      return result as unknown as Record<string, unknown>;
    }

    default:
      return { error: `알 수 없는 도구: ${name}` };
  }
}
