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

  /** Base64 인코딩 (Claude Vision용) */
  async toBase64(filePath: string): Promise<string> {
    const absPath = storageService.getAbsolutePath(filePath);
    const buffer = await sharp(absPath)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return buffer.toString('base64');
  },
};
