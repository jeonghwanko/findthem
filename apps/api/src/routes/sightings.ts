import type { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { validateQuery } from '../middlewares/validate.js';
import { optionalAuth, requireAuth } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';
import { rateLimit } from '../middlewares/rateLimit.js';
import { imageService } from '../services/imageService.js';
import { imageQueue } from '../jobs/queues.js';
import { MAX_FILE_SIZE, MAX_REPORT_PHOTOS, ERROR_CODES, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@findthem/shared';

// SEC-W3: 제보 접수 rate limit — IP 기준 15분에 10회
const sightingLimiter = rateLimit({ windowMs: 15 * 60_000, max: 10 });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error(ERROR_CODES.IMAGE_ONLY));
  },
});

const createSightingSchema = z.object({
  reportId: z.string().optional(),
  description: z.string().default(''),
  sightedAt: z
    .string()
    .transform((s) => new Date(s))
    .refine((d) => d <= new Date()),
  address: z.string().default(''),
  lat: z.number().optional(),
  lng: z.number().optional(),
  tipsterPhone: z.string().optional(),
  tipsterName: z.string().optional(),
  editPassword: z.string().min(4).optional(),
});

const updateSightingSchema = z.object({
  description: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  sightedAt: z
    .string()
    .transform((s) => new Date(s))
    .refine((d) => d <= new Date())
    .optional(),
  editPassword: z.string().min(1).optional(),
});

const deleteSightingSchema = z.object({
  editPassword: z.string().min(1).optional(),
});

const sightingListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(200).default(50).optional(),
});

interface RawSightingRow {
  id: string;
  report_id: string | null;
  description: string;
  sighted_at: Date;
  address: string;
  lat: number | null;
  lng: number | null;
  created_at: Date;
  distance_km: number;
}

/** 제보 수정/삭제 권한 확인 (회원: userId 비교, 비회원: editPassword bcrypt 비교) */
async function verifySightingOwnership(
  sighting: { userId: string | null; editPassword: string | null },
  reqUserId: string | undefined,
  password: string | undefined,
): Promise<void> {
  // 회원 제보 — userId 일치 확인
  if (sighting.userId) {
    if (reqUserId !== sighting.userId) {
      throw new ApiError(403, ERROR_CODES.SIGHTING_OWNER_ONLY);
    }
    return;
  }
  // 비회원 제보 — editPassword 비교
  if (!sighting.editPassword || !password) {
    throw new ApiError(403, ERROR_CODES.SIGHTING_PASSWORD_REQUIRED);
  }
  const match = await bcrypt.compare(password, sighting.editPassword);
  if (!match) {
    throw new ApiError(403, ERROR_CODES.SIGHTING_PASSWORD_MISMATCH);
  }
}

