import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BrowsePage from './BrowsePage';
import type { Report, ReportListResponse } from '../api/client';

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

  describe('목록', () => {
    it('신고 목록을 표시한다', async () => {
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

    it('API 에러 시 에러 메시지 표시', async () => {
      mockApiGet.mockRejectedValue(new Error('Network error'));
      renderBrowsePage();
      await waitFor(() => {
        expect(screen.getByText(/실패/)).toBeInTheDocument();
      });
    });
  });

  describe('필터', () => {
    it('종류 필터 — 고양이 클릭 시 type=CAT으로 요청', async () => {
      mockApiResponse([]);
      renderBrowsePage();

      await waitFor(() => expect(mockApiGet).toHaveBeenCalled());

      fireEvent.click(screen.getByText('고양이'));

      await waitFor(() => {
        const lastCall = mockApiGet.mock.calls[mockApiGet.mock.calls.length - 1][0] as string;
        expect(lastCall).toContain('type=CAT');
      });
    });

    it('상태 필터 — 찾았어요 클릭 시 phase=found로 요청', async () => {
      mockApiResponse([]);
      renderBrowsePage();

      await waitFor(() => expect(mockApiGet).toHaveBeenCalled());

      fireEvent.click(screen.getByText('찾았어요'));

      await waitFor(() => {
        const lastCall = mockApiGet.mock.calls[mockApiGet.mock.calls.length - 1][0] as string;
        expect(lastCall).toContain('phase=found');
      });
    });

    it('지역 필터 — 서울 클릭 시 region=서울로 요청', async () => {
      mockApiResponse([]);
      renderBrowsePage();

      await waitFor(() => expect(mockApiGet).toHaveBeenCalled());

      // 지역 필터에서 "서울" 버튼 (종류/상태의 "전체"와 구분)
      const regionButtons = screen.getAllByText('서울');
      fireEvent.click(regionButtons[0]);

      await waitFor(() => {
        const lastCall = mockApiGet.mock.calls[mockApiGet.mock.calls.length - 1][0] as string;
        expect(lastCall).toContain('region=%EC%84%9C%EC%9A%B8');
      });
    });

    it('상태 필터 — 제보 접수 클릭 시 phase=sighting_received로 요청', async () => {
      mockApiResponse([]);
      renderBrowsePage();
      await waitFor(() => expect(mockApiGet).toHaveBeenCalled());

      fireEvent.click(screen.getByText('제보 접수'));

      await waitFor(() => {
        const lastCall = mockApiGet.mock.calls[mockApiGet.mock.calls.length - 1][0] as string;
        expect(lastCall).toContain('phase=sighting_received');
      });
    });

    it('상태 필터 — 분석 완료 클릭 시 phase=analysis_done으로 요청', async () => {
      mockApiResponse([]);
      renderBrowsePage();
      await waitFor(() => expect(mockApiGet).toHaveBeenCalled());

      fireEvent.click(screen.getByText('분석 완료'));

      await waitFor(() => {
        const lastCall = mockApiGet.mock.calls[mockApiGet.mock.calls.length - 1][0] as string;
        expect(lastCall).toContain('phase=analysis_done');
      });
    });

    it('검색 입력 시 300ms debounce 후 API 요청', async () => {
      vi.useFakeTimers();
      mockApiResponse([]);
      renderBrowsePage();

      await vi.waitFor(() => expect(mockApiGet).toHaveBeenCalled());
      const callCountBefore = mockApiGet.mock.calls.length;

      const input = screen.getByPlaceholderText(/검색/);
      fireEvent.change(input, { target: { value: '푸들' } });

      // 200ms — 아직 요청 안 됨
      vi.advanceTimersByTime(200);
      expect(mockApiGet.mock.calls.length).toBe(callCountBefore);

      // 300ms — debounce 완료, 요청 발생
      vi.advanceTimersByTime(100);
      await vi.waitFor(() => {
        const lastCall = mockApiGet.mock.calls[mockApiGet.mock.calls.length - 1][0] as string;
        expect(lastCall).toContain('q=%ED%91%B8%EB%93%A4');
      });

      vi.useRealTimers();
    });

    it('필터 변경 시 page가 1로 초기화된다', async () => {
      mockApiResponse(Array.from({ length: 12 }, (_, i) => createMockReport({ id: `r-${i}` })));
      // totalPages > 1이 되도록 설정
      mockApiGet.mockResolvedValue({
        items: Array.from({ length: 12 }, (_, i) => createMockReport({ id: `r-${i}` })),
        total: 24,
        page: 1,
        totalPages: 2,
      });
      renderBrowsePage();

      await waitFor(() => expect(mockApiGet).toHaveBeenCalled());

      // 고양이 필터 클릭
      fireEvent.click(screen.getByText('고양이'));

      await waitFor(() => {
        const lastCall = mockApiGet.mock.calls[mockApiGet.mock.calls.length - 1][0] as string;
        expect(lastCall).toContain('page=1');
        expect(lastCall).toContain('type=CAT');
      });
    });
  });

  describe('data 호환성', () => {
    it('API가 reports 필드만 반환해도 동작한다', async () => {
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
