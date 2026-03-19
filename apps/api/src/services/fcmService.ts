import admin from 'firebase-admin';
import { config } from '../config.js';
import { createLogger } from '../logger.js';
import { prisma } from '../db/client.js';

const log = createLogger('fcmService');

let messaging: admin.messaging.Messaging | null = null;

function getMessaging(): admin.messaging.Messaging | null {
  if (messaging) return messaging;

  const json = config.firebaseServiceAccountJson;
  if (!json) {
    log.warn('FIREBASE_SERVICE_ACCOUNT_JSON not set — FCM disabled');
    return null;
  }

  try {
    // firebase-admin 앱이 이미 초기화된 경우 재사용
    const existingApp = admin.apps.find((a) => a?.name === 'fcm');
    const app = existingApp ?? admin.initializeApp(
      {
        credential: admin.credential.cert(JSON.parse(json) as admin.ServiceAccount),
      },
      'fcm',
    );
    messaging = app.messaging();
    log.info('Firebase Admin SDK initialized');
    return messaging;
  } catch (err) {
    log.warn({ err }, 'Failed to initialize Firebase Admin SDK');
    return null;
  }
}

export async function sendPushNotification(
  userId: string,
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  const m = getMessaging();
  if (!m) return;

  try {
    const messageId = await m.send({
      token: fcmToken,
      notification: { title, body },
      data,
      android: {
        priority: 'high',
        notification: { channelId: 'default' },
      },
      apns: {
        payload: {
          aps: { sound: 'default' },
        },
      },
    });
    log.info({ messageId }, 'FCM push notification sent');
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token'
    ) {
      await prisma.user.update({ where: { id: userId }, data: { fcmToken: null } }).catch(() => {});
    }
    log.warn({ err, userId }, 'Failed to send FCM push notification');
  }
}
