import type { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { validateQuery } from '../middlewares/validate.js';
import { requireAuth, optionalAuth } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';
import { imageService } from '../services/imageService.js';
import { imageQueue, cleanupQueue } from '../jobs/queues.js';
import { MAX_FILE_SIZE, MAX_REPORT_PHOTOS, MAX_ADDITIONAL_PHOTOS, ERROR_CODES } from '@findthem/shared';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('IMAGE_ONLY'));
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
  features: z.string().min(1, '특징을 입력하세요'),
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
});

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
        throw new ApiError(400, 'PHOTO_REQUIRED');
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

      res.status(201).json({ ...report, photos });
    },
  );

  // 실종 신고 목록
  router.get('/reports', optionalAuth, validateQuery(listQuerySchema), async (req, res) => {
    const { page, limit, type, status, q } = req.query as unknown as z.infer<typeof listQuerySchema>;

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
        include: {
          photos: { where: { isPrimary: true }, take: 1 },
          _count: { select: { sightings: true, matches: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.report.count({ where }),
    ]);

    res.json({ reports, total, page, totalPages: Math.ceil(total / limit) });
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
        include: {
          photos: { where: { isPrimary: true }, take: 1 },
          _count: { select: { sightings: true, matches: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.report.count({ where }),
    ]);

    res.json({ reports, total, page, totalPages: Math.ceil(total / limit) });
  });

  // 실종 신고 상세
  router.get('/reports/:id', async (req, res) => {
    const id = req.params.id;
    const report = await prisma.report.findUnique({
      where: { id },
      include: {
        photos: true,
        user: { select: { id: true, name: true } },
        _count: { select: { sightings: true, matches: true } },
      },
    });

    if (!report) throw new ApiError(404, 'REPORT_NOT_FOUND');
    res.json(report);
  });

  // 신고 상태 업데이트
  router.patch('/reports/:id/status', requireAuth, async (req, res) => {
    const id = req.params.id;
    const { status } = z
      .object({ status: z.enum(['ACTIVE', 'FOUND']) })
      .parse(req.body);

    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) throw new ApiError(404, 'REPORT_NOT_FOUND');
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { userId: statusUserId } = req.user!; // requireAuth가 보장
    if (report.userId !== statusUserId) {
      throw new ApiError(403, 'REPORT_OWNER_ONLY');
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

  // 신고에 사진 추가
  router.post(
    '/reports/:id/photos',
    requireAuth,
    upload.array('photos', MAX_ADDITIONAL_PHOTOS),
    async (req, res) => {
      const id = req.params.id;
      const report = await prisma.report.findUnique({ where: { id } });
      if (!report) throw new ApiError(404, 'REPORT_NOT_FOUND');
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const { userId: photosUserId } = req.user!; // requireAuth가 보장
      if (report.userId !== photosUserId) {
        throw new ApiError(403, 'REPORT_OWNER_ONLY');
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
