import { createPrivateKey, createSign } from 'node:crypto';
import { createLogger } from '../logger.js';

const log = createLogger('iapVerifyService');

// ── 공통 타입 ─────────────────────────────────────────────────────────────────

export interface IAPVerifyResult {
  valid: boolean;
  /** 검증 실패 또는 에러 이유 */
  reason?: string;
}

// ── Apple App Store Server API ────────────────────────────────────────────────

/**
 * Apple ES256 JWT 생성 (App Store Server API 인증용)
 * - kid: App Store Connect → Keys에서 발급한 Key ID
 * - iss: App Store Connect → Issuer ID
 * - bid: 앱 Bundle ID (예: gg.pryzm.union)
 * - 유효기간: 5분
 */
function createAppleJWT(keyId: string, issuerId: string, bundleId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);

  const header  = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: issuerId,
    iat: now,
    exp: now + 300,
    aud: 'appstoreconnect-v1',
    bid: bundleId,
  })).toString('base64url');

  const data = `${header}.${payload}`;
  const key  = createPrivateKey(privateKey);
  const sign = createSign('SHA256');
  sign.update(data);
  sign.end();
  const sig = sign.sign(key).toString('base64url');

  return `${data}.${sig}`;
}

/**
 * Apple App Store Server API로 트랜잭션 검증
 * GET /inApps/v2/transactions/{transactionId}
 *
 * Production 실패 시 Sandbox로 자동 폴백 (TestFlight 구매 대응)
 * productId가 제공되면 응답 JWS payload의 productId와 교차검증 수행
 */
export async function verifyApplePurchase(params: {
  transactionId: string;
  productId?: string;
  keyId: string;
  issuerId: string;
  privateKey: string;
  bundleId: string;
}): Promise<IAPVerifyResult> {
  const { transactionId, productId, keyId, issuerId, privateKey, bundleId } = params;

  const encodedTxId = encodeURIComponent(transactionId);
  const endpoints = [
    `https://api.storekit.itunes.apple.com/inApps/v2/transactions/${encodedTxId}`,
    `https://api.storekit-sandbox.itunes.apple.com/inApps/v2/transactions/${encodedTxId}`,
  ];

  for (const url of endpoints) {
    try {
      const jwt = createAppleJWT(keyId, issuerId, bundleId, privateKey);
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${jwt}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (res.status === 200) {
        const body = await res.json().catch(() => ({})) as { signedTransactionInfo?: string };

        // JWS payload에서 productId 교차검증 (서명 검증 없이 payload만 디코딩)
        if (productId && body.signedTransactionInfo) {
          const parts = body.signedTransactionInfo.split('.');
          const payloadB64 = parts[1];
          if (payloadB64) {
            try {
              const jwsPayload = JSON.parse(
                Buffer.from(payloadB64, 'base64url').toString(),
              ) as { productId?: string };
              if (jwsPayload.productId !== productId) {
                log.warn(
                  { transactionId, expected: productId, got: jwsPayload.productId },
                  'Apple IAP productId mismatch',
                );
                return {
                  valid: false,
                  reason: `Product mismatch: expected ${productId}, got ${jwsPayload.productId}`,
                };
              }
            } catch (parseErr) {
              log.warn({ parseErr, transactionId }, 'Apple IAP JWS payload parse failed — rejecting');
              return { valid: false, reason: 'JWS payload parse failed' };
            }
          }
        }

        log.info({ transactionId, url }, 'Apple IAP transaction verified');
        return { valid: true };
      }

      if (res.status === 404) {
        // Production에서 없으면 Sandbox 폴백으로 계속
        log.info({ transactionId, url }, 'Apple IAP transaction not found, trying next endpoint');
        continue;
      }

      // 401 = JWT 오류, 기타 = API 오류
      const errBody = await res.text().catch(() => '');
      log.warn({ transactionId, status: res.status, body: errBody }, 'Apple IAP API error');
      return { valid: false, reason: `Apple API returned ${res.status}` };

    } catch (err) {
      log.warn({ err, transactionId, url }, 'Apple IAP request failed');
      // 네트워크 오류면 다음 엔드포인트 시도
      continue;
    }
  }

  return { valid: false, reason: 'Transaction not found on App Store (production + sandbox)' };
}

