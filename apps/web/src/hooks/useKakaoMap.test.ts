import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKakaoMap, reverseGeocode, _testReset, _testLoadSdk } from './useKakaoMap';

// script 삽입을 가로채기 위한 헬퍼
let capturedScripts: Array<{
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}> = [];

describe('useKakaoMap', () => {
  beforeEach(() => {
    _testReset();
    capturedScripts = [];

    vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      const el = node as HTMLScriptElement;
      if (el.src?.includes('dapi.kakao.com')) {
        capturedScripts.push({
          src: el.src,
          onload: el.onload as (() => void) | null,
          onerror: el.onerror as (() => void) | null,
        });
      }
      return node;
    });

    delete (window as any).kakao;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as any).kakao;
  });

  // ── 1. KAKAO_JS_KEY가 설정되어 있으면 SDK 로드를 시도한다 ──
  it('KAKAO_JS_KEY가 있으면 SDK 스크립트를 로드 시도한다', () => {
    // .env.local에 VITE_KAKAO_JS_KEY가 설정되어 있으므로 SDK 로드 시도됨
    const container = document.createElement('div');
    const { result } = renderHook(() =>
      useKakaoMap({ current: container }, { lat: 37.5, lng: 127.0 }),
    );
    // SDK 로딩 중이므로 map은 아직 null
    expect(result.current).toBeNull();
    // 스크립트가 추가됨
    expect(capturedScripts).toHaveLength(1);
    expect(capturedScripts[0].src).toContain('dapi.kakao.com');
  });

  it('containerRef가 null이면 map을 null로 반환한다', () => {
    const { result } = renderHook(() =>
      useKakaoMap({ current: null }, { lat: 37.5, lng: 127.0 }),
    );
    expect(result.current).toBeNull();
  });
});

// SDK 로딩 동작은 loadKakaoMapSdk 함수를 직접 테스트
// (useKakaoMap 내부에서 KAKAO_JS_KEY 체크가 있어 키 없이는 진입 불가)
describe('loadKakaoMapSdk (내부 함수 — _testLoadSdk 경유)', () => {
  let onLoadCb: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    _testReset();
    capturedScripts = [];
    onLoadCb = vi.fn();

    vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      const el = node as HTMLScriptElement;
      capturedScripts.push({
        src: el.src,
        onload: el.onload as (() => void) | null,
        onerror: el.onerror as (() => void) | null,
      });
      return node;
    });

    delete (window as any).kakao;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as any).kakao;
  });

  it('SDK 스크립트를 document.head에 추가한다', async () => {
    const { _testLoadSdk } = await import('./useKakaoMap');
    _testReset();
    _testLoadSdk(onLoadCb);
    expect(capturedScripts).toHaveLength(1);
    expect(capturedScripts[0].src).toContain('dapi.kakao.com');
  });

  it('script.onerror 발생 시 콜백이 호출되지 않는다', async () => {
    const { _testLoadSdk } = await import('./useKakaoMap');
    _testReset();
    _testLoadSdk(onLoadCb);

    // 네트워크 에러 시뮬레이션
    capturedScripts[0].onerror!();

    expect(onLoadCb).not.toHaveBeenCalled();
  });

  it('script.onerror 후 재시도가 가능하다 (sdkLoading 리셋)', async () => {
    const { _testLoadSdk } = await import('./useKakaoMap');
    _testReset();

    // 첫 번째 시도 — 실패
    _testLoadSdk(onLoadCb);
    capturedScripts[0].onerror!();
    expect(onLoadCb).not.toHaveBeenCalled();

    // 두 번째 시도 — sdkLoading이 false로 리셋되어 새 스크립트 추가
    const onLoadCb2 = vi.fn();
    _testLoadSdk(onLoadCb2);
    expect(capturedScripts).toHaveLength(2);
  });

  it('SDK 로드 실패 시 대기 중인 모든 콜백이 소실된다', async () => {
    const { _testLoadSdk } = await import('./useKakaoMap');
    _testReset();

    const cb1 = vi.fn();
    const cb2 = vi.fn();

    // 두 컴포넌트가 동시에 SDK 요청
    _testLoadSdk(cb1);
    _testLoadSdk(cb2); // sdkLoading=true → 큐에만 추가

    expect(capturedScripts).toHaveLength(1); // 스크립트 1번만 추가

    // 실패 → 두 콜백 모두 소실 (에러 콜백이 없음!)
    capturedScripts[0].onerror!();
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });

  it('script.onload 후 window.kakao 없으면 에러 발생', async () => {
    const { _testLoadSdk } = await import('./useKakaoMap');
    _testReset();
    _testLoadSdk(onLoadCb);

    // window.kakao가 없는 상태에서 onload → TypeError
    expect(() => capturedScripts[0].onload!()).toThrow();
  });

  it('script.onload 성공 시 콜백이 호출된다', async () => {
    const { _testLoadSdk } = await import('./useKakaoMap');
    _testReset();
    _testLoadSdk(onLoadCb);

    // Kakao SDK mock
    (window as any).kakao = {
      maps: {
        load: vi.fn((cb: () => void) => cb()),
      },
    };

    capturedScripts[0].onload!();
    expect(onLoadCb).toHaveBeenCalledOnce();
  });

  it('kakao.maps.load가 콜백을 호출하지 않으면 onLoad 미호출', async () => {
    const { _testLoadSdk } = await import('./useKakaoMap');
    _testReset();
    _testLoadSdk(onLoadCb);

    (window as any).kakao = {
      maps: {
        load: vi.fn(), // 콜백 미호출 (SDK 초기화 hang)
      },
    };

    capturedScripts[0].onload!();
    expect(window.kakao.maps.load).toHaveBeenCalled();
    expect(onLoadCb).not.toHaveBeenCalled(); // 콜백 미호출 → map은 null
  });
});

