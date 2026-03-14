import type { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/client.js';
import { config } from '../config.js';
import { validateBody } from '../middlewares/validate.js';
import { ApiError } from '../middlewares/errors.js';
import { requireAuth } from '../middlewares/auth.js';
import { authLimiter } from '../middlewares/rateLimit.js';

const registerSchema = z.object({
  name: z.string().min(1, '이름을 입력하세요'),
  phone: z.string().regex(/^01[016789]\d{7,8}$/, '올바른 전화번호를 입력하세요'),
  password: z.string().min(6, '비밀번호는 6자 이상이어야 합니다'),
  email: z.string().email().optional(),
});

const loginSchema = z.object({
  phone: z.string(),
  password: z.string(),
});

function signToken(userId: string): string {
  return jwt.sign({ userId }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}

export function registerAuthRoutes(router: Router) {
  // 회원가입
  router.post('/auth/register', authLimiter, validateBody(registerSchema), async (req, res) => {
    const { name, phone, password, email } = req.body;

    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) {
      throw new ApiError(409, 'PHONE_ALREADY_EXISTS');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, phone, passwordHash, email },
    });

    const token = signToken(user.id);
    res.status(201).json({
      user: { id: user.id, name: user.name, phone: user.phone },
      token,
    });
  });

  // 로그인
  router.post('/auth/login', authLimiter, validateBody(loginSchema), async (req, res) => {
    const { phone, password } = req.body;

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user || !user.passwordHash) {
      throw new ApiError(401, 'INVALID_CREDENTIALS');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new ApiError(401, 'INVALID_CREDENTIALS');
    }

    const token = signToken(user.id);
    res.json({
      user: { id: user.id, name: user.name, phone: user.phone },
      token,
    });
  });

  // 내 정보
  router.get('/auth/me', requireAuth, async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { userId } = req.user!; // requireAuth가 보장
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, phone: true, email: true, createdAt: true },
    });
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
    res.json(user);
  });
}
