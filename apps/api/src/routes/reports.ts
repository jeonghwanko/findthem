import type { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { validateBody, validateQuery } from '../middlewares/validate.js';
import { requireAuth, optionalAuth } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';
import { imageService } from '../services/imageService.js';
import { imageQueue, cleanupQueue } from '../jobs/queues.js';
import { MAX_FILE_SIZE, MAX_REPORT_PHOTOS, MAX_ADDITIONAL_PHOTOS, ERROR_CODES } from '@findthem/shared';
import { postAli } from '../services/communityAgentService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error(ERROR_CODES.IMAGE_ONLY));
  },
});

const createReportSchema = z.object({
  subjectType: z.enum(['PERSON', 'DOG', 'CAT']),
  name: z.string().min(1),
  species: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'UNKNOWN']).optional(),
  age: z.string().optional(),
  weight: z.string().optional(),
  height: z.string().optional(),
  color: z.string().optional(),
  features: z.string().min(1),
  clothingDesc: z.string().optional(),
  lastSeenAt: z.string().transform((s) => new Date(s)),
  lastSeenAddress: z.string().min(1),
  lastSeenLat: z.number().optional(),
  lastSeenLng: z.number().optional(),
  contactPhone: z.string().min(1),
  contactName: z.string().min(1),
  reward: z.string().optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  type: z.enum(['PERSON', 'DOG', 'CAT']).optional(),
  status: z.enum(['ACTIVE', 'FOUND', 'EXPIRED', 'SUSPENDED']).optional(),
  q: z.string().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(200).default(50).optional(),
});

interface RawReportRow {
  id: string;
  subject_type: string;
  status: string;
  name: string;
  species: string | null;
  features: string;
  last_seen_at: Date;
  last_seen_address: string;
  last_seen_lat: number | null;
  last_seen_lng: number | null;
  contact_phone: string;
  contact_name: string;
  reward: string | null;
  created_at: Date;
  distance_km: number;
}