export function registerSightingRoutes(router: Router) {
  // 제보 접수
  // SEC-W3: IP 기준 15분에 10회 rate limit 적용
  router.post(
    '/sightings',
    sightingLimiter,
    optionalAuth,
    upload.array('photos', MAX_REPORT_PHOTOS),
    async (req, res) => {
      // SEC-C3: JSON.parse 실패 시 400 반환
      let rawBody: unknown;
      try {
        rawBody = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body;
      } catch {
        throw new ApiError(400, ERROR_CODES.VALIDATION_ERROR);
      }
      const body = createSightingSchema.parse(rawBody);

      // 사진 필수 (최소 1장)
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        throw new ApiError(400, ERROR_CODES.SIGHTING_PHOTO_REQUIRED);
      }

      // 비회원일 때 editPassword 해싱
      let hashedPassword: string | undefined;
      if (!req.user && body.editPassword) {
        hashedPassword = await bcrypt.hash(body.editPassword, 10);
      }

      // RACE-03: reportId 유효성 확인 + 상태 체크 + 제보 생성을 트랜잭션으로 원자화
      const { editPassword: _pw, ...bodyWithoutPw } = body;
      const sighting = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        if (bodyWithoutPw.reportId) {
          const report = await tx.report.findUnique({
            where: { id: bodyWithoutPw.reportId },
            select: { status: true },
          });
          if (!report) throw new ApiError(404, ERROR_CODES.SIGHTING_REPORT_NOT_FOUND);
          if (report.status !== 'ACTIVE') {
            throw new ApiError(400, ERROR_CODES.REPORT_NOT_ACTIVE);
          }
        }

        return tx.sighting.create({
          data: {
            ...bodyWithoutPw,
            userId: req.user?.userId,
            editPassword: hashedPassword,
            source: 'WEB',
          },
        });
      });

      // 사진 처리 (I/O 병렬 → createMany 단일 INSERT)
      const photoData = await Promise.all(
        files.map(async (file) => {
          const { photoUrl, thumbnailUrl } = await imageService.processAndSave('sightings', file);
          return { sightingId: sighting.id, photoUrl, thumbnailUrl };
        }),
      );
      if (photoData.length > 0) {
        await prisma.sightingPhoto.createMany({ data: photoData });
      }
      const photos = await prisma.sightingPhoto.findMany({ where: { sightingId: sighting.id } });

      // 이미지 분석 + 매칭 작업 enqueue
      // RACE-08: jobId로 중복 job 방지
      if (photos.length > 0) {
        await imageQueue.add(
          'process-sighting-photos',
          { type: 'sighting', sightingId: sighting.id },
          { attempts: 3, backoff: { type: 'exponential', delay: 30_000 }, jobId: `image-sighting-${sighting.id}` },
        );
      }

      res.status(201).json({ ...sighting, photos, editPassword: undefined });
    },
  );

  // 제보 수정 (회원: userId 확인, 비회원: editPassword 확인)
  router.patch('/sightings/:id', sightingLimiter, optionalAuth, async (req, res) => {
    const id = req.params.id as string;
    const body = updateSightingSchema.parse(req.body);
    const sighting = await prisma.sighting.findUnique({
      where: { id },
      select: { userId: true, editPassword: true },
    });
    if (!sighting) throw new ApiError(404, ERROR_CODES.SIGHTING_NOT_FOUND);

    await verifySightingOwnership(sighting, req.user?.userId, body.editPassword);

    const { editPassword: _pw, ...updateData } = body;
    const updated = await prisma.sighting.update({
      where: { id },
      data: updateData,
    });
    res.json({ ...updated, editPassword: undefined });
  });

  // 제보 삭제 (회원: userId 확인, 비회원: editPassword 확인)
  router.delete('/sightings/:id', sightingLimiter, optionalAuth, async (req, res) => {
    const id = req.params.id as string;
    const body = deleteSightingSchema.parse(req.body);
    const sighting = await prisma.sighting.findUnique({
      where: { id },
      select: { userId: true, editPassword: true },
    });
    if (!sighting) throw new ApiError(404, ERROR_CODES.SIGHTING_NOT_FOUND);

    await verifySightingOwnership(sighting, req.user?.userId, body.editPassword);

    await prisma.sighting.delete({ where: { id } });
    res.json({ success: true });
  });

  // 내 제보 목록 (로그인 필수)
  router.get('/sightings/mine', requireAuth, validateQuery(sightingListQuerySchema), async (req, res) => {
    const { page, limit } = req.query as unknown as z.infer<typeof sightingListQuerySchema>;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { userId } = req.user!;

    const where = { userId };
    const skip = (page - 1) * limit;
    const sightings = await prisma.sighting.findMany({
      where,
      include: {
        photos: { select: { id: true, photoUrl: true, thumbnailUrl: true }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    const total = sightings.length < limit
      ? skip + sightings.length
      : await prisma.sighting.count({ where });

    res.json({ sightings, total, page, totalPages: Math.ceil(total / limit) });
  });

  // 제보 상세 조회
  router.get('/sightings/:id', optionalAuth, async (req, res) => {
    const id = req.params.id as string;

    const sighting = await prisma.sighting.findUnique({
      where: { id },
      include: {
        photos: { select: { id: true, photoUrl: true, thumbnailUrl: true, aiAnalysis: true } },
        report: {
          select: {
            id: true, name: true, subjectType: true, status: true,
            lastSeenAddress: true, lastSeenLat: true, lastSeenLng: true,
            photos: { where: { isPrimary: true }, take: 1, select: { thumbnailUrl: true } },
          },
        },
        user: { select: { id: true, name: true } },
        matches: {
          select: { id: true, confidence: true, aiReasoning: true, status: true, reportId: true },
          orderBy: { confidence: 'desc' },
          take: 5,
        },
      },
    });

    if (!sighting) throw new ApiError(404, ERROR_CODES.SIGHTING_NOT_FOUND);

    // 민감 정보 제거 (editPassword, tipsterPhone은 본인만)
    const isOwner = req.user && sighting.userId === req.user.userId;
    const { editPassword: _pw, tipsterPhone, ...safe } = sighting;

    res.json({
      ...safe,
      tipsterPhone: isOwner ? tipsterPhone : undefined,
    });
  });

  // 전체 제보 목록 (반경 검색 지원)
  router.get('/sightings', optionalAuth, validateQuery(sightingListQuerySchema), async (req, res) => {
    const { page, limit, lat, lng, radiusKm } = req.query as unknown as z.infer<typeof sightingListQuerySchema>;

    if (lat !== undefined && lng !== undefined) {
      const radius = radiusKm ?? 50;
      const skip = (page - 1) * limit;

      const baseQuery = Prisma.sql`
        SELECT s.id, s.report_id, s.description, s.sighted_at, s.address, s.lat, s.lng, s.created_at,
               (6371 * 2 * ASIN(SQRT(
                 POWER(SIN(RADIANS((${lat} - s.lat) / 2)), 2) +
                 COS(RADIANS(${lat})) * COS(RADIANS(s.lat)) *
                 POWER(SIN(RADIANS((${lng} - s.lng) / 2)), 2)
               ))) AS distance_km
        FROM sighting s
        WHERE s.lat IS NOT NULL AND s.lng IS NOT NULL
      `;

      const [rawRows, countRows] = await Promise.all([
        prisma.$queryRaw<RawSightingRow[]>`
          SELECT * FROM (${baseQuery}) sub
          WHERE sub.distance_km <= ${radius}
          ORDER BY sub.distance_km ASC
          LIMIT ${limit} OFFSET ${skip}
        `,
        prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(*) FROM (${baseQuery}) sub
          WHERE sub.distance_km <= ${radius}
        `,
      ]);

      const total = Number(countRows[0]?.count ?? 0);
      const sightings = rawRows.map((s) => ({
        id: s.id,
        reportId: s.report_id,
        description: s.description,
        sightedAt: s.sighted_at,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        createdAt: s.created_at,
        photos: [],
        distanceKm: Math.round(s.distance_km * 10) / 10,
      }));

      return res.json({ sightings, total, page, totalPages: Math.ceil(total / limit) });
    }

    const skip = (page - 1) * limit;
    const sightings = await prisma.sighting.findMany({
      include: {
        photos: {
          select: { id: true, photoUrl: true, thumbnailUrl: true },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    const total = sightings.length < limit
      ? skip + sightings.length
      : await prisma.sighting.count();

    res.json({ sightings, total, page, totalPages: Math.ceil(total / limit) });
  });

  // 특정 신고에 대한 제보 목록 (페이지네이션 적용)
  router.get(
    '/reports/:id/sightings',
    validateQuery(sightingListQuerySchema),
    async (req, res) => {
      const id = req.params.id as string;
      const { page, limit } = req.query as unknown as z.infer<typeof sightingListQuerySchema>;

      const [sightings, total] = await Promise.all([
        prisma.sighting.findMany({
          where: { reportId: id },
          include: { photos: true },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.sighting.count({ where: { reportId: id } }),
      ]);

      res.json({ sightings, total, page, totalPages: Math.ceil(total / limit) });
    },
  );
}
