import sharp from 'sharp';
import crypto from 'crypto';
import { storageService } from './storageService.js';

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
};
