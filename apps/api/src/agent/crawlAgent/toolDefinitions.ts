import type Anthropic from '@anthropic-ai/sdk';

export const CRAWL_TOOL_DEFINITIONS: Anthropic.Messages.Tool[] = [
  {
    name: 'fetch_safe182',
    description:
      '경찰청 Safe182 실종아동 API(findChildList.do)에서 실종아동 데이터를 가져온다. pageNo와 numOfRows를 지정하여 페이지 단위로 조회한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pageNo: {
          type: 'number',
          description: '페이지 번호 (1부터 시작)',
        },
        numOfRows: {
          type: 'number',
          description: '페이지당 행 수 (최대 100, 기본 50)',
        },
      },
      required: ['pageNo'],
    },
  },
  {
    name: 'fetch_amber_alerts',
    description:
      '경찰청 Safe182 엠버경보 API(amberList.do)에서 긴급 실종 경보 데이터를 가져온다. 엠버경보는 긴급도가 가장 높으므로 가장 먼저 수집해야 한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pageNo: {
          type: 'number',
          description: '페이지 번호 (1부터 시작)',
        },
        numOfRows: {
          type: 'number',
          description: '페이지당 행 수 (최대 100, 기본 50)',
        },
      },
      required: ['pageNo'],
    },
  },
  {
    name: 'fetch_animal_api',
    description:
      '농림축산식품부 유기동물 공공 API(abandonmentPublicService_v2)에서 유기동물 데이터를 가져온다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pageNo: {
          type: 'number',
          description: '페이지 번호 (1부터 시작)',
        },
        numOfRows: {
          type: 'number',
          description: '페이지당 행 수 (최대 100, 기본 50)',
        },
        state: {
          type: 'string',
          enum: ['protect', 'notice', 'all'],
          description: '보호 상태 필터. protect=보호중, notice=공고중, all=전체 (기본 protect)',
        },
      },
      required: ['pageNo'],
    },
  },
  {
    name: 'search_reports',
    description:
      'DB에서 externalId 목록으로 중복 신고를 조회한다. store_report 호출 전 반드시 먼저 호출하여 중복을 확인해야 한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        externalIds: {
          type: 'array',
          items: { type: 'string' },
          description: '중복 확인할 외부 ID 목록',
        },
        externalSource: {
          type: 'string',
          description: '소스 식별자 (예: safe182, safe182-amber, animal-api)',
        },
      },
      required: ['externalIds', 'externalSource'],
    },
  },
  {
    name: 'store_report',
    description:
      '새로운 신고를 DB에 저장한다. search_reports로 중복이 아님을 확인한 항목만 저장해야 한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        externalId: {
          type: 'string',
          description: '외부 소스의 고유 ID',
        },
        externalSource: {
          type: 'string',
          description: '소스 식별자 (예: safe182, safe182-amber, animal-api)',
        },
        subjectType: {
          type: 'string',
          enum: ['PERSON', 'DOG', 'CAT'],
          description: '대상 유형',
        },
        name: {
          type: 'string',
          description: '이름 또는 식별명',
        },
        features: {
          type: 'string',
          description: '외모/특징 설명',
        },
        lastSeenAt: {
          type: 'string',
          description: '마지막 목격 일시 (ISO 8601 형식)',
        },
        lastSeenAddress: {
          type: 'string',
          description: '마지막 목격 장소',
        },
        photoUrl: {
          type: 'string',
          description: '사진 URL (선택)',
        },
        contactPhone: {
          type: 'string',
          description: '연락처 전화번호 (선택)',
        },
        contactName: {
          type: 'string',
          description: '연락처 이름/기관명 (선택)',
        },
        gender: {
          type: 'string',
          enum: ['MALE', 'FEMALE', 'UNKNOWN'],
          description: '성별',
        },
        age: {
          type: 'string',
          description: '나이 (선택)',
        },
        color: {
          type: 'string',
          description: '털 색상/피부색 (선택)',
        },
        weight: {
          type: 'string',
          description: '체중 (선택)',
        },
        species: {
          type: 'string',
          description: '견종/묘종 등 종 정보 (선택)',
        },
      },
      required: [
        'externalId',
        'externalSource',
        'subjectType',
        'name',
        'features',
        'lastSeenAt',
        'lastSeenAddress',
      ],
    },
  },
  {
    name: 'enqueue_image_analysis',
    description:
      '저장된 신고의 사진을 AI로 분석하기 위해 imageQueue에 등록한다. photoUrl이 있는 신고를 store_report로 저장한 직후 호출한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reportId: {
          type: 'string',
          description: 'AI 분석을 등록할 신고 ID',
        },
      },
      required: ['reportId'],
    },
  },
];
