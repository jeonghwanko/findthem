// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import PhotoUpload from './PhotoUpload';

// compressImage mock — Canvas가 jsdom에 없으므로 원본 파일을 그대로 반환
vi.mock('../utils/compressImage', () => ({
  compressImage: vi.fn((file: File) => Promise.resolve(file)),
}));

// exifr mock
vi.mock('exifr', () => ({
  default: {
    parse: vi.fn().mockResolvedValue(null),
  },
}));


import exifr from 'exifr';
import { compressImage } from '../utils/compressImage';

function createFile(name = 'photo.jpg', size = 1024): File {
  const buf = new ArrayBuffer(size);
  return new File([buf], name, { type: 'image/jpeg' });
}

async function addFileAndWait(input: HTMLInputElement, files: File[], onChange: ReturnType<typeof vi.fn>) {
  await act(async () => {
    fireEvent.change(input, { target: { files } });
    await waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 2000 });
  });
}

describe('PhotoUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    globalThis.URL.revokeObjectURL = vi.fn();
    // vi.mock의 factory는 clearAllMocks에 의해 구현이 지워지므로 재설정
    vi.mocked(compressImage).mockImplementation((file: File) => Promise.resolve(file));
    vi.mocked(exifr.parse).mockResolvedValue(null);
  });

  it('초기 상태에서 직접 촬영 / 갤러리 버튼이 보인다', () => {
    render(<PhotoUpload onChange={vi.fn()} />);
    expect(screen.getByText('직접 촬영')).toBeInTheDocument();
    expect(screen.getByText('갤러리에서 선택')).toBeInTheDocument();
  });

  it('파일 추가 시 onChange에 파일 배열이 전달된다', async () => {
    const onChange = vi.fn();
    render(<PhotoUpload onChange={onChange} />);
    const input = document.querySelector('input[multiple]') as HTMLInputElement;

    await addFileAndWait(input, [createFile()], onChange);

    expect(onChange.mock.calls[0][0]).toHaveLength(1);
  });

  it('미리보기에 createObjectURL을 사용한다 (readAsDataURL 아님)', async () => {
    const onChange = vi.fn();
    render(<PhotoUpload onChange={onChange} />);
    const input = document.querySelector('input[multiple]') as HTMLInputElement;

    await addFileAndWait(input, [createFile()], onChange);

    expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
  });

  it('maxFiles 이상 파일을 추가할 수 없다', async () => {
    const onChange = vi.fn();
    render(<PhotoUpload maxFiles={2} onChange={onChange} />);
    const input = document.querySelector('input[multiple]') as HTMLInputElement;

    const files = [createFile('a.jpg'), createFile('b.jpg'), createFile('c.jpg')];
    await addFileAndWait(input, files, onChange);

    expect(onChange.mock.calls[0][0]).toHaveLength(2);
  });

  it('사진 삭제 시 revokeObjectURL이 호출된다', async () => {
    const onChange = vi.fn();
    render(<PhotoUpload onChange={onChange} />);
    const input = document.querySelector('input[multiple]') as HTMLInputElement;

    await addFileAndWait(input, [createFile()], onChange);

    // ✕ 텍스트로 삭제 버튼 찾기
    const removeBtn = screen.getByText('✕');
    fireEvent.click(removeBtn);

    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('첫 번째 사진에서 EXIF 추출하여 onExifExtracted를 호출한다', async () => {
    const onExifExtracted = vi.fn();
    const mockExif = { latitude: 37.5, longitude: 127.0, DateTimeOriginal: new Date('2026-03-16T11:24:00') };
    vi.mocked(exifr.parse).mockResolvedValueOnce(mockExif);

    render(<PhotoUpload onChange={vi.fn()} onExifExtracted={onExifExtracted} />);
    const input = document.querySelector('input[multiple]') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, { target: { files: [createFile()] } });
      await waitFor(() => expect(onExifExtracted).toHaveBeenCalled(), { timeout: 2000 });
    });

    expect(onExifExtracted).toHaveBeenCalledWith({
      lat: 37.5,
      lng: 127.0,
      takenAt: expect.any(String),
    });
  });

  it('onEachExif는 GPS가 있는 모든 사진에 대해 호출된다', async () => {
    const onEachExif = vi.fn();
    vi.mocked(exifr.parse)
      .mockResolvedValueOnce({ latitude: 37.5, longitude: 127.0 })
      .mockResolvedValueOnce({ latitude: 35.1, longitude: 129.0 })
      .mockResolvedValueOnce(null);

    render(<PhotoUpload onChange={vi.fn()} onEachExif={onEachExif} />);
    const input = document.querySelector('input[multiple]') as HTMLInputElement;

    const files = [createFile('a.jpg'), createFile('b.jpg'), createFile('c.jpg')];
    await act(async () => {
      fireEvent.change(input, { target: { files } });
      await waitFor(() => expect(onEachExif).toHaveBeenCalledTimes(2), { timeout: 2000 });
    });

    expect(onEachExif).toHaveBeenCalledWith({ lat: 37.5, lng: 127.0 }, 0);
    expect(onEachExif).toHaveBeenCalledWith({ lat: 35.1, lng: 129.0 }, 1);
  });

  it('첫 번째 사진에서 EXIF가 한 번만 파싱된다 (중복 방지)', async () => {
    const onExifExtracted = vi.fn();
    const onEachExif = vi.fn();
    vi.mocked(exifr.parse).mockResolvedValue({ latitude: 37.5, longitude: 127.0 });

    render(<PhotoUpload onChange={vi.fn()} onExifExtracted={onExifExtracted} onEachExif={onEachExif} />);
    const input = document.querySelector('input[multiple]') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, { target: { files: [createFile()] } });
      await waitFor(() => expect(onExifExtracted).toHaveBeenCalled(), { timeout: 2000 });
    });

    // parseExif에서 1회만 호출
    expect(onExifExtracted).toHaveBeenCalledTimes(1);
    expect(onEachExif).toHaveBeenCalledTimes(1);
  });

  it('exifr.parse 실패 시 에러 없이 조용히 넘어간다', async () => {
    vi.mocked(exifr.parse).mockRejectedValue(new Error('corrupt file'));

    const onExifExtracted = vi.fn();
    const onChange = vi.fn();
    render(<PhotoUpload onChange={onChange} onExifExtracted={onExifExtracted} />);
    const input = document.querySelector('input[multiple]') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, { target: { files: [createFile()] } });
      await waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 2000 });
    });

    expect(onExifExtracted).not.toHaveBeenCalled();
  });
});
