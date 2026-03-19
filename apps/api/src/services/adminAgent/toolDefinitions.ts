import type Anthropic from '@anthropic-ai/sdk';
import { QUEUE_NAMES } from '@findthem/shared';

const QUEUE_NAME_VALUES = Object.values(QUEUE_NAMES);

export const ADMIN_TOOL_DEFINITIONS: Anthropic.Messages.Tool[] = [
  {
    name: 'query_stats',
    description:
      'DB에서 신고/제보/매칭/사용자 통계를 조회한다. 기간별, 상태별, 유형별 집계를 지원한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        entity: {
          type: 'string',
          enum: ['reports', 'sightings', 'matches', 'users'],
          description: '조회할 엔티티 종류',
        },
        period: {
          type: 'string',
          enum: ['today', 'week', 'month', 'all'],
          description: '조회 기간',
        },
        groupBy: {
          type: 'string',
          enum: ['status', 'subjectType', 'source', 'day', 'none'],
          description: '그룹화 기준. none이면 단순 카운트만 반환한다.',
        },
      },
      required: ['entity', 'period', 'groupBy'],
    },
  },
  {
    name: 'get_queue_status',
    description: 'BullMQ 큐의 대기/실행/완료/실패/지연 카운트와 일시정지 상태를 조회한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        queueName: {
          type: 'string',
          enum: [...QUEUE_NAME_VALUES, 'all'],
          description: '조회할 큐 이름. all이면 모든 큐를 조회한다.',
        },
      },
      required: ['queueName'],
    },
  },
  {
    name: 'get_system_health',
    description: 'DB와 Redis의 연결 상태 및 응답 지연을 확인한다.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'search_reports',
    description: '조건에 맞는 신고 목록을 검색한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['ACTIVE', 'FOUND', 'EXPIRED', 'SUSPENDED'],
          description: '신고 상태 필터 (선택)',
        },
        subjectType: {
          type: 'string',
          enum: ['PERSON', 'DOG', 'CAT'],
          description: '대상 유형 필터 (선택)',
        },
        query: {
          type: 'string',
          description: '이름, 특징, 주소 등 텍스트 검색어 (선택)',
        },
        limit: {
          type: 'number',
          description: '최대 반환 개수 (기본 10, 최대 50)',
        },
      },
      required: [],
    },
  },
  {
    name: 'search_users',
    description: '조건에 맞는 사용자 목록을 검색한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: '이름, 휴대폰, 이메일 검색어 (선택)',
        },
        isBlocked: {
          type: 'boolean',
          description: '차단 여부 필터 (선택)',
        },
        limit: {
          type: 'number',
          description: '최대 반환 개수 (기본 10, 최대 50)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_recent_errors',
    description: '큐에서 최근 실패한 job 목록을 조회한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        queueName: {
          type: 'string',
          enum: QUEUE_NAME_VALUES,
          description: '조회할 큐 이름. 생략하면 모든 큐를 조회한다.',
        },
        limit: {
          type: 'number',
          description: '최대 반환 개수 (기본 20)',
        },
      },
      required: [],
    },
  },
  {
    name: 'update_report_status',
    description:
      '신고의 상태를 ACTIVE 또는 SUSPENDED로 변경한다. 변경 전 search_reports로 현재 상태를 먼저 확인해야 한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reportId: {
          type: 'string',
          description: '변경할 신고의 ID',
        },
        newStatus: {
          type: 'string',
          enum: ['ACTIVE', 'SUSPENDED'],
          description: '변경할 상태값',
        },
        reason: {
          type: 'string',
          description: '변경 사유 (필수)',
        },
      },
      required: ['reportId', 'newStatus', 'reason'],
    },
  },
  {
    name: 'update_match_status',
    description: '매칭 결과를 CONFIRMED 또는 REJECTED로 변경한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        matchId: {
          type: 'string',
          description: '변경할 매칭의 ID',
        },
        newStatus: {
          type: 'string',
          enum: ['CONFIRMED', 'REJECTED'],
          description: '변경할 상태값',
        },
        reason: {
          type: 'string',
          description: '변경 사유 (선택)',
        },
      },
      required: ['matchId', 'newStatus'],
    },
  },
  {
    name: 'block_user',
    description: '사용자를 차단하거나 차단 해제한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        userId: {
          type: 'string',
          description: '차단/해제할 사용자 ID',
        },
        blocked: {
          type: 'boolean',
          description: 'true이면 차단, false이면 해제',
        },
        reason: {
          type: 'string',
          description: '차단 사유 (선택, 차단 시 권장)',
        },
      },
      required: ['userId', 'blocked'],
    },
  },
  {
    name: 'retry_failed_job',
    description: '실패한 BullMQ job을 재시도한다.',
    input_schema: {
      type: 'object' as const,
      properties: {
        queueName: {
          type: 'string',
          enum: QUEUE_NAME_VALUES,
          description: 'job이 속한 큐 이름',
        },
        jobId: {
          type: 'string',
          description: '재시도할 job의 ID',
        },
      },
      required: ['queueName', 'jobId'],
    },
  },
];
