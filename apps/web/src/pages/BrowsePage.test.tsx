import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PullToRefreshProvider } from '../context/PullToRefreshContext';
import BrowsePage from './BrowsePage';
import type { Report, ReportListResponse, Sighting, SightingListResponse } from '../api/client';

// ── Mocks ──
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

function createMockSighting(overrides: Partial<Sighting> = {}): Sighting {
  return {
    id: 'sighting-1',
    reportId: 'report-1',
    description: '강남역 근처에서 목격',
    address: '서울시 강남구 역삼동',
    sightedAt: '2025-01-15T14:00:00Z',
    lat: 37.5,
    lng: 127.0,
    createdAt: new Date().toISOString(),
    photos: [],
    status: 'PENDING',
    ...overrides,
  } as Sighting;
}

function mockBothResponses(reports: Report[], sightings: Sighting[]) {
  mockApiGet.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.startsWith('/reports')) {
      return Promise.resolve({
        items: reports,
        reports,
        total: reports.length,
        page: 1,
        totalPages: 1,
      } as ReportListResponse);
    }
    return Promise.resolve({
      sightings,
      total: sightings.length,
      page: 1,
      totalPages: 1,
    } as SightingListResponse);
  });
}

async function renderBrowsePage() {
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <MemoryRouter>
        <PullToRefreshProvider>
          <BrowsePage />
        </PullToRefreshProvider>
      </MemoryRouter>,
    );
  });
  return result!;
}

describe('BrowsePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('기본 렌더링', () => {
    it('전체 모드에서 신고와 제보를 함께 표시한다', async () => {
      mockBothResponses(
        [createMockReport()],
        [createMockSighting()],
      );
      await renderBrowsePage();

      await waitFor(() => {
        expect(screen.getByText('초코')).toBeInTheDocument();
        expect(screen.getByText(/강남역 근처/)).toBeInTheDocument();
      });
    });

    it('데이터 없으면 "검색 결과 없음" 표시', async () => {
      mockBothResponses([], []);
      await renderBrowsePage();
      await waitFor(() => {
        expect(screen.queryByText(/결과/)).toBeInTheDocument();
      });
    });

    it('API 에러 시 에러 메시지 표시', async () => {
      mockApiGet.mockRejectedValue(new Error('Network error'));
      await renderBrowsePage();
      await waitFor(() => {
        expect(screen.getByText(/오류/)).toBeInTheDocument();
      });
    });
  });

  describe('보기 필터', () => {
    it('신고 탭 클릭 시 신고만 표시 (제보 API 미호출)', async () => {
      mockBothResponses([createMockReport()], [createMockSighting()]);
      await renderBrowsePage();

      await waitFor(() => expect(mockApiGet).toHaveBeenCalled());

      // "신고" 탭 클릭
      const reportButtons = screen.getAllByText('신고');
      fireEvent.click(reportButtons[0]);

      await waitFor(() => {
        const calls = mockApiGet.mock.calls.map((c) => c[0] as string);
        const lastCall = calls[calls.length - 1];
        expect(lastCall).toContain('/reports');
        expect(lastCall).not.toContain('/sightings');
      });
    });

    it('제보 탭 클릭 시 제보만 표시', async () => {
      mockBothResponses([createMockReport()], [createMockSighting()]);
      await renderBrowsePage();

      await waitFor(() => expect(mockApiGet).toHaveBeenCalled());

      // 보기 필터의 "제보" 버튼 (SightingCard 배지와 구분)
      const viewButtons = screen.getAllByText('제보');
      fireEvent.click(viewButtons[0]);

      await waitFor(() => {
        const calls = mockApiGet.mock.calls.map((c) => c[0] as string);
        const lastCall = calls[calls.length - 1];
        expect(lastCall).toContain('/sightings');
      });
    });

    it('제보 탭에서는 종류/상태 필터가 숨겨진다', async () => {
      mockBothResponses([], []);
      await renderBrowsePage();

      await waitFor(() => expect(mockApiGet).toHaveBeenCalled());

      // 보기 필터의 "제보" 버튼 (SightingCard 배지와 구분)
      const viewButtons = screen.getAllByText('제보');
      fireEvent.click(viewButtons[0]);

      await waitFor(() => {
        expect(screen.queryByText('종류')).not.toBeInTheDocument();
        expect(screen.queryByText('상태')).not.toBeInTheDocument();
      });
    });
  });

  describe('필터', () => {
    it('종류 필터 — 고양이 클릭 시 type=CAT으로 요청', async () => {
      mockBothResponses([], []);
      await renderBrowsePage();

      await waitFor(() => expect(mockApiGet).toHaveBeenCalled());

      // 먼저 "신고" 탭으로 전환 (종류 필터가 보이게)
      const reportButtons = screen.getAllByText('신고');
      fireEvent.click(reportButtons[0]);

      await waitFor(() => expect(mockApiGet).toHaveBeenCalled());

      fireEvent.click(screen.getByText('고양이'));

      await waitFor(() => {
        const calls = mockApiGet.mock.calls.map((c) => c[0] as string);
        const lastCall = calls[calls.length - 1];
        expect(lastCall).toContain('type=CAT');
      });
    });

    it('상태 필터 — 찾았어요 클릭 시 phase=found로 요청', async () => {
      mockBothResponses([], []);
      await renderBrowsePage();

      await waitFor(() => expect(mockApiGet).toHaveBeenCalled());

      const reportButtons = screen.getAllByText('신고');
      fireEvent.click(reportButtons[0]);
      await waitFor(() => expect(mockApiGet).toHaveBeenCalled());

      fireEvent.click(screen.getByText('찾았어요'));

      await waitFor(() => {
        const calls = mockApiGet.mock.calls.map((c) => c[0] as string);
        const lastCall = calls[calls.length - 1];
        expect(lastCall).toContain('phase=found');
      });
    });

    it('검색 입력 시 300ms debounce 후 API 요청', async () => {
      vi.useFakeTimers();
      mockBothResponses([], []);
      await renderBrowsePage();

      await vi.waitFor(() => expect(mockApiGet).toHaveBeenCalled());
      const callCountBefore = mockApiGet.mock.calls.length;

      const input = screen.getByPlaceholderText(/검색/);
      fireEvent.change(input, { target: { value: '푸들' } });

      vi.advanceTimersByTime(200);
      expect(mockApiGet.mock.calls.length).toBe(callCountBefore);

      vi.advanceTimersByTime(100);
      await vi.waitFor(() => {
        const calls = mockApiGet.mock.calls.map((c) => c[0] as string);
        const lastReportCall = calls.filter((c) => c.includes('/reports')).pop();
        expect(lastReportCall).toContain('q=%ED%91%B8%EB%93%A4');
      });

      vi.useRealTimers();
    });
  });

  describe('data 호환성', () => {
    it('API가 reports 필드만 반환해도 동작한다', async () => {
      mockApiGet.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.startsWith('/reports')) {
          return Promise.resolve({
            reports: [createMockReport()],
            total: 1, page: 1, totalPages: 1,
          });
        }
        return Promise.resolve({ sightings: [], total: 0, page: 1, totalPages: 1 });
      });
      await renderBrowsePage();
      await waitFor(() => {
        expect(screen.getByText('초코')).toBeInTheDocument();
      });
    });
  });
});
