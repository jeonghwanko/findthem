import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SightingCard from './SightingCard';
import type { Sighting } from '../api/client';

function createSighting(overrides: Partial<Sighting> = {}): Sighting {
  return {
    id: 'sighting-1',
    reportId: 'report-1',
    description: '강남역 근처에서 갈색 강아지 목격',
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

function renderCard(sighting: Sighting) {
  return render(
    <MemoryRouter>
      <SightingCard sighting={sighting} />
    </MemoryRouter>,
  );
}

describe('SightingCard', () => {
  it('제보 설명과 주소를 표시한다', () => {
    renderCard(createSighting());
    expect(screen.getByText(/강남역 근처/)).toBeInTheDocument();
    expect(screen.getByText(/역삼동/)).toBeInTheDocument();
  });

  it('제보 배지를 표시한다', () => {
    renderCard(createSighting());
    expect(screen.getByText('제보')).toBeInTheDocument();
  });

  it('reportId가 있으면 신고 상세 링크를 생성한다', () => {
    renderCard(createSighting({ reportId: 'report-123' }));
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/reports/report-123');
  });

  it('설명이 없으면 (설명 없음)을 표시한다', () => {
    renderCard(createSighting({ description: '' }));
    expect(screen.getByText('(설명 없음)')).toBeInTheDocument();
  });

  it('사진이 있으면 이미지를 표시한다', () => {
    const { container } = renderCard(createSighting({
      photos: [{ id: 'p1', photoUrl: '/photo.jpg', thumbnailUrl: '/thumb.jpg' }],
    }));
    const img = container.querySelector('img[src="/thumb.jpg"]');
    expect(img).toBeInTheDocument();
  });
});
