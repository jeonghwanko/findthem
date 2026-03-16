import { config } from '../config.js';
import { createLogger } from '../logger.js';

const log = createLogger('googleAuth');

// ── In-memory token cache ──

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let tokenCache: CachedToken | null = null;

// ── Google OAuth2 token response ──

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

// ── Shared getAccessToken with in-memory caching ──

/**
 * Returns a valid Google OAuth2 access token, refreshing via the configured
 * refresh token when the cached token is missing or within 5 minutes of expiry.
 */
export async function getAccessToken(): Promise<string> {
  if (!config.googleClientId || !config.googleClientSecret || !config.googleRefreshToken) {
    throw new Error('Google OAuth2 credentials not configured');
  }

  const now = Date.now();
  const FIVE_MINUTES_MS = 5 * 60 * 1000;

  // Return cached token if still valid (with 5-minute buffer)
  if (tokenCache && tokenCache.expiresAt - now > FIVE_MINUTES_MS) {
    return tokenCache.accessToken;
  }

  log.info('Refreshing Google OAuth2 access token');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      refresh_token: config.googleRefreshToken,
      grant_type: 'refresh_token',
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  });

  const data = (await res.json()) as TokenResponse;

  if (!res.ok || !data.access_token) {
    throw new Error(`Failed to obtain Google access token: ${data.error ?? res.status}`);
  }

  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + expiresIn * 1000,
  };

  return tokenCache.accessToken;
}
