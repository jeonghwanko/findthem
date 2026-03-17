import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import KakaoMap, { type MapMarker } from './KakaoMap';

// useKakaoMap 훅을 mock
vi.mock('../hooks/useKakaoMap', () => ({
  useKakaoMap: vi.fn(() => null),
}));

import { useKakaoMap } from '../hooks/useKakaoMap';
const mockUseKakaoMap = vi.mocked(useKakaoMap);

function createMockMarkers(count: number): MapMarker[] {
  return Array.from({ length: count }, (_, i) => ({
    lat: 37.5 + i * 0.01,
    lng: 127.0 + i * 0.01,
    title: `마커 ${i + 1}`,
    infoContent: `<div>마커 ${i + 1}</div>`,
  }));
}

// Kakao SDK의 new 가능한 mock 생성
function createConstructorMock(instance: object) {
  return vi.fn(function (this: object) {
    Object.assign(this, instance);
  }) as any;
}

describe('KakaoMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseKakaoMap.mockReturnValue(null);
    delete (window as any).kakao;
  });

  it('컨테이너 div를 기본 클래스로 렌더링한다', () => {
    const { container } = render(<KakaoMap markers={[]} />);
    const mapDiv = container.firstChild as HTMLDivElement;
    expect(mapDiv.className).toBe('w-full h-96');
  });

  it('커스텀 className 적용', () => {
    const { container } = render(
      <KakaoMap markers={[]} className="w-full h-[500px] rounded-xl" />,
    );
    const mapDiv = container.firstChild as HTMLDivElement;
    expect(mapDiv.className).toBe('w-full h-[500px] rounded-xl');
  });

  it('map이 null이면 빈 div만 렌더링된다 (SDK 미로드)', () => {
    const markers = createMockMarkers(3);
    const { container } = render(<KakaoMap markers={markers} />);
    const mapDiv = container.firstChild as HTMLDivElement;
    // 지도가 로드되지 않으면 빈 div — 사용자에게 안 보임
    expect(mapDiv.children.length).toBe(0);
  });

  it('마커 없으면 판교역 좌표를 기본값으로 사용', () => {
    render(<KakaoMap markers={[]} />);
    const callArgs = mockUseKakaoMap.mock.calls[0];
    expect(callArgs[1]).toEqual(
      expect.objectContaining({ lat: 37.3947, lng: 127.1112 }),
    );
  });

  it('마커가 있으면 평균 좌표를 center로 계산', () => {
    const markers: MapMarker[] = [
      { lat: 37.0, lng: 127.0, title: 'A', infoContent: '' },
      { lat: 38.0, lng: 128.0, title: 'B', infoContent: '' },
    ];
    render(<KakaoMap markers={markers} />);
    const callArgs = mockUseKakaoMap.mock.calls[0];
    expect(callArgs[1].lat).toBeCloseTo(37.5, 0);
    expect(callArgs[1].lng).toBeCloseTo(127.5, 0);
  });

  it('center prop이 주어지면 계산 대신 그 값을 사용', () => {
    const center = { lat: 35.0, lng: 129.0 };
    const markers = createMockMarkers(3);
    render(<KakaoMap markers={markers} center={center} />);
    const callArgs = mockUseKakaoMap.mock.calls[0];
    expect(callArgs[1].lat).toBe(35.0);
    expect(callArgs[1].lng).toBe(129.0);
  });

  it('center prop이 변경되면 map.setCenter를 호출한다', () => {
    const mockSetCenter = vi.fn();
    const mockMap = { setCenter: mockSetCenter } as unknown as kakao.maps.Map;

    (window as any).kakao = {
      maps: {
        LatLng: createConstructorMock({}),
      },
    };

    mockUseKakaoMap.mockReturnValue(mockMap);

    const { rerender } = render(<KakaoMap markers={[]} center={{ lat: 37.5, lng: 127.0 }} />);

    // center 변경 (geolocation 비동기 응답 시뮬레이션)
    rerender(<KakaoMap markers={[]} center={{ lat: 35.1, lng: 129.0 }} />);

    expect(mockSetCenter).toHaveBeenCalled();
  });

  it('center가 undefined이면 setCenter를 호출하지 않는다', () => {
    const mockSetCenter = vi.fn();
    const mockMap = { setCenter: mockSetCenter } as unknown as kakao.maps.Map;

    (window as any).kakao = {
      maps: {
        LatLng: createConstructorMock({}),
        Marker: createConstructorMock({ setMap: vi.fn() }),
        InfoWindow: createConstructorMock({ open: vi.fn(), close: vi.fn() }),
        event: { addListener: vi.fn() },
        clusterer: null,
      },
    };

    mockUseKakaoMap.mockReturnValue(mockMap);

    render(<KakaoMap markers={[]} />);

    // center가 undefined → setCenter 미호출
    expect(mockSetCenter).not.toHaveBeenCalled();
  });

  it('map이 로드되고 마커가 있으면 Kakao Marker를 생성한다', () => {
    const mockSetMap = vi.fn();
    const mockMap = {} as kakao.maps.Map;

    (window as any).kakao = {
      maps: {
        LatLng: createConstructorMock({}),
        Marker: createConstructorMock({ setMap: mockSetMap }),
        InfoWindow: createConstructorMock({ open: vi.fn(), close: vi.fn() }),
        event: { addListener: vi.fn() },
        clusterer: null,
      },
    };

    mockUseKakaoMap.mockReturnValue(mockMap);
    const markers = createMockMarkers(2);
    render(<KakaoMap markers={markers} useCluster={false} />);

    expect(window.kakao.maps.Marker).toHaveBeenCalledTimes(2);
    expect(mockSetMap).toHaveBeenCalledWith(mockMap);
  });

  it('클러스터러가 있으면 MarkerClusterer를 사용한다', () => {
    const mockMap = {} as kakao.maps.Map;
    const mockAddMarkers = vi.fn();

    (window as any).kakao = {
      maps: {
        LatLng: createConstructorMock({}),
        Marker: createConstructorMock({ setMap: vi.fn() }),
        InfoWindow: createConstructorMock({ open: vi.fn(), close: vi.fn() }),
        event: { addListener: vi.fn() },
        clusterer: {
          MarkerClusterer: createConstructorMock({
            addMarkers: mockAddMarkers,
            clear: vi.fn(),
          }),
        },
      },
    };

    mockUseKakaoMap.mockReturnValue(mockMap);
    const markers = createMockMarkers(3);
    render(<KakaoMap markers={markers} useCluster={true} />);

    expect(window.kakao.maps.clusterer.MarkerClusterer).toHaveBeenCalled();
    expect(mockAddMarkers).toHaveBeenCalled();
  });
});
