import type { QaFetcher } from './types.js';
import { naverKinFetcher } from './fetchers/naverKin.js';

// 새 Q&A 소스 추가: 파일 작성 후 이 배열에 추가
export const qaFetchers: QaFetcher[] = [
  naverKinFetcher,
];

export function getQaFetcher(source: string): QaFetcher | undefined {
  return qaFetchers.find((f) => f.source === source);
}
