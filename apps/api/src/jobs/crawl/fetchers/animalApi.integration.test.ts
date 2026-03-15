/**
 * Integration tests — hit the real public data API.
 *
 * Run manually:
 *   INTEGRATION_TEST=1 npx vitest run src/jobs/crawl/fetchers/animalApi.integration.test.ts
 *
 * Skipped automatically in CI (INTEGRATION_TEST not set).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { config } from '../../../config.js';

// eslint-disable-next-line no-restricted-syntax -- integration test entry point must read env directly
const RUN = !!process.env.INTEGRATION_TEST;

const BASE_URL =
  'http://apis.data.go.kr/1543061/abandonmentPublicService_v2/abandonmentPublic_v2';

describe.skipIf(!RUN)('animalApi integration', () => {
  let apiKey: string;

  beforeAll(() => {
    apiKey = config.publicDataApiKey;
    if (!apiKey) throw new Error('PUBLIC_DATA_API_KEY env var is required');
  });

  it('returns HTTP 200 with valid service key', async () => {
    const url = new URL(BASE_URL);
    url.searchParams.set('serviceKey', apiKey);
    url.searchParams.set('_type', 'json');
    url.searchParams.set('numOfRows', '1');
    url.searchParams.set('pageNo', '1');
    url.searchParams.set('state', 'protect');

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });

    expect(res.status).toBe(200);
  });

  it('response body has expected structure', async () => {
    const url = new URL(BASE_URL);
    url.searchParams.set('serviceKey', apiKey);
    url.searchParams.set('_type', 'json');
    url.searchParams.set('numOfRows', '3');
    url.searchParams.set('pageNo', '1');
    url.searchParams.set('state', 'protect');

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
    const raw = (await res.json()) as Record<string, unknown>;

    // Log the raw response for debugging
    console.log('Raw API response:', JSON.stringify(raw, null, 2).slice(0, 2000));

    const body = (raw?.['response'] as Record<string, unknown>)?.['body'] as
      | Record<string, unknown>
      | undefined;

    expect(body).toBeDefined();
    expect(typeof body?.['totalCount']).toBe('number');
  });

  it('returns at least 1 item when state=protect', async () => {
    const url = new URL(BASE_URL);
    url.searchParams.set('serviceKey', apiKey);
    url.searchParams.set('_type', 'json');
    url.searchParams.set('numOfRows', '5');
    url.searchParams.set('pageNo', '1');
    url.searchParams.set('state', 'protect');

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
    const raw = (await res.json()) as Record<string, unknown>;

    const body = (raw?.['response'] as Record<string, unknown>)?.['body'] as
      | Record<string, unknown>
      | undefined;

    const totalCount = body?.['totalCount'] as number | undefined;
    console.log('totalCount:', totalCount);
    console.log('items:', JSON.stringify(body?.['items'], null, 2)?.slice(0, 500));

    expect(totalCount).toBeGreaterThan(0);
  });

  it('item fields include desertionNo, kindCd, happenDt', async () => {
    const url = new URL(BASE_URL);
    url.searchParams.set('serviceKey', apiKey);
    url.searchParams.set('_type', 'json');
    url.searchParams.set('numOfRows', '1');
    url.searchParams.set('pageNo', '1');
    url.searchParams.set('state', 'protect');

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
    const raw = (await res.json()) as Record<string, unknown>;

    const body = (raw?.['response'] as Record<string, unknown>)?.['body'] as
      | Record<string, unknown>
      | undefined;
    const itemsWrapper = body?.['items'] as Record<string, unknown> | undefined;
    const rawItem = itemsWrapper?.['item'];
    const item = (Array.isArray(rawItem) ? rawItem[0] : rawItem) as
      | Record<string, unknown>
      | undefined;

    console.log('First item:', JSON.stringify(item, null, 2));

    expect(item).toBeDefined();
    expect(item?.['desertionNo']).toBeDefined();
    expect(item?.['kindCd']).toBeDefined();
    expect(item?.['happenDt']).toBeDefined();
  });
});
