import { useRef, useEffect } from 'react';
import { useKakaoMap } from '../hooks/useKakaoMap';

export interface MapMarker {
  lat: number;
  lng: number;
  title: string;
  infoContent: string;
  onClick?: () => void;
}

interface KakaoMapProps {
  markers: MapMarker[];
  center?: { lat: number; lng: number };
  level?: number;
  className?: string;
  useCluster?: boolean;
}

function computeCenter(markers: MapMarker[]): { lat: number; lng: number } {
  if (markers.length === 0) return { lat: 37.5665, lng: 126.978 };
  const lat = markers.reduce((s, m) => s + m.lat, 0) / markers.length;
  const lng = markers.reduce((s, m) => s + m.lng, 0) / markers.length;
  return { lat, lng };
}

export default function KakaoMap({
  markers,
  center,
  level,
  className,
  useCluster = true,
}: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const defaultCenter = center ?? computeCenter(markers);
  const map = useKakaoMap(containerRef, { ...defaultCenter, level });

  useEffect(() => {
    if (!map) return;

    const kakaoMarkers: kakao.maps.Marker[] = [];
    let openInfoWindow: kakao.maps.InfoWindow | null = null;

    markers.forEach((m) => {
      const position = new window.kakao.maps.LatLng(m.lat, m.lng);
      const marker = new window.kakao.maps.Marker({ position, title: m.title });
      const infoWindow = new window.kakao.maps.InfoWindow({ content: m.infoContent });

      window.kakao.maps.event.addListener(marker, 'click', () => {
        openInfoWindow?.close();
        infoWindow.open(map, marker);
        openInfoWindow = infoWindow;
        m.onClick?.();
      });

      kakaoMarkers.push(marker);
    });

    if (useCluster && window.kakao.maps.clusterer) {
      const clusterer = new window.kakao.maps.clusterer.MarkerClusterer({
        map,
        averageCenter: true,
        minLevel: 6,
      });
      clusterer.addMarkers(kakaoMarkers);
      return () => {
        clusterer.clear();
        openInfoWindow?.close();
      };
    } else {
      kakaoMarkers.forEach((m) => m.setMap(map));
      return () => {
        kakaoMarkers.forEach((m) => m.setMap(null));
        openInfoWindow?.close();
      };
    }
  }, [map, markers, useCluster]);

  return <div ref={containerRef} className={className ?? 'w-full h-96'} />;
}
