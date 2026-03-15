import { useState } from 'react';
import { devlogApi } from '../../api/admin';
import type {
  DevlogPreviewRequest,
  DevlogPreviewResponse,
  DevlogGenerateResponse,
} from '../../api/admin';

const COMMIT_COUNT_OPTIONS = Array.from({ length: 20 }, (_, i) => i + 1);

export default function DevlogPage() {
  const [context, setContext] = useState('');
  const [commitCount, setCommitCount] = useState(5);
  const [publishStatus, setPublishStatus] = useState<'draft' | 'published'>('draft');

  const [previewing, setPreviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<DevlogPreviewResponse | null>(null);
  const [ghostResult, setGhostResult] = useState<DevlogGenerateResponse | null>(null);

  function buildRequest(): DevlogPreviewRequest {
    return {
      context: context.trim(),
      commitCount,
      publishStatus,
    };
  }

  async function handlePreview() {
    if (!context.trim()) {
      setError('작업 내용을 입력해 주세요.');
      return;
    }
    setError(null);
    setPreview(null);
    setGhostResult(null);
    setPreviewing(true);
    try {
      const result = await devlogApi.preview(buildRequest());
      setPreview(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '미리보기 생성 실패');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleGenerate() {
    if (!context.trim()) {
      setError('작업 내용을 입력해 주세요.');
      return;
    }
    setError(null);
    setGhostResult(null);
    setPublishing(true);
    try {
      const result = await devlogApi.generate(buildRequest());
      setPreview(result);
      setGhostResult(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ghost 게시 실패');
    } finally {
      setPublishing(false);
    }
  }

  const isLoading = previewing || publishing;

  return (
    <div className="flex flex-col h-full">
      {/* 페이지 헤더 */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900">데브로그 생성</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          커밋 히스토리와 작업 내용을 바탕으로 AI가 개발 블로그 글을 작성합니다.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col lg:flex-row gap-6">
          {/* 왼쪽: 입력 폼 */}
          <div className="lg:w-80 flex-shrink-0 space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                입력 설정
              </h2>

              {/* context */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  작업 내용 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="작업 의도 / 오늘 한 일을 자유롭게 작성하세요&#10;&#10;예) 홈 화면 필터 기능 추가, 카카오 챗봇 버그 수정, DB 스키마 리팩토링 등"
                  disabled={isLoading}
                  rows={6}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-y disabled:opacity-50 min-h-[120px]"
                />
              </div>

              {/* commitCount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  최근 커밋 수
                </label>
                <select
                  value={commitCount}
                  onChange={(e) => setCommitCount(Number(e.target.value))}
                  disabled={isLoading}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:opacity-50"
                >
                  {COMMIT_COUNT_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}개
                    </option>
                  ))}
                </select>
              </div>

              {/* publishStatus */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  게시 상태
                </label>
                <select
                  value={publishStatus}
                  onChange={(e) =>
                    setPublishStatus(e.target.value as 'draft' | 'published')
                  }
                  disabled={isLoading}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:opacity-50"
                >
                  <option value="draft">Draft (임시 저장)</option>
                  <option value="published">Published (바로 게시)</option>
                </select>
              </div>

              {/* 버튼 */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={() => { void handlePreview(); }}
                  disabled={isLoading || !context.trim()}
                  className="w-full border border-indigo-600 text-indigo-600 rounded-md px-4 py-2 text-sm font-medium hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {previewing ? (
                    <span className="flex items-center justify-center gap-2">
                      <SpinnerIcon />
                      생성 중...
                    </span>
                  ) : (
                    '미리보기'
                  )}
                </button>

                <button
                  onClick={() => { void handleGenerate(); }}
                  disabled={isLoading || !context.trim()}
                  className="w-full bg-indigo-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {publishing ? (
                    <span className="flex items-center justify-center gap-2">
                      <SpinnerIcon />
                      게시 중...
                    </span>
                  ) : (
                    'Ghost에 게시'
                  )}
                </button>
              </div>

              {/* 로딩 안내 */}
              {isLoading && (
                <p className="text-xs text-gray-500 text-center">
                  AI가 글을 작성하는 중입니다 (10~30초 소요)
                </p>
              )}
            </div>
          </div>

          {/* 오른쪽: 결과 영역 */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* 에러 */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">
                {error}
              </div>
            )}

            {/* Ghost 게시 성공 */}
            {ghostResult && (
              <div className="bg-green-50 border border-green-200 rounded-md px-4 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-green-800">Ghost 게시 완료</p>
                  <p className="text-xs text-green-600 mt-0.5 font-mono">
                    Post ID: {ghostResult.ghostPostId}
                  </p>
                </div>
                <a
                  href={ghostResult.ghostUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 bg-green-700 text-white rounded px-3 py-1.5 text-xs font-medium hover:bg-green-800 transition-colors"
                >
                  게시물 보기
                </a>
              </div>
            )}

            {/* 빈 상태 */}
            {!preview && !isLoading && !error && (
              <div className="bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center py-20 text-gray-400">
                <div className="text-5xl mb-4">✍️</div>
                <p className="text-sm">왼쪽에서 작업 내용을 입력하고 미리보기를 눌러보세요.</p>
              </div>
            )}

            {/* 로딩 중 스켈레톤 */}
            {isLoading && !preview && (
              <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-2/3" />
                <div className="h-3 bg-gray-100 rounded w-1/3" />
                <div className="space-y-2 pt-2">
                  <div className="h-3 bg-gray-100 rounded" />
                  <div className="h-3 bg-gray-100 rounded w-5/6" />
                  <div className="h-3 bg-gray-100 rounded w-4/6" />
                </div>
              </div>
            )}

            {/* 미리보기 결과 */}
            {preview && (
              <>
                {/* 제목 + 메타 */}
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <h2 className="text-xl font-bold text-gray-900 mb-3">{preview.title}</h2>

                  {/* diff 통계 */}
                  {preview.diffStats && (
                    <div className="mb-4">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                        Diff 통계
                      </p>
                      <pre className="text-xs font-mono text-gray-600 bg-gray-50 border border-gray-200 rounded px-3 py-2 overflow-x-auto whitespace-pre-wrap">
                        {preview.diffStats}
                      </pre>
                    </div>
                  )}

                  {/* 커밋 목록 */}
                  {preview.commitsSummary.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                        포함된 커밋 ({preview.commitsSummary.length}개)
                      </p>
                      <ul className="space-y-1">
                        {preview.commitsSummary.map((commit) => (
                          <li
                            key={commit.sha}
                            className="flex items-start gap-2 text-sm"
                          >
                            <span className="flex-shrink-0 font-mono text-xs text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5 mt-0.5">
                              {commit.sha.slice(0, 6)}
                            </span>
                            <span className="text-gray-700 leading-snug">{commit.message}</span>
                            <span className="flex-shrink-0 text-xs text-gray-400 mt-0.5 ml-auto pl-2">
                              {new Date(commit.date).toLocaleDateString('ko-KR')}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* 생성된 글 본문 */}
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">
                    생성된 글
                  </p>
                  <div
                    className="prose prose-sm max-w-none text-gray-800 prose-headings:text-gray-900 prose-code:text-indigo-700 prose-code:bg-indigo-50 prose-code:rounded prose-code:px-1 prose-pre:bg-gray-900 prose-pre:text-gray-100"
                    dangerouslySetInnerHTML={{ __html: preview.html }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="w-4 h-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
