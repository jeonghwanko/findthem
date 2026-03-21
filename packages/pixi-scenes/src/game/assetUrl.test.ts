import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// window.location을 모킹하기 위해 동적 import 사용
function mockLocation(protocol: string, origin: string) {
  Object.defineProperty(globalThis, 'window', {
    value: { location: { protocol, origin } },
    writable: true,
    configurable: true,
  });
}

function clearWindow() {
  // @ts-expect-error -- 테스트용 window 제거
  delete globalThis.window;
}

describe('assetUrl', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('웹 환경에서 origin을 포함한 절대 URL 반환', async () => {
    mockLocation('https:', 'https://union.pryzm.gg');
    const { assetUrl } = await import('./assetUrl');
    expect(assetUrl('/tiles/32x32folk.png')).toBe('https://union.pryzm.gg/tiles/32x32folk.png');
    clearWindow();
  });

  it('Capacitor 환경에서 capacitor://localhost 포함', async () => {
    mockLocation('capacitor:', 'capacitor://localhost');
    const { assetUrl } = await import('./assetUrl');
    expect(assetUrl('/tiles/32x32folk.png')).toBe('capacitor://localhost/tiles/32x32folk.png');
    clearWindow();
  });

  it('선행 슬래시 중복 제거', async () => {
    mockLocation('https:', 'https://example.com');
    const { assetUrl } = await import('./assetUrl');
    const result = assetUrl('/spine/human_type.png');
    expect(result).toBe('https://example.com/spine/human_type.png');
    expect(result).not.toContain('//spine');
    clearWindow();
  });

  it('슬래시 없는 경로도 처리', async () => {
    mockLocation('https:', 'https://example.com');
    const { assetUrl } = await import('./assetUrl');
    expect(assetUrl('tiles/folk.png')).toBe('https://example.com/tiles/folk.png');
    clearWindow();
  });
});

describe('IS_NATIVE', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('capacitor: 프로토콜이면 true', async () => {
    mockLocation('capacitor:', 'capacitor://localhost');
    const { IS_NATIVE } = await import('./assetUrl');
    expect(IS_NATIVE).toBe(true);
    clearWindow();
  });

  it('ionic: 프로토콜이면 true', async () => {
    mockLocation('ionic:', 'ionic://localhost');
    const { IS_NATIVE } = await import('./assetUrl');
    expect(IS_NATIVE).toBe(true);
    clearWindow();
  });

  it('https: 프로토콜이면 false', async () => {
    mockLocation('https:', 'https://union.pryzm.gg');
    const { IS_NATIVE } = await import('./assetUrl');
    expect(IS_NATIVE).toBe(false);
    clearWindow();
  });

  it('window 없으면 false', async () => {
    clearWindow();
    const { IS_NATIVE } = await import('./assetUrl');
    expect(IS_NATIVE).toBe(false);
  });
});
