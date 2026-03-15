import webpush from 'web-push';
import { prisma } from '../db/client.js';
import { config } from '../config.js';
import { createLogger } from '../logger.js';

const log = createLogger('pushService');

// VAPID 키가 설정된 경우에만 초기화
if (config.vapidPublicKey && config.vapidPrivateKey) {
  webpush.setVapidDetails(config.vapidEmail, config.vapidPublicKey, config.vapidPrivateKey);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!config.vapidPublicKey || !config.vapidPrivateKey) return;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
      } catch (err: unknown) {
        // 410 Gone = 구독 만료 → 자동 삭제
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => null);
          log.info({ subscriptionId: sub.id }, 'Expired push subscription removed');
        } else {
          throw err;
        }
      }
    }),
  );

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    log.warn({ userId, failedCount: failed.length }, 'Some web push notifications failed');
  }
}
