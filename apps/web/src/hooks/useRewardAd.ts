import { useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

// Google AdMob 테스트 리워드 광고 ID
const TEST_REWARD_AD_ID = 'ca-app-pub-3940256099942544/5224354917';

const REWARD_AD_IDS: Record<string, string> = {
  android: import.meta.env.VITE_ADMOB_REWARD_AD_ID_ANDROID || 'ca-app-pub-3320768302064088/4922782163',
  ios: import.meta.env.VITE_ADMOB_REWARD_AD_ID_IOS || 'ca-app-pub-3320768302064088/4299965636',
};

export function useRewardAd() {
  const [loading, setLoading] = useState(false);
  const isNative = Capacitor.isNativePlatform();

  const showRewardAd = useCallback(async (): Promise<boolean> => {
    if (!isNative) return false;

    setLoading(true);
    try {
      const { AdMob, RewardAdPluginEvents } = await import('@capacitor-community/admob');

      const adId = import.meta.env.DEV ? TEST_REWARD_AD_ID : (REWARD_AD_IDS[Capacitor.getPlatform()] ?? TEST_REWARD_AD_ID);

      // 리스너 등록 → 광고 로드 순서 보장 (타이밍 버그 및 메모리 누수 방지)
      return await new Promise<boolean>((resolve) => {
        void (async () => {
          let settled = false;

          const rewardHandle = await AdMob.addListener(
            RewardAdPluginEvents.Rewarded,
            () => {
              if (!settled) { settled = true; cleanup(); resolve(true); }
            },
          );
          const dismissHandle = await AdMob.addListener(
            RewardAdPluginEvents.Dismissed,
            () => {
              if (!settled) { settled = true; cleanup(); resolve(false); }
            },
          );

          const cleanup = () => {
            rewardHandle.remove();
            dismissHandle.remove();
          };

          try {
            await AdMob.prepareRewardVideoAd({ adId });
            await AdMob.showRewardVideoAd();
          } catch {
            if (!settled) { settled = true; cleanup(); resolve(false); }
          }
        })();
      });
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, [isNative]);

  return { showRewardAd, loading, isNative };
}
