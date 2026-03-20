import sharp from 'sharp';
import crypto from 'crypto';
import { resolve as dnsResolve4 } from 'node:dns/promises';
import { storageService } from './storageService.js';

/** SSRF 방어: 사설/루프백 IP 차단 (외부 이미지 다운로드 시) */
const PRIVATE_IP = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|169\.254\.|::1$|fc00:|fd)/;

async function assertSafeImageUrl(rawUrl: string): Promise<void> {
  const u = new URL(rawUrl);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Image URL must use HTTP(S)');
  }
  try {
    const addresses = await dnsResolve4(u.hostname);
    if (addresses.some((a) => PRIVATE_IP.test(a))) {
      throw new Error(`Image URL resolved to private IP: ${u.hostname}`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('private IP')) throw err;
  }
}

export interface ImageMetadata {
  width: number;
  height: number;
  dominantColors: string[];   // hex (#RRGGBB)
  blurScore: number;          // 0~1 (1 = sharp, 0 = very blurry)
  hash: string;               // perceptual hash for dedup
}

async function resizeAndThumb(
  buffer: Buffer,
  subDir: string,
  id: string,
): Promise<{ photoUrl: string; thumbnailUrl: string }> {
  const ext = '.jpg';

  const resized = await sharp(buffer)
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  const photoUrl = await storageService.saveFile(subDir, `${id}${ext}`, resized);

  const thumb = await sharp(buffer)
    .resize(300, 300, { fit: 'cover' })
    .jpeg({ quality: 70 })
    .toBuffer();

  const thumbnailUrl = await storageService.saveFile('thumbs', `${id}${ext}`, thumb);

  return { photoUrl, thumbnailUrl };
}

export const imageService = {
  /** 사진 저장 + 썸네일 생성 (multer File 객체) */
  async processAndSave(
    subDir: string,
    file: Express.Multer.File,
  ): Promise<{ photoUrl: string; thumbnailUrl: string }> {
    const id = crypto.randomUUID();
    return resizeAndThumb(file.buffer, subDir, id);
  },

  /**
   * 외부 URL에서 이미지를 다운로드하여 로컬에 저장 (크롤 데이터용)
   * 다운로드 실패 시 null 반환 (graceful)
   */
  async processAndSaveFromUrl(
    subDir: string,
    url: string,
  ): Promise<{ photoUrl: string; thumbnailUrl: string } | null> {
    let buffer: Buffer;
    try {
      await assertSafeImageUrl(url);
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return null;
      buffer = Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }

    const id = crypto.randomUUID();
    return resizeAndThumb(buffer, subDir, id);
  },

  /** Base64 인코딩 (Claude Vision용) - 로컬 경로 또는 외부 URL 모두 처리 */
  async toBase64(filePathOrUrl: string): Promise<string> {
    const isExternal = filePathOrUrl.startsWith('http://') || filePathOrUrl.startsWith('https://');

    const sharpInput = isExternal
      ? Buffer.from(await (async () => {
          const res = await fetch(filePathOrUrl, { signal: AbortSignal.timeout(10_000) });
          if (!res.ok) throw new Error(`External image fetch failed: ${res.status}`);
          return res.arrayBuffer();
        })())
      : storageService.getAbsolutePath(filePathOrUrl);

    const buffer = await sharp(sharpInput)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return buffer.toString('base64');
  },

  /** Sharp로 이미지 메타데이터 추출 (LLM 호출 전 전처리) */
  async extractMetadata(filePathOrUrl: string): Promise<ImageMetadata> {
    const isExternal = filePathOrUrl.startsWith('http://') || filePathOrUrl.startsWith('https://');
    const sharpInput = isExternal
      ? Buffer.from(await (async () => {
          const res = await fetch(filePathOrUrl, { signal: AbortSignal.timeout(10_000) });
          if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
          return res.arrayBuffer();
        })())
      : storageService.getAbsolutePath(filePathOrUrl);

    const image = sharp(sharpInput);
    const metadata = await image.metadata();
    const stats = await image.stats();

    // 주요 색상 3개 — 각 채널의 평균값에서 추출
    const dominantColors = stats.channels.length >= 3
      ? [rgbToHex(stats.channels[0].mean, stats.channels[1].mean, stats.channels[2].mean)]
      : ['#808080'];

    // 추가 색상: 16x16 타일로 축소 후 상위 색상 추출
    const tinyBuf = await sharp(sharpInput)
      .resize(4, 4, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer();
    const colorSet = new Set<string>();
    colorSet.add(dominantColors[0]);
    for (let i = 0; i < tinyBuf.length - 2; i += 3) {
      colorSet.add(rgbToHex(tinyBuf[i], tinyBuf[i + 1], tinyBuf[i + 2]));
      if (colorSet.size >= 5) break;
    }

    // 블러 점수 — Laplacian variance 근사 (작은 이미지의 표준편차 활용)
    const grayStats = await sharp(sharpInput)
      .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
      .grayscale()
      .stats();
    const stdDev = grayStats.channels[0]?.stdev ?? 0;
    const blurScore = Math.min(1, stdDev / 80); // 80+ stdev = sharp

    // 이미지 해시 — 8x8 grayscale average hash
    const hashBuf = await sharp(sharpInput)
      .resize(8, 8, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();
    const avg = hashBuf.length > 0 ? hashBuf.reduce((sum, v) => sum + v, 0) / hashBuf.length : 0;
    const hashBits = Array.from(hashBuf).map((v) => (v >= avg ? '1' : '0')).join('');
    const hash = hashBits ? BigInt(`0b${hashBits}`).toString(16).padStart(16, '0') : '0'.repeat(16);

    return {
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      dominantColors: [...colorSet],
      blurScore: Math.round(blurScore * 100) / 100,
      hash,
    };
  },
};

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
