import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { prisma } from '../db/client.js';
import { validateQuery } from '../middlewares/validate.js';
import { optionalAuth } from '../middlewares/auth.js';
import { ApiError } from '../middlewares/errors.js';
import { imageService } from '../services/imageService.js';
import { imageQueue } from '../jobs/queues.js';
import { MAX_FILE_SIZE } from '@findthem/shared';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('이미지 파일만 업로드 가능합니다.'));
  },
});

const createSightingSchema = z.object({
  reportId: z.string().optional(),
  description: z.string().min(1, '목격 내용을 입력하세요'),
  sightedAt: z
    .string()
    .transform((s) => new Date(s))
    .refine((d) => d <= new Date(), { message: '미래 날짜는 입력할 수 없습니다.' }),
  address: z.string().min(1),
  lat: z.number().optional(),
  lng: z.number().optional(),
  tipsterPhone: z.string().optional(),
  tipsterName: z.string().optional(),
});

const sightingListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function registerSightingRoutes(router: Router) {
  // 제보 접수
  router.post(
    '/sightings',
    optionalAuth,
    upload.array('photos', 5),
    async (req, res) => {
      const body = createSightingSchema.parse(
        typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body,
      );

      // reportId 유효성 확인 + 상태 체크
      if (body.reportId) {
        const report = await prisma.report.findUnique({
          where: { id: body.reportId },
          select: { status: true },
        });
        if (!report) throw new ApiError(404, '해당 실종 신고를 찾을 수 없습니다.');
        if (report.status !== 'ACTIVE') {
          throw new ApiError(400, '종료된 신고에는 제보할 수 없습니다.');
        }
      }

      const sighting = await prisma.sighting.create({
        data: {
          ...body,
          userId: req.user?.userId,
          source: 'WEB',
        },
      });

      // 사진 처리
      const files = (req.files as Express.Multer.File[]) || [];
      const photos = await Promise.all(
        files.map(async (file) => {
          const { photoUrl, thumbnailUrl } = await imageService.processAndSave('sightings', file);
          return prisma.sightingPhoto.create({
            data: { sightingId: sighting.id, photoUrl, thumbnailUrl },
          });
        }),
      );

      // 이미지 분석 + 매칭 작업 enqueue
      if (photos.length > 0) {
        await imageQueue.add(
          'process-sighting-photos',
          { type: 'sighting', sightingId: sighting.id },
          { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
        );
      }

      res.status(201).json({ ...sighting, photos });
    },
  );

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
