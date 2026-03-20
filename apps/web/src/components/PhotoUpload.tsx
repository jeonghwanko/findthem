import { useRef, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, ImagePlus, X, SwitchCamera } from 'lucide-react';
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
async function compressImage(file: File): Promise<File> {
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
      // https://magnushoff.com/articles/jpeg-orientation/
      switch (orientation) {
        case 2: ctx.transform(-1, 0, 0,  1, canvasW, 0);          break;
        case 3: ctx.transform(-1, 0, 0, -1, canvasW, canvasH);     break;
        case 4: ctx.transform( 1, 0, 0, -1, 0, canvasH);           break;
        case 5: ctx.transform( 0, 1, 1,  0, 0, 0);                 break;
        case 6: ctx.transform( 0, 1, -1, 0, canvasH, 0);           break;
        case 7: ctx.transform( 0, -1, -1, 0, canvasH, canvasW);    break;
        case 8: ctx.transform( 0, -1, 1,  0, 0, canvasW);          break;
        default: break; // orientation 1: 변환 없음
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
      resolve(file); // 실패 시 원본 그대로 사용
    };

    img.src = url;
  });
}

export interface PhotoExifData {
  lat?: number;
  lng?: number;
  takenAt?: string; // ISO string
}

interface PhotoUploadProps {
  maxFiles?: number;
  onChange: (files: File[]) => void;
  onExifExtracted?: (exif: PhotoExifData) => void;
  /** Called for every photo that has GPS EXIF data (for multi-address selection) */
  onEachExif?: (exif: PhotoExifData, fileIndex: number) => void;
}

