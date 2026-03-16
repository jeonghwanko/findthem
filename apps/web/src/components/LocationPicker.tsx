import { useRef, useEffect, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useKakaoMap } from '../hooks/useKakaoMap';

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;

const DEFAULT_LAT = 37.5665;
const DEFAULT_LNG = 126.978;

// Daum Postcode 스크립트 로딩 상태 (모듈 레벨 — 중복 로드 방지)
let daumLoading = false;
let daumLoaded = false;
const daumCallbacks: Array<() => void> = [];

function loadDaumPostcodeScript(onReady: () => void) {
  if (daumLoaded) { onReady(); return; }
  daumCallbacks.push(onReady);
  if (daumLoading) return;
  daumLoading = true;

  const script = document.createElement('script');
  script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
  script.onload = () => {
    daumLoaded = true;
    daumLoading = false;
    daumCallbacks.forEach((cb) => cb());
    daumCallbacks.length = 0;
  };
  script.onerror = () => {
    daumLoading = false;
    daumCallbacks.length = 0;
  };
  document.head.appendChild(script);
}

export interface LocationPickerProps {
  address: string;
  lat: number | null;
  lng: number | null;
  onAddressChange: (address: string) => void;
  onLocationChange: (lat: number, lng: number) => void;
}

export default function LocationPicker({
  address,
  lat,
  lng,
  onAddressChange,
  onLocationChange,
}: LocationPickerProps) {
  const { t } = useTranslation();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<kakao.maps.Marker | null>(null);
  const [geoError, setGeoError] = useState('');

  // 항상 최신 콜백을 참조하는 stable ref — 이벤트 리스너 재등록 없이 최신 함수 사용
  const onLocationChangeRef = useRef(onLocationChange);
  useEffect(() => { onLocationChangeRef.current = onLocationChange; });

  const map = useKakaoMap(mapContainerRef, {
    lat: lat ?? DEFAULT_LAT,
    lng: lng ?? DEFAULT_LNG,
    level: 5,
  });

  // 지도 초기화 후 마커 생성 및 클릭 이벤트 등록
  useEffect(() => {
    if (!map) return;

    const position = new window.kakao.maps.LatLng(lat ?? DEFAULT_LAT, lng ?? DEFAULT_LNG);
    const marker = new window.kakao.maps.Marker({ position, map });
    markerRef.current = marker;

    const handleClick = (mouseEvent: kakao.maps.MouseEvent) => {
      const clickedLat = mouseEvent.latLng.getLat();
      const clickedLng = mouseEvent.latLng.getLng();
      marker.setPosition(new window.kakao.maps.LatLng(clickedLat, clickedLng));
      setGeoError('');
      onLocationChangeRef.current(clickedLat, clickedLng);
    };

    window.kakao.maps.event.addListener(map, 'click', handleClick);

    return () => {
      window.kakao.maps.event.removeListener(map, 'click', handleClick);
      marker.setMap(null);
    };
    // map이 초기화될 때 한 번만 등록. 콜백은 stable ref로 항상 최신 유지.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // lat/lng prop 변경 시 지도 중심 및 마커 위치 동기화
  useEffect(() => {
    if (!map || lat === null || lng === null) return;
    const latlng = new window.kakao.maps.LatLng(lat, lng);
    map.setCenter(latlng);
    markerRef.current?.setPosition(latlng);
  }, [map, lat, lng]);

  const handleAddressSearch = useCallback(() => {
    loadDaumPostcodeScript(() => {
      if (!window.daum?.Postcode) return;

      new window.daum.Postcode({
        oncomplete: (data: DaumAddressData) => {
          const selectedAddress = data.roadAddress || data.address;
          onAddressChange(selectedAddress);
          setGeoError('');

          if (!window.kakao?.maps?.services) return;

          const geocoder = new window.kakao.maps.services.Geocoder();
          geocoder.addressSearch(selectedAddress, (results, status) => {
            if (status === window.kakao.maps.services.Status.OK && results.length > 0) {
              onLocationChangeRef.current(parseFloat(results[0].y), parseFloat(results[0].x));
            } else {
              setGeoError(t('report.geoError'));
            }
          });
        },
      }).open();
    });
  }, [onAddressChange, t]);

  const hasMap = Boolean(KAKAO_JS_KEY);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={address}
          onChange={(e) => { onAddressChange(e.target.value); }}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
          placeholder={t('report.lastSeenPlaceholder')}
        />
        <button
          type="button"
          onClick={handleAddressSearch}
          aria-label={t('report.addressSearch')}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 transition-colors whitespace-nowrap"
        >
          {t('report.addressSearch')}
        </button>
      </div>

      {geoError && (
        <p className="text-xs text-red-500">{geoError}</p>
      )}

      {hasMap && (
        <div
          ref={mapContainerRef}
          className="w-full h-64 rounded-lg overflow-hidden border border-gray-200"
        />
      )}

      {hasMap && map && (
        <p className="text-xs text-gray-500">{t('report.mapClickHint')}</p>
      )}

      {lat !== null && lng !== null && (
        <p className="text-xs text-gray-400">
          {t('report.coordsLabel', { lat: lat.toFixed(5), lng: lng.toFixed(5) })}
        </p>
      )}
    </div>
  );
}
