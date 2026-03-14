import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';
import { createLogger } from '../logger.js';

const log = createLogger('storageService');

const UPLOAD_ROOT = path.resolve(config.uploadDir);

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function assertSafePath(resolvedPath: string): void {
  if (!resolvedPath.startsWith(UPLOAD_ROOT + path.sep) && resolvedPath !== UPLOAD_ROOT) {
    throw new Error(`경로 접근 오류: 허용된 디렉토리 밖의 경로입니다.`);
  }
}

export const storageService = {
  async saveFile(
    subDir: string,
    filename: string,
    data: Buffer,
  ): Promise<string> {
    const dir = path.resolve(UPLOAD_ROOT, subDir);
    assertSafePath(dir);
    await ensureDir(dir);
    const filePath = path.resolve(dir, filename);
    assertSafePath(filePath);
    await fs.writeFile(filePath, data);
    return `/uploads/${subDir}/${filename}`;
  },

  async deleteFile(relativePath: string): Promise<void> {
    const fullPath = path.resolve(UPLOAD_ROOT, relativePath.replace(/^\/uploads\//, ''));
    try {
      assertSafePath(fullPath);
      await fs.unlink(fullPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        log.error({ err, relativePath }, '[STORAGE] 파일 삭제 실패');
      }
    }
  },

  getAbsolutePath(relativePath: string): string {
    const fullPath = path.resolve(UPLOAD_ROOT, relativePath.replace(/^\/uploads\//, ''));
    assertSafePath(fullPath);
    return fullPath;
  },
};
