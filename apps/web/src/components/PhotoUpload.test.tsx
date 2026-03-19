import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import PhotoUpload from './PhotoUpload';
import type { PhotoExifData } from './PhotoUpload';

// exifr mock
vi.mock('exifr', () => ({
  default: {
    parse: vi.fn(),
  },
}));

import exifr from 'exifr';

function createFile(name = 'photo.jpg', size = 1024): File {
  const buf = new ArrayBuffer(size);
  return new File([buf], name, { type: 'image/jpeg' });
}

// URL.createObjectURL / revokeObjectURL mock
const createObjectURLMock = vi.fn(() => 'blob:mock-url');
const revokeObjectURLMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.URL.createObjectURL = createObjectURLMock;
  globalThis.URL.revokeObjectURL = revokeObjectURLMock;
});

describe('PhotoUpload', () => {
  it('초기 상태에서 직접 촬영 / 갤러리 버튼이 보인다', () => {
    render(<PhotoUpload onChange={vi.fn()} />);
    expect(screen.getByText('직접 촬영')).toBeInTheDocument();
    expect(screen.getByText('갤러리에서 선택')).toBeInTheDocument();
  });

  it('파일 추가 시 onChange에 파일 배열이 전달된다', () => {
    const onChange = vi.fn();
    render(<PhotoUpload onChange={onChange} />);

    const input = document.querySelector('input[multiple]') as HTMLInputElement;
    const file = createFile();
    fireEvent.change(input, { target: { files: [file] } });

    expect(onChange).toHaveBeenCalledWith([file]);
  });

  it('미리보기에 createObjectURL을 사용한다 (readAsDataURL 아님)', () => {
    const onChange = vi.fn();
    render(<PhotoUpload onChange={onChange} />);

    const input = document.querySelector('input[multiple]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [createFile()] } });

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
  });

  it('maxFiles 이상 파일을 추가할 수 없다', () => {
    const onChange = vi.fn();
    render(<PhotoUpload maxFiles={2} onChange={onChange} />);

    const input = document.querySelector('input[multiple]') as HTMLInputElement;
    const files = [createFile('a.jpg'), createFile('b.jpg'), createFile('c.jpg')];
    fireEvent.change(input, { target: { files } });

    // 2개만 전달됨
    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([files[0], files[1]]));
    expect(onChange.mock.calls[0][0]).toHaveLength(2);
  });

  it('사진 삭제 시 revokeObjectURL이 호출된다', () => {
    const onChange = vi.fn();
    render(<PhotoUpload onChange={onChange} />);

    const input = document.querySelector('input[multiple]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [createFile()] } });

    // 삭제 버튼 (✕) 클릭
    const removeBtn = screen.getByText('✕');
    fireEvent.click(removeBtn);

    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
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
      // exifr.parse가 비동기이므로 flush
      await vi.waitFor(() => expect(onExifExtracted).toHaveBeenCalled());
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
      .mockResolvedValueOnce(null); // 세 번째 사진 GPS 없음

    render(<PhotoUpload onChange={vi.fn()} onEachExif={onEachExif} />);

    const input = document.querySelector('input[multiple]') as HTMLInputElement;
    const files = [createFile('a.jpg'), createFile('b.jpg'), createFile('c.jpg')];
    await act(async () => {
      fireEvent.change(input, { target: { files } });
      await vi.waitFor(() => expect(onEachExif).toHaveBeenCalledTimes(2));
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
      await vi.waitFor(() => expect(exifr.parse).toHaveBeenCalled());
    });

    // exifr.parse는 1회만 호출 (이전에는 extractExif + onEachExif 루프로 2회 호출됨)
    expect(exifr.parse).toHaveBeenCalledTimes(1);
    expect(onExifExtracted).toHaveBeenCalledTimes(1);
    expect(onEachExif).toHaveBeenCalledTimes(1);
  });

  it('exifr.parse 실패 시 에러 없이 조용히 넘어간다', async () => {
    vi.mocked(exifr.parse).mockRejectedValueOnce(new Error('corrupt file'));

    const onExifExtracted = vi.fn();
    render(<PhotoUpload onChange={vi.fn()} onExifExtracted={onExifExtracted} />);

    const input = document.querySelector('input[multiple]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [createFile()] } });
      // 에러가 발생해도 throw 안 됨
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(onExifExtracted).not.toHaveBeenCalled();
  });
});
