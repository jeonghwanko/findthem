import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'crypto';
import { config } from '../config.js';
import { ApiError } from './errors.js';
import { ERROR_CODES, ADMIN_API_KEY_HEADER, AGENT_API_KEY_HEADER, AGENT_ID_HEADER, VALID_AGENT_IDS } from '@findthem/shared';
import { prisma } from '../db/client.js';

export interface JwtPayload {
  userId: string;
}

export interface AgentPayload {
  agentId: string;
}

export interface ExternalAgentPayload {
  id: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      agent?: AgentPayload;
      externalAgent?: ExternalAgentPayload;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new ApiError(401, ERROR_CODES.AUTH_REQUIRED);
  }

  const token = header.slice(7);
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
  } catch {
    throw new ApiError(401, ERROR_CODES.INVALID_TOKEN);
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isBlocked: true },
  });
  if (!user || user.isBlocked) {
    throw new ApiError(403, ERROR_CODES.USER_BLOCKED);
  }

  req.user = payload;
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    req.user = payload;
  } catch {
    // 무효한 토큰이어도 계속 진행
  }
  next();
}

export function requireAgentAuth(req: Request, _res: Response, next: NextFunction) {
  const apiKey = req.headers[AGENT_API_KEY_HEADER] as string | undefined;
  const agentId = req.headers[AGENT_ID_HEADER] as string | undefined;

  if (!agentId || !(VALID_AGENT_IDS as readonly string[]).includes(agentId)) {
    throw new ApiError(400, ERROR_CODES.AGENT_INVALID_ID);
  }

  // 에이전트별 개별 키 검증
  const expectedKey = config.agentKeys[agentId];
  const valid =
    apiKey &&
    expectedKey &&
    apiKey.length === expectedKey.length &&
    timingSafeEqual(Buffer.from(apiKey), Buffer.from(expectedKey));
  if (!valid) {
    throw new ApiError(403, ERROR_CODES.AGENT_AUTH_REQUIRED);
  }

  req.agent = { agentId };
  next();
}

export async function requireExternalAgentAuth(req: Request, _res: Response, next: NextFunction) {
  const apiKey = req.headers['x-external-agent-key'] as string | undefined;

  if (!apiKey) {
    throw new ApiError(401, ERROR_CODES.EXTERNAL_AGENT_AUTH_REQUIRED);
  }

  const agent = await prisma.externalAgent.findUnique({
    where: { apiKey },
    select: { id: true, name: true, isActive: true },
  });

  if (!agent) {
    throw new ApiError(401, ERROR_CODES.EXTERNAL_AGENT_AUTH_REQUIRED);
  }

  if (!agent.isActive) {
    throw new ApiError(403, ERROR_CODES.EXTERNAL_AGENT_INACTIVE);
  }

  // lastUsedAt 업데이트 (fire-and-forget)
  void prisma.externalAgent
    .update({ where: { apiKey }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  req.externalAgent = { id: agent.id, name: agent.name };
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  // 헤더로만 허용 (쿼리 파라미터는 URL 로그에 노출되므로 금지)
  const apiKey = req.headers[ADMIN_API_KEY_HEADER] as string | undefined;

  const adminKey = config.adminApiKey;
  const valid =
    apiKey &&
    adminKey &&
    apiKey.length === adminKey.length &&
    timingSafeEqual(Buffer.from(apiKey), Buffer.from(adminKey));
  if (!valid) {
    throw new ApiError(403, ERROR_CODES.ADMIN_REQUIRED);
  }
  next();
}
