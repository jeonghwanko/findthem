import { useRef, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, ImagePlus, X, SwitchCamera } from 'lucide-react';
import exifr from 'exifr';

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

  function addFiles(added: File[]) {
    if (added.length === 0) return;

    const prevFiles = filesRef.current;
    const trimmed = added.slice(0, maxFiles - prevFiles.length);
    if (trimmed.length === 0) return;

    const updated = [...prevFiles, ...trimmed];
    filesRef.current = updated;
    setFiles(updated);
    onChange(updated);

    // EXIF: 1회 파싱으로 onExifExtracted + onEachExif 모두 처리
    const isFirstBatch = !exifDoneRef.current && prevFiles.length === 0;
    if (isFirstBatch) exifDoneRef.current = true;

    trimmed.forEach((file, i) => {
      const fileIndex = prevFiles.length + i;
      parseExif(file, fileIndex, isFirstBatch && i === 0);
    });

    // createObjectURL: 파일을 읽지 않고 즉시 blob URL 생성 (readAsDataURL 대비 메모리 절약)
    const newPreviews = trimmed.map((file) => ({
      id: `${file.name}_${file.size}_${Date.now()}_${Math.random()}`,
      url: URL.createObjectURL(file),
    }));
    setPreviews((prev) => [...prev, ...newPreviews]);
  }

  function handleFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    addFiles(Array.from(newFiles));
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
      const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      addFiles([file]);
      setCameraOpen(false);
      stopCamera();
    }, 'image/jpeg', 0.9);
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
