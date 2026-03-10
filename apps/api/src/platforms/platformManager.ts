import type { PlatformAdapter, PlatformPostResult } from './types.js';
import { TwitterAdapter } from './twitter.js';
import { KakaoChannelAdapter } from './kakaoChannel.js';

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
      (text as Record<string, string>)[adapter.name] ||
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
    } catch (err: any) {
      results.push({
        platform: adapter.name,
        success: false,
        postId: null,
        postUrl: null,
        error: err.message,
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
        console.error(`Failed to delete post ${postId} from ${platform}:`, err);
      }
    }
  }
}
