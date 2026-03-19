import { useState, useEffect, useRef } from 'react';

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;

let sdkLoaded = false;
let sdkLoading = false;
const sdkCallbacks: Array<() => void> = [];

function loadKakaoMapSdk(onLoad: () => void) {
  if (sdkLoaded) {
    onLoad();
    return;
  }
  sdkCallbacks.push(onLoad);
  if (sdkLoading) return;
  sdkLoading = true;

  const script = document.createElement('script');
  script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&libraries=clusterer,services&autoload=false`;
  script.onload = () => {
    window.kakao.maps.load(() => {
      sdkLoaded = true;
      sdkLoading = false;
      sdkCallbacks.forEach((cb) => cb());
      sdkCallbacks.length = 0;
    });
  };
  script.onerror = () => {
    sdkLoading = false;
    sdkCallbacks.length = 0;
  };
  document.head.appendChild(script);
}

export interface UseKakaoMapOptions {
  lat: number;
  lng: number;
  level?: number;
}

export function useKakaoMap(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: UseKakaoMapOptions,
) {
  const [map, setMap] = useState<kakao.maps.Map | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!KAKAO_JS_KEY || !containerRef.current) return;

    loadKakaoMapSdk(() => {
      if (!containerRef.current) return;
      const kakaoMap = new window.kakao.maps.Map(containerRef.current, {
        center: new window.kakao.maps.LatLng(optionsRef.current.lat, optionsRef.current.lng),
        level: optionsRef.current.level ?? 7,
      });
      setMap(kakaoMap);
    });
  }, [containerRef]);

  return map;
}

/**
 * GPS 좌표 → 주소 변환 (Kakao Geocoder coord2Address)
 * Kakao Maps SDK가 로드되지 않았으면 자동 로드 후 변환.
 */
export function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!KAKAO_JS_KEY) return Promise.resolve(null);

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 10_000);

    loadKakaoMapSdk(() => {
      if (!window.kakao?.maps?.services) {
        clearTimeout(timeout);
        resolve(null);
        return;
      }
      const geocoder = new window.kakao.maps.services.Geocoder();
      geocoder.coord2Address(lng, lat, (result, status) => {
        clearTimeout(timeout);
        if (status !== window.kakao.maps.services.Status.OK || result.length === 0) {
          resolve(null);
          return;
        }
        const item = result[0];
        resolve(item.road_address?.address_name ?? item.address.address_name);
      });
    });
  });
}

// ── 테스트 전용 헬퍼 (프로덕션 빌드에서 tree-shaking 됨) ──
export function _testReset() {
  sdkLoaded = false;
  sdkLoading = false;
  sdkCallbacks.length = 0;
}

export const _testLoadSdk = loadKakaoMapSdk;
