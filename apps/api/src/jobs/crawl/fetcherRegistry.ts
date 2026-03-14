import type { Fetcher } from './types.js';
import { animalApiFetcher } from './fetchers/animalApi.js';
import { safe182Fetcher } from './fetchers/safe182.js';

// 새 소스 추가: 파일 작성 후 이 배열에 추가
export const fetchers: Fetcher[] = [
  animalApiFetcher,
  safe182Fetcher,
];

export function getFetcher(source: string): Fetcher | undefined {
  return fetchers.find((f) => f.source === source);
}
