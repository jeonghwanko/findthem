import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface PhotoUploadProps {
  maxFiles?: number;
  onChange: (files: File[]) => void;
}

export default function PhotoUpload({ maxFiles = 5, onChange }: PhotoUploadProps) {
  const { t } = useTranslation();
  const [previews, setPreviews] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    const added = Array.from(newFiles).slice(0, maxFiles - files.length);
    if (added.length === 0) return;

    const updated = [...files, ...added];
    setFiles(updated);
    onChange(updated);

    added.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviews((prev) => [...prev, e.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  }

  function removePhoto(index: number) {
    const updated = files.filter((_, i) => i !== index);
    setFiles(updated);
    onChange(updated);
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {previews.map((src, i) => (
          <div key={i} className="relative w-24 h-24 rounded-lg overflow-hidden">
            <img src={src} alt="" className="w-full h-full object-cover" />
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
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-primary-400 hover:text-primary-500 transition-colors"
          >
            <span className="text-2xl">+</span>
            <span className="text-xs mt-1">{t('upload.addPhoto')}</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <p className="text-xs text-gray-400 mt-2">
        {t('upload.limit', { max: maxFiles })}
      </p>
    </div>
  );
}
