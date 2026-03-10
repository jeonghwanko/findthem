import { config } from '../config.js';
import type { PlatformAdapter, PlatformPostResult } from './types.js';

export class KakaoChannelAdapter implements PlatformAdapter {
  readonly name = 'kakao_channel';

  async post(text: string, _imagePaths: string[]): Promise<PlatformPostResult> {
    if (!config.kakaoAdminKey || !config.kakaoChannelId) {
      console.warn('Kakao API keys not configured, skipping');
      return { postId: null, postUrl: null };
    }

    // 카카오톡 채널 메시지 전송 (채널 피드 게시)
    // https://developers.kakao.com/docs/latest/ko/kakaotalk-channel/rest-api
    const url = 'https://kapi.kakao.com/v2/api/talk/memo/default/send';

    const templateObject = {
      object_type: 'text',
      text: text.slice(0, 200),
      link: {
        web_url: config.webOrigin,
        mobile_web_url: config.webOrigin,
      },
      button_title: '자세히 보기',
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `KakaoAK ${config.kakaoAdminKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          template_object: JSON.stringify(templateObject),
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error('Kakao post failed:', err);
        return { postId: null, postUrl: null };
      }

      // 카카오 채널 메시지는 별도 postId를 반환하지 않을 수 있음
      return { postId: `kakao_${Date.now()}`, postUrl: null };
    } catch (err) {
      console.error('Kakao post error:', err);
      return { postId: null, postUrl: null };
    }
  }

  async deletePost(_postId: string): Promise<void> {
    // 카카오톡 채널 메시지는 삭제 API가 제한적
    console.warn('Kakao channel message deletion not supported');
  }
}
