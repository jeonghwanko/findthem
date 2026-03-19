import type { ExternalQuestion } from '@findthem/shared';

/** Q&A 소스 구현체 인터페이스 */
export interface QaFetcher {
  /** 소스 식별자 (예: 'naver-kin') */
  source: string;
  /** 외부 Q&A 사이트에서 질문 수집 */
  fetch(): Promise<ExternalQuestion[]>;
}
