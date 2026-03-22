/**
 * Seed 스크립트 — 프로덕션 백업 기반 시드 데이터
 *
 * 실행: npx tsx apps/api/prisma/seed.ts
 * 또는: npx prisma db seed (package.json에 prisma.seed 설정 시)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // ── 시드 유저 (upsert) ──
  const user = await prisma.user.upsert({
    where: { id: 'seed-user-jpark' },
    update: {},
    create: {
      id: 'seed-user-jpark',
      name: 'JPARK',
      provider: 'LOCAL',
      locale: 'ko',
    },
  });
  console.log(`✓ User: ${user.name} (${user.id})`);

  // ── 제보 1: 검은 고양이랑 친구 ──
  const sighting1 = await prisma.sighting.upsert({
    where: { id: 'seed-sighting-001' },
    update: {},
    create: {
      id: 'seed-sighting-001',
      userId: user.id,
      source: 'WEB',
      description: '검은 고양이랑 친구로 있었어요',
      sightedAt: new Date('2026-03-21T09:38:00.000Z'),
      address: '서울 중구 신당동 855',
      lat: 37.56464444444444,
      lng: 127.0245444444444,
      status: 'ANALYZED',
    },
  });
  // 사진 (upsert)
  await prisma.photo.upsert({
    where: { id: 'seed-photo-s1' },
    update: {},
    create: {
      id: 'seed-photo-s1',
      sightingId: sighting1.id,
      photoUrl: '/uploads/sightings/37888fd2-1e33-43a1-a1d0-375647361efe.jpg',
      thumbnailUrl: '/uploads/thumbs/37888fd2-1e33-43a1-a1d0-375647361efe.jpg',
      isPrimary: true,
    },
  });
  console.log(`✓ Sighting 1: ${sighting1.description}`);

  // ── 제보 2: 세탁실 앞 발견 ──
  const sighting2 = await prisma.sighting.upsert({
    where: { id: 'seed-sighting-002' },
    update: {},
    create: {
      id: 'seed-sighting-002',
      userId: user.id,
      source: 'WEB',
      description: '세탁실 앞에서 발견!',
      sightedAt: new Date('2026-03-21T09:38:00.000Z'),
      address: '서울특별시 중구 왕십리로 407',
      lat: 37.56465277777777,
      lng: 127.0245666666667,
      status: 'ANALYZED',
    },
  });
  await prisma.photo.upsert({
    where: { id: 'seed-photo-s2' },
    update: {},
    create: {
      id: 'seed-photo-s2',
      sightingId: sighting2.id,
      photoUrl: '/uploads/sightings/4ef7b72e-98ee-43dd-97c2-d31501515cbd.jpg',
      thumbnailUrl: '/uploads/thumbs/4ef7b72e-98ee-43dd-97c2-d31501515cbd.jpg',
      isPrimary: true,
    },
  });
  console.log(`✓ Sighting 2: ${sighting2.description}`);

  console.log('\n시드 데이터 삽입 완료!');
}

main()
  .catch((e) => {
    console.error('시드 실패:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
