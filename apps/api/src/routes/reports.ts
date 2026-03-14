import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { validateQuery } from '../middlewares/validate.js';
import { requireAuth, optionalAuth } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';
import { imageService } from '../services/imageService.js';
import { imageQueue } from '../jobs/queues.js';
import { MAX_FILE_SIZE, MAX_REPORT_PHOTOS, MAX_ADDITIONAL_PHOTOS } from '@findthem/shared';
import { cleanupQueue } from '../jobs/queues.js';

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
      const { report, photos } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const report = await tx.report.create({
          data: { userId: req.user!.userId, ...body },
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
      await imageQueue.add(
        'process-report-photos',
        { type: 'report', reportId: report.id },
        { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
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
  router.get('/reports/mine', requireAuth, async (req, res) => {
    const reports = await prisma.report.findMany({
      where: { userId: req.user!.userId },
      include: {
        photos: { where: { isPrimary: true }, take: 1 },
        _count: { select: { sightings: true, matches: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(reports);
  });

  // 실종 신고 상세
  router.get('/reports/:id', async (req, res) => {
    const id = req.params.id as string;
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
    const id = req.params.id as string;
    const { status } = z
      .object({ status: z.enum(['ACTIVE', 'FOUND']) })
      .parse(req.body);

    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) throw new ApiError(404, 'REPORT_NOT_FOUND');
    if (report.userId !== req.user!.userId) {
      throw new ApiError(403, 'REPORT_OWNER_ONLY');
    }

    const updated = await prisma.report.update({
      where: { id },
      data: { status },
    });

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
      const id = req.params.id as string;
      const report = await prisma.report.findUnique({ where: { id } });
      if (!report) throw new ApiError(404, 'REPORT_NOT_FOUND');
      if (report.userId !== req.user!.userId) {
        throw new ApiError(403, 'REPORT_OWNER_ONLY');
      }

      const files = (req.files as Express.Multer.File[]) || [];
      const photos = await Promise.all(
        files.map(async (file) => {
          const { photoUrl, thumbnailUrl } = await imageService.processAndSave('reports', file);
          return prisma.reportPhoto.create({
            data: { reportId: report.id, photoUrl, thumbnailUrl },
          });
        }),
      );

      res.status(201).json(photos);
    },
  );
}