// ── reverseGeocode ──
describe('reverseGeocode', () => {
  beforeEach(() => {
    _testReset();
    capturedScripts = [];

    vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      const el = node as HTMLScriptElement;
      capturedScripts.push({
        src: el.src,
        onload: el.onload as (() => void) | null,
        onerror: el.onerror as (() => void) | null,
      });
      return node;
    });

    delete (window as any).kakao;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as any).kakao;
  });

  function setupKakaoWithGeocoder(coord2AddressMock: (...args: unknown[]) => void) {
    (window as any).kakao = {
      maps: {
        load: vi.fn((cb: () => void) => cb()),
        services: {
          Status: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS', ERROR: 'ERROR' },
          Geocoder: vi.fn().mockImplementation(() => ({
            coord2Address: coord2AddressMock,
          })),
        },
      },
    };
  }

  it('도로명 주소가 있으면 도로명 주소를 반환한다', async () => {
    const coord2Address = vi.fn((_lng: number, _lat: number, cb: (result: unknown[], status: string) => void) => {
      cb([{
        road_address: { address_name: '서울특별시 송파구 송이로34길 62' },
        address: { address_name: '서울특별시 송파구 가락동 123' },
      }], 'OK');
    });
    setupKakaoWithGeocoder(coord2Address);

    const promise = reverseGeocode(37.48514, 127.12665);

    // SDK onload 트리거
    capturedScripts[0].onload!();

    const result = await promise;
    expect(result).toBe('서울특별시 송파구 송이로34길 62');
    expect(coord2Address).toHaveBeenCalledWith(127.12665, 37.48514, expect.any(Function));
  });

  it('도로명 주소가 없으면 지번 주소를 반환한다', async () => {
    const coord2Address = vi.fn((_lng: number, _lat: number, cb: (result: unknown[], status: string) => void) => {
      cb([{
        road_address: null,
        address: { address_name: '서울특별시 송파구 가락동 123' },
      }], 'OK');
    });
    setupKakaoWithGeocoder(coord2Address);

    const promise = reverseGeocode(37.48514, 127.12665);
    capturedScripts[0].onload!();

    const result = await promise;
    expect(result).toBe('서울특별시 송파구 가락동 123');
  });

  it('Geocoder 결과가 비어있으면 null을 반환한다', async () => {
    const coord2Address = vi.fn((_lng: number, _lat: number, cb: (result: unknown[], status: string) => void) => {
      cb([], 'ZERO_RESULTS');
    });
    setupKakaoWithGeocoder(coord2Address);

    const promise = reverseGeocode(0, 0);
    capturedScripts[0].onload!();

    expect(await promise).toBeNull();
  });

  it('services 객체가 없으면 null을 반환한다', async () => {
    (window as any).kakao = {
      maps: {
        load: vi.fn((cb: () => void) => cb()),
        // services 없음
      },
    };

    const promise = reverseGeocode(37.5, 127.0);
    capturedScripts[0].onload!();

    expect(await promise).toBeNull();
  });

  it('SDK 로드 실패 시 10초 타임아웃으로 null을 반환한다', async () => {
    vi.useFakeTimers();

    const promise = reverseGeocode(37.5, 127.0);

    // SDK 로드 실패
    capturedScripts[0].onerror!();

    // 10초 경과
    vi.advanceTimersByTime(10_000);

    expect(await promise).toBeNull();
    vi.useRealTimers();
  });
});
