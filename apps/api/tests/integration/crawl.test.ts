/**
 * Crawl integration tests — hit real external APIs using env vars.
 *
 * Prerequisites:
 *   - PUBLIC_DATA_API_KEY set in apps/api/.env
 *   - SAFE182_ESNTL_ID + SAFE182_API_KEY set in apps/api/.env
 *
 * Run:
 *   npx vitest run --config vitest.integration.config.ts
 */
import { describe, it, expect, beforeAll } from 'vitest';
import 'dotenv/config';

// Load .env from apps/api directory
import { config as dotenv } from 'dotenv';
import { resolve } from 'path';
dotenv({ path: resolve(process.cwd(), '.env') });

const ANIMAL_API_URL =
  'http://apis.data.go.kr/1543061/abandonmentPublicService_v2/abandonmentPublic_v2';
const SAFE182_URL = 'https://www.safe182.go.kr/api/lcm/findChildList.do';

// ── 유기동물 API ──────────────────────────────────────────────────────────────

describe('유기동물 API (abandonmentPublicService_v2)', () => {
  let apiKey: string;

  beforeAll(() => {
    apiKey = process.env.PUBLIC_DATA_API_KEY ?? '';
    if (!apiKey) throw new Error('PUBLIC_DATA_API_KEY not set in .env');
  });

  it('HTTP 200 반환', async () => {
    const url = new URL(ANIMAL_API_URL);
    url.searchParams.set('serviceKey', apiKey);
    url.searchParams.set('_type', 'json');
    url.searchParams.set('numOfRows', '1');
    url.searchParams.set('pageNo', '1');
    url.searchParams.set('state', 'protect');

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
    expect(res.status).toBe(200);
  });

  it('response.body 구조 존재', async () => {
    const url = new URL(ANIMAL_API_URL);
    url.searchParams.set('serviceKey', apiKey);
    url.searchParams.set('_type', 'json');
    url.searchParams.set('numOfRows', '3');
    url.searchParams.set('pageNo', '1');
    url.searchParams.set('state', 'protect');

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
    const raw = (await res.json()) as Record<string, unknown>;

    console.log('\n[animal-api] raw response (truncated):');
    console.log(JSON.stringify(raw, null, 2).slice(0, 1500));

    const body = (raw?.['response'] as Record<string, unknown>)?.['body'] as
      | Record<string, unknown>
      | undefined;

    expect(body).toBeDefined();
    expect(typeof body?.['totalCount']).toBe('number');
    expect((body?.['totalCount'] as number)).toBeGreaterThan(0);
  });

  it('item 필드에 desertionNo, kindCd, happenDt 존재', async () => {
    const url = new URL(ANIMAL_API_URL);
    url.searchParams.set('serviceKey', apiKey);
    url.searchParams.set('_type', 'json');
    url.searchParams.set('numOfRows', '1');
    url.searchParams.set('pageNo', '1');
    url.searchParams.set('state', 'protect');

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
    const raw = (await res.json()) as Record<string, unknown>;
    const body = (raw?.['response'] as Record<string, unknown>)?.['body'] as Record<string, unknown>;
    const itemsWrapper = body?.['items'] as Record<string, unknown> | undefined;
    const rawItem = itemsWrapper?.['item'];
    const item = (Array.isArray(rawItem) ? rawItem[0] : rawItem) as Record<string, unknown>;

    console.log('\n[animal-api] first item:');
    console.log(JSON.stringify(item, null, 2));

    expect(item?.['desertionNo']).toBeDefined();
    expect(item?.['kindCd']).toBeDefined();
    expect(item?.['happenDt']).toBeDefined();
  });

  it('fetcher가 ExternalReport[]를 정상 반환', async () => {
    // 실제 fetcher 함수 실행
    const { animalApiFetcher } = await import(
      '../../src/jobs/crawl/fetchers/animalApi.js'
    );
    const results = await animalApiFetcher.fetch();

    console.log(`\n[animal-api] fetcher returned ${results.length} items`);
    if (results.length > 0) {
      console.log('First item:', JSON.stringify(results[0], null, 2));
    }

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].externalId).toBeDefined();
    expect(['DOG', 'CAT']).toContain(results[0].subjectType);
  });
});

// ── Safe182 실종아동 API ──────────────────────────────────────────────────────

describe('Safe182 실종아동 API', () => {
  let esntlId: string;
  let authKey: string;

  beforeAll(() => {
    esntlId = process.env.SAFE182_ESNTL_ID ?? '';
    authKey = process.env.SAFE182_API_KEY ?? '';
    if (!esntlId || !authKey) {
      throw new Error('SAFE182_ESNTL_ID and SAFE182_API_KEY must be set in .env');
    }
  });

  it('HTTP 200 반환', async () => {
    const res = await fetch(SAFE182_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        esntlId,
        authKey,
        pageIndex: '1',
        pageUnit: '1',
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    expect(res.status).toBe(200);
  });

  it('응답 구조 및 데이터 확인', async () => {
    const res = await fetch(SAFE182_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        esntlId,
        authKey,
        rowSize: '3',
        page: '1',
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });

    const raw = (await res.json()) as Record<string, unknown>;
    console.log('\n[safe182] raw response (truncated):');
    console.log(JSON.stringify(raw, null, 2).slice(0, 1500));

    expect(raw['result']).toBe('00');
    const totalCount = raw['totalCount'] as number | undefined;
    expect(typeof totalCount).toBe('number');
    expect(totalCount).toBeGreaterThan(0);
  });

  it('fetcher가 ExternalReport[]를 정상 반환', async () => {
    const { safe182Fetcher } = await import(
      '../../src/jobs/crawl/fetchers/safe182.js'
    );
    const results = await safe182Fetcher.fetch();

    console.log(`\n[safe182] fetcher returned ${results.length} items`);
    if (results.length > 0) {
      console.log('First item:', JSON.stringify(results[0], null, 2));
    }

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].externalId).toBeDefined();
    expect(results[0].subjectType).toBe('PERSON');
  });
});
