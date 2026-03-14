import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';
import type { PlatformAdapter, PlatformPostResult } from './types.js';
import { createLogger } from '../logger.js';

const UPLOAD_ROOT = path.resolve(config.uploadDir);

function getAbsolutePath(relativePath: string): string {
  const fullPath = path.resolve(UPLOAD_ROOT, relativePath.replace(/^\/uploads\//, ''));
  if (!fullPath.startsWith(UPLOAD_ROOT + path.sep) && fullPath !== UPLOAD_ROOT) {
    throw new Error('PATH_TRAVERSAL');
  }
  return fullPath;
}

const log = createLogger('twitter');

/** OAuth 1.0a 서명 생성 */
function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string,
): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');

  const baseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams),
  ].join('&');

  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  return crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64');
}

function buildOAuthHeader(
  method: string,
  url: string,
  extraParams: Record<string, string> = {},
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: config.twitterApiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: config.twitterAccessToken,
    oauth_version: '1.0',
  };

  const allParams = { ...oauthParams, ...extraParams };
  const signature = generateOAuthSignature(
    method,
    url,
    allParams,
    config.twitterApiSecret,
    config.twitterAccessTokenSecret,
  );
  oauthParams.oauth_signature = signature;

  const headerParts = Object.keys(oauthParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ');

  return `OAuth ${headerParts}`;
}

export class TwitterAdapter implements PlatformAdapter {
  readonly name = 'twitter';

  async post(text: string, imagePaths: string[]): Promise<PlatformPostResult> {
    if (!config.twitterApiKey || !config.twitterAccessToken) {
      log.warn('Twitter API keys not configured, skipping');
      return { postId: null, postUrl: null };
    }

    // 이미지 업로드
    const mediaIds: string[] = [];
    for (const imgPath of imagePaths.slice(0, 4)) {
      const mediaId = await this.uploadMedia(imgPath);
      if (mediaId) mediaIds.push(mediaId);
    }

    // 트윗 게시
    const url = 'https://api.twitter.com/2/tweets';
    const body: Record<string, unknown> = { text };
    if (mediaIds.length > 0) {
      body.media = { media_ids: mediaIds };
    }

    const authHeader = buildOAuthHeader('POST', url);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Twitter post failed: ${res.status} ${err}`);
    }

    const data = (await res.json()) as { data: { id: string } };
    const tweetId = data.data.id;

    return {
      postId: tweetId,
      postUrl: `https://x.com/i/status/${tweetId}`,
    };
  }

  async deletePost(postId: string): Promise<void> {
    const url = `https://api.twitter.com/2/tweets/${postId}`;
    const authHeader = buildOAuthHeader('DELETE', url);

    await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: authHeader },
    });
  }

  private async uploadMedia(imagePath: string): Promise<string | null> {
    try {
      const absPath = getAbsolutePath(imagePath);
      const buffer = await fs.readFile(absPath);
      const base64Data = buffer.toString('base64');

      const url = 'https://upload.twitter.com/1.1/media/upload.json';
      const params = {
        media_data: base64Data,
      };

      const authHeader = buildOAuthHeader('POST', url, params);
      const formBody = new URLSearchParams(params);

      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: authHeader },
        body: formBody,
      });

      if (!res.ok) return null;
      const data = (await res.json()) as { media_id_string: string };
      return data.media_id_string;
    } catch {
      return null;
    }
  }
}
