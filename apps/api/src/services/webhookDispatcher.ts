import { createHmac } from 'node:crypto';
import { resolve as dnsResolve4 } from 'node:dns/promises';
import { prisma } from '../db/client.js';
import { createLogger } from '../logger.js';

const log = createLogger('webhookDispatcher');

const WEBHOOK_TIMEOUT_MS = 5_000;
const MAX_CONTENT_IN_PAYLOAD = 500;

/** 사설/루프백 IP 패턴 — SSRF 방지 */
const PRIVATE_IP = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|169\.254\.|::1$|fc00:|fd)/;

export interface WebhookPayload {
  event: 'new_question' | 'new_comment' | 'mention';
  postId: string;
  postTitle: string;
  postContent: string;
  sourceUrl: string | null;
  comments?: Array<{
    id: string;
    authorName: string;
    authorType: 'user' | 'agent' | 'external_agent';
    content: string;
    createdAt: string;
  }>;
  timestamp: string;
}

/**
 * SSRF 방어: HTTPS 필수 + 사설 IP 차단.
 * 등록 시점이 아니라 발송 시점에 검사 (DNS rebinding 방어).
 */
async function assertSafeUrl(rawUrl: string): Promise<void> {
  const u = new URL(rawUrl);
  if (u.protocol !== 'https:') throw new Error('Webhook URL must use HTTPS');
  try {
    const addresses = await dnsResolve4(u.hostname);
    if (addresses.some((a) => PRIVATE_IP.test(a))) {
      throw new Error(`Webhook URL resolved to private IP: ${u.hostname}`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('private IP')) throw err;
    // DNS 실패 시 발송 차단 (안전 쪽으로)
    throw new Error(`DNS resolution failed for ${u.hostname}`);
  }
}

/** payload의 postContent를 500자로 잘라 반환 */
function truncatePayload(payload: WebhookPayload): WebhookPayload {
  return {
    ...payload,
    postContent: payload.postContent.slice(0, MAX_CONTENT_IN_PAYLOAD),
  };
}

async function deliverWebhook(
  agent: { id: string; name: string; webhookUrl: string; apiKey: string },
  body: string,
  event: string,
): Promise<void> {
  await assertSafeUrl(agent.webhookUrl);

  /**
   * HMAC 서명: DB에 저장된 apiKey(= SHA-256 해시)를 HMAC 키로 사용.
   * 외부 에이전트 검증법: sha256(rawKey) → HMAC-SHA256(hash, body) === X-Webhook-Signature
   */
  const signature = createHmac('sha256', agent.apiKey)
    .update(body)
    .digest('hex');

  const res = await fetch(agent.webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': signature,
      'X-Webhook-Event': event,
    },
    body,
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  });

  if (!res.ok) {
    log.warn(
      { agentId: agent.id, agentName: agent.name, status: res.status },
      'Webhook delivery failed with non-2xx status',
    );
  } else {
    log.info({ agentId: agent.id, agentName: agent.name }, 'Webhook delivered');
  }
}

/**
 * 모든 활성 외부 에이전트의 webhookUrl로 이벤트 전송 (fire-and-forget).
 * 실패해도 로그만 남기고 진행.
 */
export async function dispatchWebhookToAll(payload: WebhookPayload): Promise<void> {
  const agents = await prisma.externalAgent.findMany({
    where: { isActive: true, webhookUrl: { not: null } },
    select: { id: true, name: true, webhookUrl: true, apiKey: true },
  });

  if (agents.length === 0) return;

  const body = JSON.stringify(truncatePayload(payload));

  await Promise.allSettled(
    agents.map(async (agent) => {
      if (!agent.webhookUrl) return;
      try {
        await deliverWebhook(
          { id: agent.id, name: agent.name, webhookUrl: agent.webhookUrl, apiKey: agent.apiKey },
          body,
          payload.event,
        );
      } catch (err) {
        log.warn({ err, agentId: agent.id, agentName: agent.name }, 'Webhook delivery error');
      }
    }),
  );
}

/**
 * 특정 외부 에이전트 한 곳에만 webhook 전송.
 */
export async function dispatchWebhookToAgent(
  agentId: string,
  payload: WebhookPayload,
): Promise<void> {
  const agent = await prisma.externalAgent.findUnique({
    where: { id: agentId },
    select: { id: true, name: true, webhookUrl: true, apiKey: true, isActive: true },
  });

  if (!agent || !agent.isActive || !agent.webhookUrl) return;

  const body = JSON.stringify(truncatePayload(payload));
  try {
    await deliverWebhook(
      { id: agent.id, name: agent.name, webhookUrl: agent.webhookUrl, apiKey: agent.apiKey },
      body,
      payload.event,
    );
  } catch (err) {
    log.warn({ err, agentId: agent.id }, 'Webhook delivery error');
  }
}
