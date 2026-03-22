import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { verifyApplePurchase, verifyAndroidPurchase } from './iapVerifyService.js';

// ── 테스트용 키 생성 (모듈 로드 시 1회) ──────────────────────────────────────

// Apple: EC P-256 (ES256)
const { privateKey: applePrivKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const appleKeyPem = applePrivKey.export({ type: 'pkcs8', format: 'pem' }) as string;

// Google: RSA 2048 (RS256)
const { privateKey: googlePrivKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const googleKeyPem = googlePrivKey.export({ type: 'pkcs8', format: 'pem' }) as string;

// ── 공통 테스트 파라미터 ─────────────────────────────────────────────────────

const appleParams = {
  transactionId: 'txn-abc-123',
  keyId: 'TEST_KEY_ID',
  issuerId: 'test-issuer-id',
  privateKey: appleKeyPem,
  bundleId: 'gg.pryzm.union',
};

const googleSa = {
  client_email: 'test@project.iam.gserviceaccount.com',
  private_key: googleKeyPem,
  token_uri: 'https://oauth2.googleapis.com/token',
};

const googleParams = {
  packageName: 'gg.pryzm.union',
  productId: 'premium_monthly',
  purchaseToken: 'google-purchase-token-xyz',
  serviceAccountJson: JSON.stringify(googleSa),
};

// ── 헬퍼: JWS signedTransactionInfo 생성 (서명 없는 더미) ────────────────────

function makeSignedTransactionInfo(productId: string): string {
  const header  = Buffer.from(JSON.stringify({ alg: 'ES256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ productId, transactionId: appleParams.transactionId })).toString('base64url');
  return `${header}.${payload}.dummy-sig`;
}

// ── fetch mock 설정 헬퍼 ─────────────────────────────────────────────────────

function mockFetch(...responses: Array<{ ok?: boolean; status: number; json?: object; text?: string }>) {
  let callIndex = 0;
  vi.stubGlobal('fetch', vi.fn(async () => {
    const r = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return {
      ok:     r.ok ?? (r.status >= 200 && r.status < 300),
      status: r.status,
      json:   async () => r.json ?? {},
      text:   async () => r.text ?? '',
    };
  }));
}

// ── Apple 테스트 ─────────────────────────────────────────────────────────────

describe('verifyApplePurchase', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Production 엔드포인트 200 → valid: true', async () => {
    mockFetch({ status: 200, json: {} });

    const result = await verifyApplePurchase(appleParams);

    expect(result.valid).toBe(true);
    const fetchMock = vi.mocked(global.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][0] as string)).toContain('api.storekit.itunes.apple.com');
  });

  it('Production 404 → Sandbox 200 폴백 성공', async () => {
    mockFetch(
      { status: 404, text: 'not found' },
      { status: 200, json: {} },
    );

    const result = await verifyApplePurchase(appleParams);

    expect(result.valid).toBe(true);
    const fetchMock = vi.mocked(global.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1][0] as string)).toContain('api.storekit-sandbox.itunes.apple.com');
  });

  it('Production 404 + Sandbox 404 → valid: false', async () => {
    mockFetch(
      { status: 404, text: 'not found' },
      { status: 404, text: 'not found' },
    );

    const result = await verifyApplePurchase(appleParams);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/not found/i);
  });

  it('401 반환 시 valid: false (JWT 오류)', async () => {
    mockFetch({ status: 401, text: 'Unauthorized' });

    const result = await verifyApplePurchase(appleParams);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('401');
  });

  it('productId 교차검증 — JWS payload의 productId 불일치 시 valid: false', async () => {
    const signedInfo = makeSignedTransactionInfo('wrong.product.id');
    mockFetch({ status: 200, json: { signedTransactionInfo: signedInfo } });

    const result = await verifyApplePurchase({
      ...appleParams,
      productId: 'expected.product.id',
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/mismatch/i);
  });

  it('productId 교차검증 — 일치 시 valid: true', async () => {
    const matchingProductId = 'gg.pryzm.union.premium';
    const signedInfo = makeSignedTransactionInfo(matchingProductId);
    mockFetch({ status: 200, json: { signedTransactionInfo: signedInfo } });

    const result = await verifyApplePurchase({
      ...appleParams,
      productId: matchingProductId,
    });

    expect(result.valid).toBe(true);
  });

  it('네트워크 에러 시 다음 엔드포인트로 폴백', async () => {
    let callIndex = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      callIndex++;
      if (callIndex === 1) throw new Error('Network error');
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    }));

    const result = await verifyApplePurchase(appleParams);

    expect(result.valid).toBe(true);
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(2);
  });

  it('transactionId가 URL 인코딩되는지 확인', async () => {
    const specialTxId = 'txn/with space+special=chars';
    mockFetch({ status: 200, json: {} });

    await verifyApplePurchase({ ...appleParams, transactionId: specialTxId });

    const calledUrl = vi.mocked(global.fetch).mock.calls[0][0] as string;
    expect(calledUrl).not.toContain(' ');
    expect(calledUrl).toContain(encodeURIComponent(specialTxId));
  });
});

