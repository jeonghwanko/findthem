import type { SubjectType, Gender } from '@findthem/shared';

// 외부 소스에서 수집된 원시 데이터
export interface ExternalReport {
  externalId: string;
  subjectType: SubjectType;
  name: string;
  features: string;
  lastSeenAt: Date;
  lastSeenAddress: string;
  photoUrl?: string;
  contactPhone?: string;
  contactName?: string;
  gender?: Gender;
  age?: string;
  color?: string;
  weight?: string;
  species?: string;
}

// 각 소스 구현체가 준수해야 할 인터페이스
export interface Fetcher {
  /** 레지스트리 키 (crawlQueue job의 source 값) */
  source: string;
  fetch(): Promise<ExternalReport[]>;
}
