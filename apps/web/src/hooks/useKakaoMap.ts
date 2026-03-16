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