export function registerReportRoutes(router: Router) {
  // 실종 신고 등록
  router.post(
    '/reports',
    requireAuth,
    upload.array('photos', MAX_REPORT_PHOTOS),
    async (req, res) => {
      const body = createReportSchema.parse(
        typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body,
      );

      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        throw new ApiError(400, ERROR_CODES.PHOTO_REQUIRED);
      }

      // 파일 I/O는 트랜잭션 밖에서 처리
      const processedPhotos = await Promise.all(
        files.map(async (file, index) => {
          const { photoUrl, thumbnailUrl } = await imageService.processAndSave('reports', file);
          return { photoUrl, thumbnailUrl, isPrimary: index === 0 };
        }),
      );

      // DB 쓰기는 트랜잭션으로 원자성 보장
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const { userId } = req.user!; // requireAuth가 보장
      const { report, photos } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const report = await tx.report.create({
          data: { userId, ...body },
        });

        const photos = await Promise.all(
          processedPhotos.map((p) =>
            tx.reportPhoto.create({
              data: {
                reportId: report.id,
                photoUrl: p.photoUrl,
                thumbnailUrl: p.thumbnailUrl,
                isPrimary: p.isPrimary,
              },
            }),
          ),
        );

        return { report, photos };
      });

      // 이미지 분석 + 홍보 작업 enqueue
      // RACE-08: jobId로 중복 job 방지
      await imageQueue.add(
        'process-report-photos',
        { type: 'report', reportId: report.id },
        { attempts: 3, backoff: { type: 'exponential', delay: 30_000 }, jobId: `image-report-${report.id}` },
      );

      // 커뮤니티 게시 (fire-and-forget)
      void postAli(report.name, report.subjectType, report.lastSeenAddress).catch(() => {});

      res.status(201).json({ ...report, photos });
    },
  );

  // 실종 신고 목록
  router.get('/reports', optionalAuth, validateQuery(listQuerySchema), async (req, res) => {
    const { page, limit, type, status, q, lat, lng, radiusKm } = req.query as unknown as z.infer<typeof listQuerySchema>;

    // 반경 검색: lat + lng 모두 있을 때 Haversine raw query 사용
    if (lat !== undefined && lng !== undefined) {
      const radius = radiusKm ?? 50;
      const skip = (page - 1) * limit;
      const statusVal = status ?? 'ACTIVE';

      const typeCondition = type ? Prisma.sql`AND r.subject_type::text = ${type}` : Prisma.empty;
      const qCondition = q
        ? Prisma.sql`AND (r.name ILIKE ${`%${  q  }%`} OR r.features ILIKE ${`%${  q  }%`} OR r.last_seen_address ILIKE ${`%${  q  }%`})`
        : Prisma.empty;

      const baseQuery = Prisma.sql`
        SELECT r.id, r.subject_type, r.status, r.name, r.species, r.features,
               r.last_seen_at, r.last_seen_address, r.last_seen_lat, r.last_seen_lng,
               r.contact_phone, r.contact_name, r.reward, r.created_at,
               (6371 * 2 * ASIN(SQRT(
                 POWER(SIN(RADIANS((${lat} - r.last_seen_lat) / 2)), 2) +
                 COS(RADIANS(${lat})) * COS(RADIANS(r.last_seen_lat)) *
                 POWER(SIN(RADIANS((${lng} - r.last_seen_lng) / 2)), 2)
               ))) AS distance_km
        FROM report r
        WHERE r.last_seen_lat IS NOT NULL
          AND r.last_seen_lng IS NOT NULL
          AND r.status::text = ${statusVal}
          ${typeCondition}
          ${qCondition}
      `;

      const [rawRows, countRows] = await Promise.all([
        prisma.$queryRaw<RawReportRow[]>`
          SELECT * FROM (${baseQuery}) sub
          WHERE sub.distance_km <= ${radius}
          ORDER BY sub.distance_km ASC
          LIMIT ${Prisma.raw(String(limit))} OFFSET ${Prisma.raw(String(skip))}
        `,
        prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(*) FROM (${baseQuery}) sub
          WHERE sub.distance_km <= ${radius}
        `,
      ]);

      const total = Number(countRows[0]?.count ?? 0);
      const reports = rawRows.map((r) => ({
        id: r.id,
        subjectType: r.subject_type,
        status: r.status,
        name: r.name,
        species: r.species,
        features: r.features,
        lastSeenAt: r.last_seen_at,
        lastSeenAddress: r.last_seen_address,
        lastSeenLat: r.last_seen_lat,
        lastSeenLng: r.last_seen_lng,
        contactPhone: r.contact_phone,
        contactName: r.contact_name,
        reward: r.reward,
        createdAt: r.created_at,
        photos: [],
        distanceKm: Math.round(r.distance_km * 10) / 10,
      }));

      return res.json({ reports, total, page, totalPages: Math.ceil(total / limit) });
    }

    const where: Prisma.ReportWhereInput = {};
    if (type) where.subjectType = type;
    where.status = status ?? 'ACTIVE';
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { features: { contains: q, mode: 'insensitive' } },
        { lastSeenAddress: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        select: {
          id: true,
          subjectType: true,
          status: true,
          name: true,
          species: true,
          gender: true,
          age: true,
          color: true,
          features: true,
          lastSeenAt: true,
          lastSeenAddress: true,
          lastSeenLat: true,
          lastSeenLng: true,
          contactPhone: true,
          contactName: true,
          reward: true,
          createdAt: true,
          updatedAt: true,
          photos: { where: { isPrimary: true }, take: 1, select: { id: true, photoUrl: true, thumbnailUrl: true, isPrimary: true } },
          _count: { select: { sightings: true, matches: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.report.count({ where }),
    ]);

    res.json({ items: reports, reports, total, page, totalPages: Math.ceil(total / limit) });
  });

  // 내 신고 목록 (⚠️ /reports/:id 보다 먼저 등록)
  const mineQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  });

  router.get('/reports/mine', requireAuth, validateQuery(mineQuerySchema), async (req, res) => {
    const { page, limit } = req.query as unknown as z.infer<typeof mineQuerySchema>;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { userId: mineUserId } = req.user!; // requireAuth가 보장
    const where = { userId: mineUserId };

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        select: {
          id: true,
          subjectType: true,
          status: true,
          name: true,
          species: true,
          gender: true,
          age: true,
          color: true,
          features: true,
          lastSeenAt: true,
          lastSeenAddress: true,
          lastSeenLat: true,
          lastSeenLng: true,
          contactPhone: true,
          contactName: true,
          reward: true,
          createdAt: true,
          updatedAt: true,
          photos: { where: { isPrimary: true }, take: 1, select: { id: true, photoUrl: true, thumbnailUrl: true, isPrimary: true } },
          _count: { select: { sightings: true, matches: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.report.count({ where }),
    ]);

    res.json({ items: reports, reports, total, page, totalPages: Math.ceil(total / limit) });
  });

  // 실종 신고 상세
  router.get('/reports/:id', async (req, res) => {
    const id = req.params.id;
    const report = await prisma.report.findUnique({
      where: { id },
      include: {
        photos: { select: { id: true, photoUrl: true, thumbnailUrl: true, isPrimary: true, createdAt: true } },
        user: { select: { id: true, name: true } },
        _count: { select: { sightings: true, matches: true } },
      },
    });

    if (!report) throw new ApiError(404, ERROR_CODES.REPORT_NOT_FOUND);
    res.json(report);
  });

  // 신고 상태 업데이트
  router.patch('/reports/:id/status', requireAuth, async (req, res) => {
    const id = req.params.id as string;
    const { status } = z
      .object({ status: z.enum(['ACTIVE', 'FOUND']) })
      .parse(req.body);

    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) throw new ApiError(404, ERROR_CODES.REPORT_NOT_FOUND);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { userId: statusUserId } = req.user!; // requireAuth가 보장
    if (report.userId !== statusUserId) {
      throw new ApiError(403, ERROR_CODES.REPORT_OWNER_ONLY);
    }

    // RACE-02: where 조건에 현재 상태를 포함하여 원자적 업데이트
    // EXPIRED, SUSPENDED 상태는 사용자가 변경할 수 없으므로 notIn 조건으로 필터링
    const updateResult = await prisma.report.updateMany({
      where: { id, status: { notIn: ['EXPIRED', 'SUSPENDED'] } },
      data: { status },
    });

    // 이미 EXPIRED/SUSPENDED 상태이거나 다른 워커가 먼저 변경한 경우
    if (updateResult.count === 0) {
      const current = await prisma.report.findUnique({ where: { id } });
      res.json(current);
      return;
    }

    const updated = await prisma.report.findUnique({ where: { id } });

    // FOUND 처리 시 SNS 게시물 삭제
    if (status === 'FOUND') {
      await cleanupQueue.add(
        'cleanup-sns-posts',
        { reportId: id },
        { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
      );
    }

    res.json(updated);
  });

  // 신고 내용 수정 (본인만)
  const editReportSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    species: z.string().max(100).optional(),
    gender: z.enum(['MALE', 'FEMALE', 'UNKNOWN']).optional(),
    age: z.string().max(50).optional(),
    color: z.string().max(50).optional(),
    features: z.string().max(500).optional(),
    lastSeenAt: z.string().datetime().optional(),
    lastSeenAddress: z.string().max(200).optional(),
    lastSeenLat: z.number().optional().nullable(),
    lastSeenLng: z.number().optional().nullable(),
    contactPhone: z.string().max(20).optional(),
    contactName: z.string().max(50).optional(),
    reward: z.string().max(100).optional().nullable(),
  });

  router.patch('/reports/:id', requireAuth, validateBody(editReportSchema), async (req, res) => {
    const id = req.params.id as string;
    const body = req.body as z.infer<typeof editReportSchema>;

    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) throw new ApiError(404, ERROR_CODES.REPORT_NOT_FOUND);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { userId: editUserId } = req.user!;
    if (report.userId !== editUserId) {
      throw new ApiError(403, ERROR_CODES.REPORT_EDIT_FORBIDDEN);
    }

    if (report.externalSource !== null) {
      throw new ApiError(403, ERROR_CODES.EXTERNAL_REPORT_IMMUTABLE);
    }

    const updated = await prisma.report.update({
      where: { id },
      data: {
        ...body,
        lastSeenAt: body.lastSeenAt !== undefined ? new Date(body.lastSeenAt) : undefined,
      },
      include: {
        photos: { select: { id: true, photoUrl: true, thumbnailUrl: true, isPrimary: true, createdAt: true } },
        user: { select: { id: true, name: true } },
        _count: { select: { sightings: true, matches: true } },
      },
    });

    res.json(updated);
  });

  // 신고 삭제 (본인만)
  router.delete('/reports/:id', requireAuth, async (req, res) => {
    const id = req.params.id as string;

    const report = await prisma.report.findUnique({
      where: { id },
      select: { id: true, userId: true, externalSource: true, promotions: { select: { id: true }, take: 1 } },
    });
    if (!report) throw new ApiError(404, ERROR_CODES.REPORT_NOT_FOUND);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { userId: deleteUserId } = req.user!;
    if (report.userId !== deleteUserId) {
      throw new ApiError(403, ERROR_CODES.REPORT_DELETE_FORBIDDEN);
    }

    if (report.externalSource !== null) {
      throw new ApiError(403, ERROR_CODES.EXTERNAL_REPORT_IMMUTABLE);
    }

    // SNS 게시물이 있으면 삭제 작업 먼저 enqueue (레코드 삭제 전)
    if (report.promotions.length > 0) {
      await cleanupQueue.add(
        'cleanup-sns-posts',
        { reportId: id },
        { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
      );
    }

    await prisma.report.delete({ where: { id } });

    res.json({ success: true });
  });

  // 신고에 사진 추가
  router.post(
    '/reports/:id/photos',
    requireAuth,
    upload.array('photos', MAX_ADDITIONAL_PHOTOS),
    async (req, res) => {
      const id = req.params.id as string;
      const report = await prisma.report.findUnique({ where: { id } });
      if (!report) throw new ApiError(404, ERROR_CODES.REPORT_NOT_FOUND);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const { userId: photosUserId } = req.user!; // requireAuth가 보장
      if (report.userId !== photosUserId) {
        throw new ApiError(403, ERROR_CODES.REPORT_OWNER_ONLY);
      }

      const files = (req.files as Express.Multer.File[]) || [];

      // 파일 I/O는 트랜잭션 밖에서 먼저 처리
      const processedPhotos = await Promise.all(
        files.map(async (file) => {
          const { photoUrl, thumbnailUrl } = await imageService.processAndSave('reports', file);
          return { photoUrl, thumbnailUrl };
        }),
      );

      // RACE-01: 현재 사진 수 조회와 사진 생성을 트랜잭션으로 묶어 원자적으로 체크
      const photos = await prisma.$transaction(async (tx) => {
        const currentCount = await tx.reportPhoto.count({ where: { reportId: id } });
        if (currentCount + files.length > MAX_REPORT_PHOTOS) {
          throw new ApiError(400, ERROR_CODES.REPORT_PHOTO_LIMIT);
        }
        return Promise.all(
          processedPhotos.map((p) =>
            tx.reportPhoto.create({
              data: { reportId: id, photoUrl: p.photoUrl, thumbnailUrl: p.thumbnailUrl },
            }),
          ),
        );
      });

      res.status(201).json(photos);
    },
  );
}
