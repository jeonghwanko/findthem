import exifr from 'exifr';

const MAX_LONG_EDGE = 1200;
const JPEG_QUALITY = 0.8;

/**
 * Canvas API로 이미지를 압축/리사이즈한다.
 * - 긴 변이 MAX_LONG_EDGE(1200px)를 초과하면 비율 유지로 축소
 * - EXIF Orientation 태그를 읽어 캔버스 회전/반전 보정
 * - JPEG 품질 JPEG_QUALITY(80%)로 재인코딩
 * - 원본이 이미 충분히 작으면 회전 보정만 적용
 */
export async function compressImage(file: File): Promise<File> {
  // EXIF orientation 읽기 (없으면 1로 폴백)
  let orientation = 1;
  try {
    const exifData = await exifr.parse(file, { pick: ['Orientation'] });
    if (exifData?.Orientation) orientation = exifData.Orientation as number;
  } catch { /* silent */ }

  return new Promise<File>((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      const origW = img.naturalWidth;
      const origH = img.naturalHeight;

      // 리사이즈 비율 계산 (긴 변 기준)
      const longEdge = Math.max(origW, origH);
      const scale = longEdge > MAX_LONG_EDGE ? MAX_LONG_EDGE / longEdge : 1;
      const targetW = Math.round(origW * scale);
      const targetH = Math.round(origH * scale);

      // Orientation 5–8은 90°/270° 회전 → 캔버스 가로/세로 교체
      const swapped = orientation >= 5 && orientation <= 8;
      const canvasW = swapped ? targetH : targetW;
      const canvasH = swapped ? targetW : targetH;

      const canvas = document.createElement('canvas');
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }

      // EXIF Orientation → Canvas 변환 행렬 적용
      switch (orientation) {
        case 2: ctx.transform(-1, 0, 0,  1, canvasW, 0);          break;
        case 3: ctx.transform(-1, 0, 0, -1, canvasW, canvasH);     break;
        case 4: ctx.transform( 1, 0, 0, -1, 0, canvasH);           break;
        case 5: ctx.transform( 0, 1, 1,  0, 0, 0);                 break;
        case 6: ctx.transform( 0, 1, -1, 0, canvasH, 0);           break;
        case 7: ctx.transform( 0, -1, -1, 0, canvasH, canvasW);    break;
        case 8: ctx.transform( 0, -1, 1,  0, 0, canvasW);          break;
        default: break;
      }

      ctx.drawImage(img, 0, 0, targetW, targetH);

      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          const compressed = new File(
            [blob],
            file.name.replace(/\.[^.]+$/, '.jpg'),
            { type: 'image/jpeg', lastModified: file.lastModified },
          );
          resolve(compressed);
        },
        'image/jpeg',
        JPEG_QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}
