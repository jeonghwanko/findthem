import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import { storageService } from './storageService.js';

// fs 모듈 mock
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('storageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveFile', () => {
    it('디렉토리 생성 + 파일 저장 + URL 반환', async () => {
      const data = Buffer.from('test-image-data');
      const result = await storageService.saveFile('reports', 'photo.jpg', data);

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('reports'),
        { recursive: true },
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('photo.jpg'),
        data,
      );
      expect(result).toBe('/uploads/reports/photo.jpg');
    });
  });

  describe('deleteFile', () => {
    it('파일 삭제 성공', async () => {
      await storageService.deleteFile('/uploads/reports/photo.jpg');

      expect(fs.unlink).toHaveBeenCalledWith(
        expect.stringContaining('photo.jpg'),
      );
    });

    it('파일이 없어도 에러 없이 완료', async () => {
      (fs.unlink as any).mockRejectedValueOnce(new Error('ENOENT'));

      await expect(
        storageService.deleteFile('/uploads/nonexistent.jpg'),
      ).resolves.toBeUndefined();
    });
  });

  describe('getAbsolutePath', () => {
    it('/uploads/ 접두사를 제거하고 절대경로 반환', () => {
      const result = storageService.getAbsolutePath('/uploads/reports/photo.jpg');
      expect(result).toContain('reports');
      expect(result).toContain('photo.jpg');
      expect(result).not.toMatch(/^\/uploads\//);
    });
  });
});
