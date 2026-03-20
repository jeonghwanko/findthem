import { fetchers } from '../jobs/crawl/fetcherRegistry.js';

/** 등록된 크롤 소스 이름 목록 반환 */
export function getAvailableCrawlSources(): string[] {
  return fetchers.map((f) => f.source);
}
