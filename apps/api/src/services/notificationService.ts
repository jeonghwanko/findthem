import { config } from '../config.js';
import { DEFAULT_LOCALE, type Locale } from '@findthem/shared';
import { createLogger } from '../logger.js';

const log = createLogger('notificationService');

export interface MatchNotificationParams {
  recipientPhone: string;
  recipientName: string;
  reportName: string;
  subjectType: string;
  confidence: number;
  matchId: string;
  sightingUrl: string;
  locale?: Locale;
}

// ── SMS 본문 다국어 맵 ──

const SMS_MESSAGES: Record<Locale, (recipientName: string, reportName: string, confidencePct: number, sightingUrl: string) => string> = {
  ko: (recipientName, reportName, confidencePct, sightingUrl) =>
    `[FindThem] ${recipientName}님, "${reportName}" 실종 신고와 ` +
    `유사한 목격 제보가 접수되었습니다. (일치도 ${confidencePct}%)\n` +
    `확인: ${sightingUrl}`,
  en: (recipientName, reportName, confidencePct, sightingUrl) =>
    `[FindThem] Hi ${recipientName}, a sighting matching your missing report "${reportName}" has been received. ` +
    `(Confidence: ${confidencePct}%)\n` +
    `View: ${sightingUrl}`,
  ja: (recipientName, reportName, confidencePct, sightingUrl) =>
    `[FindThem] ${recipientName}様、「${reportName}」の行方不明届に類似した目撃情報が届きました。` +
    `（一致度：${confidencePct}%）\n` +
    `確認：${sightingUrl}`,
  'zh-TW': (recipientName, reportName, confidencePct, sightingUrl) =>
    `[FindThem] ${recipientName}您好，與您的失蹤通報「${reportName}」相似的目擊報告已收到。` +
    `（相符度：${confidencePct}%）\n` +
    `查看：${sightingUrl}`,
};

// ── 로그 메시지 다국어 맵 ──

const LOG_MESSAGES: Record<Locale, {
  alimtalkSent: string;
  smsSent: string;
  notifyWarningPrefix: string;
  recipient: string;
  content: string;
}> = {
  ko: {
    alimtalkSent: '알림톡 발송 완료',
    smsSent: 'SMS 발송 완료',
    notifyWarningPrefix: '알림 수단 미설정 — 수동 확인 필요',
    recipient: '수신자',
    content: '내용',
  },
  en: {
    alimtalkSent: 'Alimtalk sent',
    smsSent: 'SMS sent',
    notifyWarningPrefix: 'Notification method not configured — manual check required',
    recipient: 'Recipient',
    content: 'Content',
  },
  ja: {
    alimtalkSent: 'アリムトーク送信完了',
    smsSent: 'SMS送信完了',
    notifyWarningPrefix: '通知手段未設定 — 手動確認が必要',
    recipient: '受信者',
    content: '内容',
  },
  'zh-TW': {
    alimtalkSent: 'Alimtalk 發送完成',
    smsSent: 'SMS 發送完成',
    notifyWarningPrefix: '通知方式未設定 — 需要手動確認',
    recipient: '收件者',
    content: '內容',
  },
};

/**
 * 카카오 알림톡 전송
 * - KAKAO_SENDER_KEY (발신 프로필 키) 필요
 * - KAKAO_ALIMTALK_TEMPLATE_CODE 필요 (사전 등록된 템플릿)
 */
async function sendAlimtalk(
  phone: string,
  templateCode: string,
  templateParams: Record<string, string>,
): Promise<boolean> {
  if (!config.kakaoSenderKey || !config.kakaoAdminKey) return false;

  const messages = [
    {
      to: phone.replace(/-/g, ''),
      templateCode,
      templateParams,
    },
  ];

  try {
    const res = await fetch('https://kapi.kakao.com/v1/api/talk/alimtalk/message', {
      method: 'POST',
      headers: {
        Authorization: `KakaoAK ${config.kakaoAdminKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        senderKey: config.kakaoSenderKey,
        messages,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      log.warn({ err }, '[NOTIFICATION] 알림톡 발송 실패');
      return false;
    }
    return true;
  } catch (err) {
    log.warn({ err }, '[NOTIFICATION] 알림톡 오류');
    return false;
  }
}

/**
 * SMS 전송 (CoolSMS 호환 인터페이스)
 * - SMS_API_KEY, SMS_API_SECRET, SMS_FROM 환경변수 필요
 */
async function sendSms(phone: string, text: string): Promise<boolean> {
  if (!config.smsApiKey || !config.smsApiSecret || !config.smsFrom) return false;

  try {
    // CoolSMS REST API v4
    const timestamp = Date.now().toString();
    const { createHmac } = await import('crypto');
    const signature = createHmac('sha256', config.smsApiSecret)
      .update(timestamp + config.smsApiKey)
      .digest('hex');

    const res = await fetch('https://api.coolsms.co.kr/messages/v4/send', {
      method: 'POST',
      headers: {
        Authorization: `HMAC-SHA256 apiKey=${config.smsApiKey}, date=${timestamp}, salt=${timestamp}, signature=${signature}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          to: phone.replace(/-/g, ''),
          from: config.smsFrom,
          text,
          type: 'SMS',
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      log.warn({ err }, '[NOTIFICATION] SMS 발송 실패');
      return false;
    }
    return true;
  } catch (err) {
    log.warn({ err }, '[NOTIFICATION] SMS 오류');
    return false;
  }
}

/**
 * 매칭 알림 발송
 * 우선순위: 카카오 알림톡 → SMS → 로그
 */
export async function sendMatchNotification(params: MatchNotificationParams): Promise<void> {
  const {
    recipientPhone,
    recipientName,
    reportName,
    confidence,
    sightingUrl,
    locale = DEFAULT_LOCALE,
  } = params;

  const confidencePct = Math.round(confidence * 100);
  const smsText = SMS_MESSAGES[locale](recipientName, reportName, confidencePct, sightingUrl);
  const logMessages = LOG_MESSAGES[locale];

  // 1. 카카오 알림톡 시도
  const alimtalkSent = await sendAlimtalk(recipientPhone, 'MATCH_NOTIFY', {
    name: recipientName,
    reportName,
    confidence: `${confidencePct}%`,
    url: sightingUrl,
  });

  if (alimtalkSent) {
    log.info({ recipientPhone }, `[NOTIFICATION] ${logMessages.alimtalkSent}`);
    return;
  }

  // 2. SMS 시도
  const smsSent = await sendSms(recipientPhone, smsText);
  if (smsSent) {
    log.info({ recipientPhone }, `[NOTIFICATION] ${logMessages.smsSent}`);
    return;
  }

  // 3. 미설정 시 로그 (알림 미전송 명시)
  log.warn(
    { recipientName, recipientPhone, smsText },
    `[NOTIFICATION] ${logMessages.notifyWarningPrefix}`,
  );
}
