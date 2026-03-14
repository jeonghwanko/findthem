import type { PlatformAdapter } from './types.js';
import { TwitterAdapter } from './twitter.js';
import { KakaoChannelAdapter } from './kakaoChannel.js';
import { createLogger } from '../logger.js';

const log = createLogger('platformManager');

const adapters: PlatformAdapter[] = [
  new TwitterAdapter(),
  new KakaoChannelAdapter(),
];

export interface PostAllResult {
  platform: string;
  success: boolean;
  postId: string | null;
  postUrl: string | null;
  error?: string;
}

export async function postToAllPlatforms(
  text: Record<string, string>,
  imagePaths: string[],
): Promise<PostAllResult[]> {
  const results: PostAllResult[] = [];

  for (const adapter of adapters) {
    const platformText =
      text[adapter.name] ||
      text.general ||
      Object.values(text)[0];

    try {
      const result = await adapter.post(platformText, imagePaths);
      results.push({
        platform: adapter.name,
        success: result.postId !== null,
        postId: result.postId,
        postUrl: result.postUrl,
      });
    } catch (err: unknown) {
      results.push({
        platform: adapter.name,
        success: false,
        postId: null,
        postUrl: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

export async function deleteFromAllPlatforms(
  posts: { platform: string; postId: string }[],
): Promise<void> {
  for (const { platform, postId } of posts) {
    const adapter = adapters.find((a) => a.name === platform);
    if (adapter) {
      try {
        await adapter.deletePost(postId);
      } catch (err) {
        log.error({ err, postId, platform }, `Failed to delete post from platform`);
      }
    }
  }
}