// ── Google 테스트 ─────────────────────────────────────────────────────────────
//
// googleTokenCache는 모듈 레벨 변수이므로 테스트 간 공유됨.
// 각 테스트에서 vi.useFakeTimers() + vi.setSystemTime()으로 캐시를 만료시킨다.
// 캐시 expiresAt = now + 3600, 유효 조건 = expiresAt > now + 60
// → 시간을 캐시 생성 시점 + 3600초 이상으로 전진시키면 캐시 만료.

describe('verifyAndroidPurchase', () => {
  // 캐시 만료 기준 시각: 각 테스트 시작마다 충분히 앞으로 이동
  let currentFakeTime = new Date('2030-01-01T00:00:00Z');

  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.useFakeTimers();
    // 테스트마다 1시간씩 앞으로 이동 → 이전 테스트에서 캐시된 토큰 만료 보장
    currentFakeTime = new Date(currentFakeTime.getTime() + 7200_000);
    vi.setSystemTime(currentFakeTime);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('purchaseState 0 → valid: true', async () => {
    mockFetch(
      { ok: true, status: 200, json: { access_token: 'mock-token-0' } },       // OAuth2 토큰
      { ok: true, status: 200, json: { purchaseState: 0, orderId: 'GPA.123' } }, // 구매 검증
    );

    const result = await verifyAndroidPurchase(googleParams);

    expect(result.valid).toBe(true);
  });

  it('purchaseState 1 (취소됨) → valid: false', async () => {
    mockFetch(
      { ok: true, status: 200, json: { access_token: 'mock-token-1' } },
      { ok: true, status: 200, json: { purchaseState: 1 } },
    );

    const result = await verifyAndroidPurchase(googleParams);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('1');
  });

  it('Google Play API 에러 (비200) → valid: false', async () => {
    mockFetch(
      { ok: true,  status: 200, json: { access_token: 'mock-token-2' } },
      { ok: false, status: 403, text: 'Forbidden' },
    );

    const result = await verifyAndroidPurchase(googleParams);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('403');
  });

  it('잘못된 서비스 계정 JSON → valid: false, fetch 미호출', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const result = await verifyAndroidPurchase({
      ...googleParams,
      serviceAccountJson: 'this is not json {{{',
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/invalid service account/i);
    // JSON 파싱 실패 시 fetch 호출 없이 즉시 반환
    expect(vi.mocked(global.fetch)).not.toHaveBeenCalled();
  });

  it('OAuth2 토큰 교환 실패 → valid: false', async () => {
    mockFetch({ ok: false, status: 401, text: 'invalid_grant' });

    const result = await verifyAndroidPurchase(googleParams);

    expect(result.valid).toBe(false);
    // getGoogleAccessToken이 throw한 에러 메시지가 reason에 담김
    expect(result.reason).toMatch(/Google OAuth2 token fetch failed/i);
  });

  it('OAuth2 토큰 캐시 동작 — 두 번 호출 시 토큰 fetch 1회만', async () => {
    let fetchCallCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      fetchCallCount++;
      if ((url as string).includes('oauth2.googleapis.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: `mock-token-cache-${fetchCallCount}` }),
          text: async (): Promise<string> => '',
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ purchaseState: 0, orderId: 'GPA.456' }),
        text: async (): Promise<string> => '',
      };
    }));

    // 첫 번째 호출 — OAuth2 토큰 취득(1회) + 구매 검증(1회) = 2회
    const result1 = await verifyAndroidPurchase(googleParams);
    expect(result1.valid).toBe(true);
    expect(fetchCallCount).toBe(2);

    // 두 번째 호출 — 캐시된 토큰 사용(0회) + 구매 검증(1회) = 1회 추가
    const result2 = await verifyAndroidPurchase(googleParams);
    expect(result2.valid).toBe(true);
    expect(fetchCallCount).toBe(3);

    const oauthCalls = vi.mocked(global.fetch).mock.calls.filter(
      (call) => (call[0] as string).includes('oauth2.googleapis.com'),
    );
    // OAuth2 토큰 요청은 전체 테스트에서 1회만 발생해야 함
    expect(oauthCalls).toHaveLength(1);
  });
});