// ── Google Play Developer API ─────────────────────────────────────────────────

interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
  token_uri: string;
}

/**
 * Google 서비스 계정 RS256 JWT 생성 (OAuth2 토큰 교환용)
 */
function createGoogleJWT(sa: GoogleServiceAccount): string {
  const now = Math.floor(Date.now() / 1000);

  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss:   sa.client_email,
    sub:   sa.client_email,
    aud:   sa.token_uri,
    iat:   now,
    exp:   now + 3600,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
  })).toString('base64url');

  const data = `${header}.${payload}`;
  const key  = createPrivateKey(sa.private_key);
  const sign = createSign('RSA-SHA256');
  sign.update(data);
  sign.end();
  const sig = sign.sign(key).toString('base64url');

  return `${data}.${sig}`;
}

let googleTokenCache: { token: string; expiresAt: number } | null = null;

/** 서비스 계정 OAuth2 액세스 토큰 취득 (만료 60초 전까지 캐시 재사용) */
async function getGoogleAccessToken(sa: GoogleServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (googleTokenCache && googleTokenCache.expiresAt > now + 60) {
    return googleTokenCache.token;
  }

  const jwt = createGoogleJWT(sa);

  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google OAuth2 token fetch failed: ${res.status} ${body}`);
  }

  const data = await res.json() as { access_token?: string };
  if (!data.access_token) throw new Error('Google OAuth2: access_token missing in response');

  googleTokenCache = { token: data.access_token, expiresAt: now + 3600 };
  return data.access_token;
}

/**
 * Google Play Developer API로 구매 검증
 * GET /androidpublisher/v3/applications/{packageName}/purchases/products/{productId}/tokens/{purchaseToken}
 *
 * purchaseState:
 *   0 = Purchased (유효)
 *   1 = Canceled
 *   2 = Pending
 */
export async function verifyAndroidPurchase(params: {
  packageName: string;
  productId: string;
  purchaseToken: string;
  serviceAccountJson: string;
}): Promise<IAPVerifyResult> {
  const { packageName, productId, purchaseToken, serviceAccountJson } = params;

  let sa: GoogleServiceAccount;
  try {
    sa = JSON.parse(serviceAccountJson) as GoogleServiceAccount;
  } catch {
    log.error({ productId }, 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid JSON');
    return { valid: false, reason: 'Invalid service account configuration' };
  }

  try {
    const accessToken = await getGoogleAccessToken(sa);

    const url = [
      'https://androidpublisher.googleapis.com/androidpublisher/v3/applications',
      encodeURIComponent(packageName),
      'purchases/products',
      encodeURIComponent(productId),
      'tokens',
      encodeURIComponent(purchaseToken),
    ].join('/');

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      log.warn({ productId, purchaseToken: purchaseToken.slice(0, 20), status: res.status, body }, 'Google Play API error');
      return { valid: false, reason: `Google Play API returned ${res.status}` };
    }

    const data = await res.json() as {
      purchaseState?:     number;
      consumptionState?:  number;
      orderId?:           string;
      acknowledgementState?: number;
    };

    // purchaseState 0 = Purchased
    if (data.purchaseState !== 0) {
      log.warn({ productId, purchaseState: data.purchaseState }, 'Google Play purchase not in PURCHASED state');
      return { valid: false, reason: `Purchase state is ${data.purchaseState} (expected 0)` };
    }

    log.info({ productId, orderId: data.orderId }, 'Google Play purchase verified');
    return { valid: true };

  } catch (err) {
    log.error({ err, productId }, 'Google Play verification request failed');
    return { valid: false, reason: err instanceof Error ? err.message : 'Unknown error' };
  }
}
