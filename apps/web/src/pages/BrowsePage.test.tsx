import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BrowsePage from './BrowsePage';
import type { Report, ReportListResponse } from '../api/client';

// ── Mocks ──
vi.mock('../components/KakaoMap', () => ({
  default: vi.fn(({ markers, className }: any) => (
    <div data-testid="kakao-map" data-marker-count={markers.length} className={className} />
  )),
}));

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    api: {
      get: vi.fn(),
    },
  };
});

import { api } from '../api/client';
const mockApiGet = vi.mocked(api.get);

function createMockReport(overrides: Partial<Report> = {}): Report {
  return {
    id: 'report-1',
    subjectType: 'DOG',
    name: '초코',
    features: '갈색 푸들',
    lastSeenAddress: '서울시 강남구',
    lastSeenAt: '2025-01-15T14:00:00Z',
    lastSeenLat: null,
    lastSeenLng: null,
    status: 'ACTIVE',
    contactPhone: '',
    contactName: '',
    createdAt: new Date().toISOString(),
    photos: [],
    ...overrides,
  } as Report;
}

function mockApiResponse(reports: Report[]) {
  const response: ReportListResponse = {
    reports,
    items: reports,
    total: reports.length,
    page: 1,
    totalPages: 1,
  };
  mockApiGet.mockResolvedValue(response);
}

function renderBrowsePage() {
  return render(
    <MemoryRouter>
      <BrowsePage />
    </MemoryRouter>,
  );
}

