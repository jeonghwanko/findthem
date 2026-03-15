import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReportCard from './ReportCard';
import type { Report } from '../api/client';

function createMockReport(overrides: Partial<Report> = {}): Report {
  return {
    id: 'report-1',
    subjectType: 'DOG',
    name: '초코',
    features: '갈색 푸들, 빨간 목줄',
    lastSeenAddress: '서울시 강남구 역삼동',
    lastSeenAt: '2025-01-15T14:00:00Z',
    status: 'ACTIVE',
    createdAt: new Date(Date.now() - 3600_000).toISOString(), // 1시간 전
    photos: [
      {
        id: 'photo-1',
        photoUrl: '/uploads/reports/photo.jpg',
        thumbnailUrl: '/uploads/thumbs/photo.jpg',
        isPrimary: true,
      },
    ],
    _count: { sightings: 3, matches: 1 },
    ...overrides,
  } as Report;
}

function renderReportCard(report: Report) {
  return render(
    <MemoryRouter>
      <ReportCard report={report} />
    </MemoryRouter>,
  );
}

describe('ReportCard', () => {
  it('이름을 렌더링한다', () => {
    renderReportCard(createMockReport());
    expect(screen.getByText('초코')).toBeDefined();
  });

  it('주소를 렌더링한다', () => {
    renderReportCard(createMockReport());
    expect(screen.getByText(/서울시 강남구 역삼동/)).toBeDefined();
  });

  it('특징을 렌더링한다', () => {
    renderReportCard(createMockReport());
    expect(screen.getByText(/갈색 푸들/)).toBeDefined();
  });

  it('유형 라벨을 렌더링한다 (강아지)', () => {
    renderReportCard(createMockReport({ subjectType: 'DOG' }));
    expect(screen.getByText('강아지')).toBeDefined();
  });

  it('유형 라벨을 렌더링한다 (고양이)', () => {
    renderReportCard(createMockReport({ subjectType: 'CAT' }));
    expect(screen.getByText('고양이')).toBeDefined();
  });

  it('유형 라벨을 렌더링한다 (사람)', () => {
    renderReportCard(createMockReport({ subjectType: 'PERSON' }));
    expect(screen.getByText('사람')).toBeDefined();
  });

  it('제보 건수를 표시한다', () => {
    renderReportCard(createMockReport());
    expect(screen.getByText(/제보 3건/)).toBeDefined();
  });

  it('상세 페이지 링크를 생성한다', () => {
    renderReportCard(createMockReport({ id: 'my-report-id' }));
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/reports/my-report-id');
  });

  it('FOUND 상태이면 "찾았습니다!" 오버레이 표시', () => {
    renderReportCard(createMockReport({ status: 'FOUND' }));
    expect(screen.getByText('찾았습니다!')).toBeDefined();
  });

  it('ACTIVE 상태이면 오버레이 없음', () => {
    renderReportCard(createMockReport({ status: 'ACTIVE' }));
    expect(screen.queryByText('찾았습니다!')).toBeNull();
  });

  it('사진 없으면 placeholder 렌더링', () => {
    renderReportCard(createMockReport({ photos: [] } as any));
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('썸네일 이미지를 렌더링한다', () => {
    renderReportCard(createMockReport());
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toBe('/uploads/thumbs/photo.jpg');
    expect(img.getAttribute('alt')).toBe('초코 - 강아지 실종 사진');
  });
});