export default function PhotoUpload({ maxFiles = 5, onChange, onExifExtracted, onEachExif }: PhotoUploadProps) {
  const { t } = useTranslation();
  const [previews, setPreviews] = useState<{ id: string; url: string }[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const filesRef = useRef<File[]>([]);
  const exifDoneRef = useRef(false);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  // Camera modal state
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  function parseExif(file: File, fileIndex: number, isFirst: boolean) {
    void (async () => {
      try {
        const data = await exifr.parse(file, { gps: true, pick: ['DateTimeOriginal', 'CreateDate', 'GPSLatitude', 'GPSLongitude'] });
        if (!data) return;

        const exif: PhotoExifData = {};
        if (data.latitude != null && data.longitude != null) {
          exif.lat = data.latitude;
          exif.lng = data.longitude;
        }
        const dateVal = data.DateTimeOriginal ?? data.CreateDate;
        if (dateVal instanceof Date) {
          exif.takenAt = dateVal.toISOString();
        }

        // 첫 번째 사진: 시간 + GPS 좌표 자동 채우기
        if (isFirst && (exif.lat != null || exif.takenAt)) {
          onExifExtracted?.(exif);
        }

        // 모든 사진: GPS 있으면 주소 옵션 추가
        if (exif.lat != null && onEachExif) {
          onEachExif(exif, fileIndex);
        }
      } catch { /* silent */ }
    })();
  }

  /**
   * 압축이 완료된 파일 배열을 상태에 추가한다.
   * skipExif=true이면 EXIF 파싱을 건너뛴다 (handleFiles에서 원본 파일로 이미 처리했을 때).
   */
  function addFiles(added: File[], skipExif = false) {
    if (added.length === 0) return;

    const prevFiles = filesRef.current;
    const trimmed = added.slice(0, maxFiles - prevFiles.length);
    if (trimmed.length === 0) return;

    const updated = [...prevFiles, ...trimmed];
    filesRef.current = updated;
    setFiles(updated);
    onChange(updated);

    // EXIF 파싱: skipExif=false일 때만 (카메라 캡처 경로)
    if (!skipExif) {
      const isFirstBatch = !exifDoneRef.current && prevFiles.length === 0;
      if (isFirstBatch) exifDoneRef.current = true;

      trimmed.forEach((file, i) => {
        const fileIndex = prevFiles.length + i;
        parseExif(file, fileIndex, isFirstBatch && i === 0);
      });
    }

    // createObjectURL: 압축된 파일에서 즉시 blob URL 생성 (readAsDataURL 대비 메모리 절약)
    const newPreviews = trimmed.map((file) => ({
      id: `${file.name}_${file.size}_${Date.now()}_${Math.random()}`,
      url: URL.createObjectURL(file),
    }));
    setPreviews((prev) => [...prev, ...newPreviews]);
  }

  function handleFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    const rawArray = Array.from(newFiles);
    if (rawArray.length === 0) return;

    void (async () => {
      // 1) EXIF 파싱은 원본 파일에서 먼저 수행 (압축 전 메타데이터 보존)
      const prevFiles = filesRef.current;
      const trimmed = rawArray.slice(0, maxFiles - prevFiles.length);
      if (trimmed.length === 0) return;

      const isFirstBatch = !exifDoneRef.current && prevFiles.length === 0;
      if (isFirstBatch) exifDoneRef.current = true;

      trimmed.forEach((file, i) => {
        const fileIndex = prevFiles.length + i;
        parseExif(file, fileIndex, isFirstBatch && i === 0);
      });

      // 2) Canvas로 압축/리사이즈 (병렬)
      const compressed = await Promise.all(trimmed.map((f) => compressImage(f)));

      // 3) 압축된 파일로 addFiles 호출 (EXIF 파싱은 이미 완료됐으므로 건너뜀)
      addFiles(compressed, true);
    })();
  }

  function removePhoto(index: number) {
    const updated = filesRef.current.filter((_, i) => i !== index);
    filesRef.current = updated;
    setFiles(updated);
    onChange(updated);
    setPreviews((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.url);
      return prev.filter((_, i) => i !== index);
    });
  }

  // ── Camera modal ──
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      setCameraOpen(false);
      // 권한 거부가 아닌 경우에만 파일 선택으로 폴백
      if (err instanceof Error && err.name !== 'NotAllowedError') {
        galleryRef.current?.click();
      }
    }
  }, [stopCamera]);

  // FIX: 클린업에서 조건 제거 — 항상 스트림 종료
  useEffect(() => {
    if (cameraOpen) {
      void startCamera(facingMode);
    }
    return () => { stopCamera(); };
  }, [cameraOpen, facingMode, startCamera, stopCamera]);

  function handleCameraClick() {
    // getUserMedia 지원 여부로 판별 (모바일에서도 카메라 모달 가능하나 네이티브가 UX 더 좋음)
    const hasMediaDevices = !!navigator.mediaDevices?.getUserMedia;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isMobile || !hasMediaDevices) {
      mobileInputRef.current?.click();
    } else {
      setCameraOpen(true);
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const raw = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      // 카메라 캡처는 EXIF orientation이 없으므로 orientation=1(보정 없음)으로 압축만 적용
      void compressImage(raw).then((compressed) => {
        addFiles([compressed]);
        setCameraOpen(false);
        stopCamera();
      });
    }, 'image/jpeg', 0.92);
  }

  function closeCameraModal() {
    setCameraOpen(false);
    stopCamera();
  }

  function toggleFacing() {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  }

  const hasPhotos = previews.length > 0;

  return (
    <div>
      {/* 사진이 없을 때: 큰 버튼 두 개 */}
      {!hasPhotos && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleCameraClick}
            className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-primary-300 bg-primary-50 rounded-xl text-primary-600 hover:bg-primary-100 hover:border-primary-400 transition-colors"
          >
            <Camera className="w-8 h-8" />
            <span className="text-sm font-medium">{t('upload.takePhoto')}</span>
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-gray-300 bg-gray-50 rounded-xl text-gray-600 hover:bg-gray-100 hover:border-gray-400 transition-colors"
          >
            <ImagePlus className="w-8 h-8" />
            <span className="text-sm font-medium">{t('upload.fromGallery')}</span>
          </button>
        </div>
      )}

      {/* 사진이 있을 때: 미리보기 + 추가 버튼 */}
      {hasPhotos && (
        <div className="flex flex-wrap gap-3">
          {previews.map((p, i) => (
            <div key={p.id} className="relative w-24 h-24 rounded-lg overflow-hidden">
              <img src={p.url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="absolute top-1 right-1 bg-black/60 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center"
              >
                ✕
              </button>
            </div>
          ))}

          {files.length < maxFiles && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCameraClick}
                className="w-24 h-24 border-2 border-dashed border-primary-300 rounded-lg flex flex-col items-center justify-center text-primary-500 hover:bg-primary-50 transition-colors"
              >
                <Camera className="w-5 h-5" />
                <span className="text-[10px] mt-1">{t('upload.takePhoto')}</span>
              </button>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:bg-gray-50 transition-colors"
              >
                <ImagePlus className="w-5 h-5" />
                <span className="text-[10px] mt-1">{t('upload.fromGallery')}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mobile camera (native) */}
      <input
        ref={mobileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />
      {/* Gallery picker */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />

      <p className="text-xs text-gray-400 mt-2">
        {t('upload.limit', { max: maxFiles })}
      </p>

      {/* ── Camera Modal (데스크톱) ── */}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          {/* 상단 바 */}
          <div className="flex items-center justify-between px-4 py-3 bg-black/80">
            <button type="button" onClick={closeCameraModal} className="text-white p-1">
              <X className="w-6 h-6" />
            </button>
            <span className="text-white text-sm font-medium">{t('upload.takePhoto')}</span>
            <button type="button" onClick={toggleFacing} className="text-white p-1">
              <SwitchCamera className="w-6 h-6" />
            </button>
          </div>

          {/* 비디오 뷰파인더 */}
          <div className="flex-1 flex items-center justify-center bg-black overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="max-w-full max-h-full object-contain"
            />
          </div>

          {/* 셔터 버튼 */}
          <div className="flex items-center justify-center py-6 bg-black/80">
            <button
              type="button"
              onClick={capturePhoto}
              className="w-16 h-16 rounded-full border-4 border-white bg-white/20 hover:bg-white/40 transition-colors flex items-center justify-center"
            >
              <div className="w-12 h-12 rounded-full bg-white" />
            </button>
          </div>

          {/* 캡처용 hidden canvas */}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}
    </div>
  );
}
