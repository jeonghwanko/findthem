import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from './useAuth';
import { TOKEN_STORAGE_KEY } from '@findthem/shared';

// fetch mock helper
function mockFetchSuccess(data: unknown) {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function mockFetchError(status = 401) {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve({ error: 'Unauthorized' }),
  });
}

describe('useAuth', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    globalThis.fetch = vi.fn();
    localStorage.clear();
  });

  it('토큰 없으면 → user: null, loading: false', async () => {
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toBeNull();
  });

  it('저장된 토큰으로 자동 인증 (GET /auth/me)', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'valid-token');
    mockFetchSuccess({ id: 'user-1', name: '테스트', phone: '01012345678' });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toEqual({
      id: 'user-1',
      name: '테스트',
      phone: '01012345678',
    });
  });

  it('저장된 토큰이 무효하면 토큰 삭제', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'expired-token');
    mockFetchError(401);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('login() → 토큰 저장 + user 설정', async () => {
    mockFetchSuccess({
      user: { id: 'user-1', name: '테스트', phone: '01012345678' },
      token: 'new-token',
    });

    const { result } = renderHook(() => useAuth());

    // 초기 로딩 완료 대기
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // login 호출
    mockFetchSuccess({
      user: { id: 'user-1', name: '테스트', phone: '01012345678' },
      token: 'new-token',
    });

    await act(async () => {
      await result.current.login('01012345678', 'password');
    });

    expect(result.current.user).toEqual({
      id: 'user-1',
      name: '테스트',
      phone: '01012345678',
    });
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('new-token');
  });

  it('logout() → 토큰 삭제 + user null', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'valid-token');
    mockFetchSuccess({ id: 'user-1', name: '테스트', phone: '01012345678' });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.user).not.toBeNull();
    });

    act(() => {
      result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('register() → 토큰 저장 + user 설정', async () => {
    const { result } = renderHook(() => useAuth());

    // 초기 로딩 완료 대기 (토큰 없으므로 fetch 호출 없이 바로 완료)
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // register 호출 직전에 mock 설정
    mockFetchSuccess({
      user: { id: 'user-2', name: '신규', phone: '01099887766' },
      token: 'reg-token',
    });

    await act(async () => {
      await result.current.register('신규', '01099887766', 'pass123');
    });

    expect(result.current.user).toEqual({
      id: 'user-2',
      name: '신규',
      phone: '01099887766',
    });
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('reg-token');
  });
});
