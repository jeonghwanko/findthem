import { type TestAPI } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { config } from '../src/config.js';

/** supertest 인스턴스 생성 */
export function createTestApp() {
  return request(app);
}

/** 테스트용 JWT 토큰 생성 */
export function generateTestToken(userId: string = 'test-user-id'): string {
  return jwt.sign({ userId }, config.jwtSecret, {
    expiresIn: '1h',
  } as jwt.SignOptions);
}

/** Authorization 헤더 문자열 생성 */
export function authHeader(userId?: string): string {
  return `Bearer ${generateTestToken(userId)}`;
}

/** 테스트용 유저 데이터 */
export const testUser = {
  id: 'test-user-id',
  name: '테스트 유저',
  phone: '01012345678',
  email: null,
  passwordHash: '$2a$10$mock-hash',
  provider: 'LOCAL' as const,
  isVerified: false,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

/** 테스트용 리포트 데이터 */
export const testReport = {
  id: 'test-report-id',
  userId: 'test-user-id',
  subjectType: 'DOG' as const,
  name: '초코',
  species: '푸들',
  gender: 'MALE' as const,
  age: '3살',
  weight: '5kg',
  height: null,
  color: '갈색',
  features: '갈색 푸들, 빨간 목줄',
  clothingDesc: null,
  lastSeenAt: new Date('2025-01-15T14:00:00Z'),
  lastSeenAddress: '서울시 강남구 역삼동',
  lastSeenLat: 37.4979,
  lastSeenLng: 127.0276,
  contactPhone: '01012345678',
  contactName: '테스트 유저',
  reward: '10만원',
  status: 'ACTIVE' as const,
  aiDescription: null,
  createdAt: new Date('2025-01-15'),
  updatedAt: new Date('2025-01-15'),
};

/** 테스트용 제보 데이터 */
export const testSighting = {
  id: 'test-sighting-id',
  reportId: 'test-report-id',
  userId: 'test-user-id',
  description: '비슷한 강아지를 봤습니다',
  sightedAt: new Date('2025-01-16T10:00:00Z'),
  address: '서울시 강남구 삼성동',
  lat: 37.508,
  lng: 127.062,
  tipsterPhone: '01098765432',
  tipsterName: '제보자',
  source: 'WEB' as const,
  status: 'PENDING' as const,
  createdAt: new Date('2025-01-16'),
  updatedAt: new Date('2025-01-16'),
};

/** 테스트용 매칭 데이터 */
export const testMatch = {
  id: 'test-match-id',
  reportId: 'test-report-id',
  sightingId: 'test-sighting-id',
  confidence: 0.85,
  aiReasoning: '외모 특징이 매우 유사합니다.',
  status: 'PENDING' as const,
  reviewedAt: null,
  createdAt: new Date('2025-01-16'),
  updatedAt: new Date('2025-01-16'),
};
