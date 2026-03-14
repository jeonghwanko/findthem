import sharp from 'sharp';
import crypto from 'crypto';
import { storageService } from './storageService.js';

export const imageService = {
  /** 사진 저장 + 썸네일 생성 */
  async processAndSave(
    subDir: string,
    file: Express.Multer.File,
  ): Promise<{ photoUrl: string; thumbnailUrl: string }> {
    const id = crypto.randomUUID();
    const ext = '.jpg';

    // 원본 리사이즈 (최대 1200px)
    const resized = await sharp(file.buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const photoUrl = await storageService.saveFile(subDir, `${id}${ext}`, resized);

    // 썸네일 (300px)
    const thumb = await sharp(file.buffer)
      .resize(300, 300, { fit: 'cover' })
      .jpeg({ quality: 70 })
      .toBuffer();

    const thumbnailUrl = await storageService.saveFile(
      'thumbs',
      `${id}${ext}`,
      thumb,
    );

    return { photoUrl, thumbnailUrl };
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
