import { config } from '../config.js';
import { createLogger } from '../logger.js';
import { getAccessToken } from './googleAuth.js';

const log = createLogger('gmail');

// ── MIME header injection prevention ──

function assertNoHeaderInjection(value: string, fieldName: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`MIME header injection attempt detected in ${fieldName}`);
  }
}

// ── MIME message builder ──

function buildMimeMessage(to: string, from: string, subject: string, htmlBody: string): string {
  // Validate headers before building the MIME message
  assertNoHeaderInjection(to, 'to');
  assertNoHeaderInjection(subject, 'subject');

  const boundary = `boundary_${Date.now().toString(36)}`;

  const headers = [
    `From: FindThem <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join('\r\n');

  const textPart = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    htmlBody.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' '),
  ].join('\r\n');

  const htmlPart = [
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    htmlBody,
    `--${boundary}--`,
  ].join('\r\n');

  const raw = `${headers}\r\n\r\n${textPart}\r\n\r\n${htmlPart}`;

  // base64url encoding
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ── Gmail API response ──

interface GmailSendResponse {
  id?: string;
  error?: { message?: string };
}

// ── GmailAdapter class ──

export class GmailAdapter {
  async sendEmail(to: string, subject: string, htmlBody: string): Promise<string> {
    const accessToken = await getAccessToken();

    const rawMessage = buildMimeMessage(to, config.outreachEmailFrom, subject, htmlBody);

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: rawMessage }),
      signal: AbortSignal.timeout(15_000),
    });

    const data = (await res.json()) as GmailSendResponse;

    if (!res.ok || !data.id) {
      const errMsg = data.error?.message ?? `HTTP ${res.status}`;
      log.error({ to, subject, error: errMsg }, 'Gmail send failed');
      throw new Error(`Gmail send failed: ${errMsg}`);
    }

    log.info({ to, messageId: data.id }, 'Email sent via Gmail');
    return data.id;
  }
}