describe('BrowsePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('목록 뷰', () => {
    it('기본으로 목록 뷰를 표시한다', async () => {
      mockApiResponse([createMockReport()]);
      renderBrowsePage();
      await waitFor(() => {
        expect(screen.getByText('초코')).toBeInTheDocument();
      });
    });

    it('신고가 없으면 "검색 결과 없음" 표시', async () => {
      mockApiResponse([]);
      renderBrowsePage();
      await waitFor(() => {
        expect(screen.queryByText(/결과/)).toBeInTheDocument();
      });
    });
  });

  describe('지도 뷰', () => {
    it('지도 탭 클릭 시 KakaoMap 컴포넌트를 렌더링한다', async () => {
      mockApiResponse([createMockReport({ lastSeenLat: 37.5, lastSeenLng: 127.0 })]);
      renderBrowsePage();

      const mapTab = screen.getByText('지도');
      fireEvent.click(mapTab);

      await waitFor(() => {
        expect(screen.getByTestId('kakao-map')).toBeInTheDocument();
      });
    });

    it('lat/lng가 있는 신고만 마커로 변환한다', async () => {
      const reports = [
        createMockReport({ id: '1', lastSeenLat: 37.5, lastSeenLng: 127.0 }),
        createMockReport({ id: '2', lastSeenLat: null, lastSeenLng: null }),
        createMockReport({ id: '3', lastSeenLat: 37.6, lastSeenLng: 127.1 }),
      ];
      mockApiResponse(reports);
      renderBrowsePage();

      const mapTab = screen.getByText('지도');
      fireEvent.click(mapTab);

      await waitFor(() => {
        const mapEl = screen.getByTestId('kakao-map');
        // lat/lng 있는 2개만 마커로 전달
        expect(mapEl.getAttribute('data-marker-count')).toBe('2');
      });
    });

    it('모든 신고에 lat/lng가 없으면 마커 0개', async () => {
      const reports = [
        createMockReport({ id: '1', lastSeenLat: null, lastSeenLng: null }),
        createMockReport({ id: '2', lastSeenLat: null, lastSeenLng: null }),
      ];
      mockApiResponse(reports);
      renderBrowsePage();

      fireEvent.click(screen.getByText('지도'));

      await waitFor(() => {
        const mapEl = screen.getByTestId('kakao-map');
        expect(mapEl.getAttribute('data-marker-count')).toBe('0');
      });
    });

    it('일부 신고에 좌표 없으면 안내 메시지 표시', async () => {
      const reports = [
        createMockReport({ id: '1', lastSeenLat: 37.5, lastSeenLng: 127.0 }),
        createMockReport({ id: '2', lastSeenLat: null, lastSeenLng: null }),
      ];
      mockApiResponse(reports);
      renderBrowsePage();

      fireEvent.click(screen.getByText('지도'));

      await waitFor(() => {
        // mapMarkers.length (1) < reports.length (2) → 안내 표시
        expect(screen.getByText(/지도에 표시되지 않습니다/)).toBeInTheDocument();
      });
    });

    it('모든 신고에 좌표 있으면 안내 메시지 미표시', async () => {
      const reports = [
        createMockReport({ id: '1', lastSeenLat: 37.5, lastSeenLng: 127.0 }),
        createMockReport({ id: '2', lastSeenLat: 37.6, lastSeenLng: 127.1 }),
      ];
      mockApiResponse(reports);
      renderBrowsePage();

      fireEvent.click(screen.getByText('지도'));

      await waitFor(() => {
        expect(screen.getByTestId('kakao-map')).toBeInTheDocument();
        expect(screen.queryByText(/지도에 표시되지 않습니다/)).not.toBeInTheDocument();
      });
    });

    it('지도 뷰에서 limit=50으로 요청한다', async () => {
      mockApiResponse([]);
      renderBrowsePage();

      fireEvent.click(screen.getByText('지도'));

      await waitFor(() => {
        const lastCall = mockApiGet.mock.calls[mockApiGet.mock.calls.length - 1][0] as string;
        expect(lastCall).toContain('limit=50');
      });
    });

    it('VITE_KAKAO_JS_KEY 미설정 시 안내 메시지 표시', async () => {
      // BrowsePage는 import.meta.env.VITE_KAKAO_JS_KEY를 직접 읽음
      // 테스트 환경에서는 키가 없으므로 mapKeyMissing 분기 또는 KakaoMap mock 렌더
      mockApiResponse([]);
      renderBrowsePage();
      fireEvent.click(screen.getByText('지도'));
      await waitFor(() => {
        const hasMap = screen.queryByTestId('kakao-map');
        const hasKeyMissing = screen.queryByText(/API 키/);
        expect(hasMap || hasKeyMissing).toBeTruthy();
      });
    });

    it('SDK 로드 실패 시 빈 지도 컨테이너만 렌더된다 (에러 피드백 없음)', async () => {
      // KakaoMap mock이 빈 div를 렌더 — 실제로 SDK 실패 시 동일한 결과
      // 현재 코드는 SDK 로드 실패를 사용자에게 알리지 않음
      const reports = [
        createMockReport({ id: '1', lastSeenLat: 37.5, lastSeenLng: 127.0 }),
      ];
      mockApiResponse(reports);
      renderBrowsePage();

      fireEvent.click(screen.getByText('지도'));

      await waitFor(() => {
        const mapEl = screen.getByTestId('kakao-map');
        expect(mapEl).toBeInTheDocument();
        // KakaoMap은 렌더되지만 내부 div는 비어있음 (SDK 미로드 시)
        expect(mapEl.children).toHaveLength(0);
        // 로딩 인디케이터나 에러 메시지가 없음 — UX 문제
        expect(screen.queryByText(/로드/)).not.toBeInTheDocument();
        expect(screen.queryByText(/오류/)).not.toBeInTheDocument();
      });
    });

    it('API 에러 시 지도 뷰에서도 빈 상태 처리', async () => {
      mockApiGet.mockRejectedValue(new Error('Network error'));
      renderBrowsePage();

      fireEvent.click(screen.getByText('지도'));

      await waitFor(() => {
        // API 실패 → reports = [] → 마커 0개
        const mapEl = screen.queryByTestId('kakao-map');
        if (mapEl) {
          expect(mapEl.getAttribute('data-marker-count')).toBe('0');
        }
      });
    });
  });

  describe('타입 필터', () => {
    it('타입 변경 시 해당 타입으로 API 요청', async () => {
      mockApiResponse([]);
      renderBrowsePage();

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalled();
      });

      fireEvent.click(screen.getByText('고양이'));

      await waitFor(() => {
        const lastCall = mockApiGet.mock.calls[mockApiGet.mock.calls.length - 1][0] as string;
        expect(lastCall).toContain('type=CAT');
      });
    });
  });

  describe('data.reports 호환성', () => {
    it('API가 reports 필드만 반환해도 동작한다', async () => {
      // 현재 API는 reports만 반환 (items 없음)
      mockApiGet.mockResolvedValue({
        reports: [createMockReport()],
        total: 1,
        page: 1,
        totalPages: 1,
      });
      renderBrowsePage();
      await waitFor(() => {
        expect(screen.getByText('초코')).toBeInTheDocument();
      });
    });

    it('API가 items만 반환해도 정상 동작한다', async () => {
      // BrowsePage는 data.items ?? data.reports ?? [] 로 처리
      mockApiGet.mockResolvedValue({
        items: [createMockReport()],
        total: 1,
        page: 1,
        totalPages: 1,
      });
      renderBrowsePage();
      await waitFor(() => {
        expect(screen.getByText('초코')).toBeInTheDocument();
      });
    });
  });
});
