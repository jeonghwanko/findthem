import { useState, useEffect, useCallback, useRef } from 'react';
import DOMPurify from 'dompurify';
import { type GhostPostListItem } from '@findthem/shared';
import {
  devlogApi,
  type DevlogPreviewRequest,
  type DevlogPreviewResponse,
  type DevlogGenerateResponse,
} from '../../api/admin';

type Tab = 'generate' | 'list';

const COMMIT_COUNT_OPTIONS = Array.from({ length: 20 }, (_, i) => i + 1);

export default function DevlogPage() {
  const [tab, setTab] = useState<Tab>('generate');

  return (
    <div className="flex flex-col h-full">
      {/* 페이지 헤더 */}
      <div className="bg-white border-b border-gray-200 px-4 lg:px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900">데브로그</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          커밋 히스토리와 작업 내용을 바탕으로 AI가 개발 블로그 글을 작성합니다.
        </p>
        {/* 탭 */}
        <div className="flex gap-4 mt-3 border-b border-gray-100 -mb-4">
          <TabButton active={tab === 'generate'} onClick={() => setTab('generate')}>
            글 생성
          </TabButton>
          <TabButton active={tab === 'list'} onClick={() => setTab('list')}>
            게시물 목록
          </TabButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'generate' ? <GenerateTab /> : <ListTab />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-indigo-600 text-indigo-600'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

/* ────────────────────────────────────────── GenerateTab ── */

function GenerateTab() {
  const [context, setContext] = useState('');
  const [commitCount, setCommitCount] = useState(5);
  const [publishStatus, setPublishStatus] = useState<'draft' | 'published'>('published');

  const [previewing, setPreviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<DevlogPreviewResponse | null>(null);
  const [ghostResult, setGhostResult] = useState<DevlogGenerateResponse | null>(null);

  const isGeneratingRef = useRef(false);
  const isPreviewingRef = useRef(false);

  function buildRequest(): DevlogPreviewRequest {
    return { context: context.trim(), commitCount, publishStatus };
  }

  async function handlePreview() {
    if (isPreviewingRef.current) return;
    if (!context.trim()) { setError('작업 내용을 입력해 주세요.'); return; }
    isPreviewingRef.current = true;
    setError(null); setPreview(null); setGhostResult(null); setPreviewing(true);
    try {
      setPreview(await devlogApi.preview(buildRequest()));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '미리보기 생성 실패');
    } finally {
      setPreviewing(false);
      isPreviewingRef.current = false;
    }
  }

  async function handleGenerate() {
    if (isGeneratingRef.current) return;
    if (!context.trim()) { setError('작업 내용을 입력해 주세요.'); return; }
    isGeneratingRef.current = true;
    setError(null); setGhostResult(null); setPublishing(true);
    try {
      const result = await devlogApi.generate(buildRequest());
      setPreview(result);
      setGhostResult(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ghost 게시 실패');
    } finally {
      setPublishing(false);
      isGeneratingRef.current = false;
    }
  }

  const isLoading = previewing || publishing;

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6 flex flex-col lg:flex-row gap-6">
      {/* 왼쪽: 입력 폼 */}
      <div className="lg:w-80 flex-shrink-0 space-y-4">
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">입력 설정</h2>

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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">최근 커밋 수</label>
            <select
              value={commitCount}
              onChange={(e) => setCommitCount(Number(e.target.value))}
              disabled={isLoading}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:opacity-50"
            >
              {COMMIT_COUNT_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}개</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">게시 상태</label>
            <select
              value={publishStatus}
              onChange={(e) => setPublishStatus(e.target.value as 'draft' | 'published')}
              disabled={isLoading}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:opacity-50"
            >
              <option value="draft">Draft (임시 저장)</option>
              <option value="published">Published (바로 게시)</option>
            </select>
          </div>

          <div className="space-y-2 pt-1">
            <button
              onClick={() => { void handlePreview(); }}
              disabled={isLoading || !context.trim()}
              className="w-full border border-indigo-600 text-indigo-600 rounded-md px-4 py-2 text-sm font-medium hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {previewing ? <LoadingLabel text="생성 중..." /> : '미리보기'}
            </button>

            <button
              onClick={() => { void handleGenerate(); }}
              disabled={isLoading || !context.trim()}
              className="w-full bg-indigo-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {publishing ? <LoadingLabel text="게시 중..." /> : 'Ghost에 게시'}
            </button>
          </div>

          {isLoading && (
            <p className="text-xs text-gray-500 text-center">AI가 글을 작성하는 중입니다 (10~30초 소요)</p>
          )}
        </div>
      </div>

      {/* 오른쪽: 결과 영역 */}
      <div className="flex-1 min-w-0 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">{error}</div>
        )}

        {ghostResult && (
          <div className="bg-green-50 border border-green-200 rounded-md px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-green-800">Ghost 게시 완료</p>
              <p className="text-xs text-green-600 mt-0.5 font-mono">Post ID: {ghostResult.ghostPostId}</p>
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

        {!preview && !isLoading && !error && (
          <div className="bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center py-20 text-gray-400">
            <div className="text-5xl mb-4">✍️</div>
            <p className="text-sm">왼쪽에서 작업 내용을 입력하고 미리보기를 눌러보세요.</p>
          </div>
        )}

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

        {preview && (
          <>
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h2 className="text-xl font-bold text-gray-900 mb-3">{preview.title}</h2>
              {preview.diffStats && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Diff 통계</p>
                  <pre className="text-xs font-mono text-gray-600 bg-gray-50 border border-gray-200 rounded px-3 py-2 overflow-x-auto whitespace-pre-wrap">
                    {preview.diffStats}
                  </pre>
                </div>
              )}
              {preview.commitsSummary.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    포함된 커밋 ({preview.commitsSummary.length}개)
                  </p>
                  <ul className="space-y-1">
                    {preview.commitsSummary.map((commit) => (
                      <li key={commit.sha} className="flex items-start gap-2 text-sm">
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

            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">생성된 글</p>
              <div
                className="prose prose-sm max-w-none text-gray-800 prose-headings:text-gray-900 prose-code:text-indigo-700 prose-code:bg-indigo-50 prose-code:rounded prose-code:px-1 prose-pre:bg-gray-900 prose-pre:text-gray-100"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(preview.html) }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────── ListTab ── */

function ListTab() {
  const [posts, setPosts] = useState<GhostPostListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [applyingSettings, setApplyingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const isApplyingRef = useRef(false);

  async function handleApplySettings() {
    if (isApplyingRef.current) return;
    isApplyingRef.current = true;
    setApplyingSettings(true);
    setSettingsMsg(null);
    try {
      await devlogApi.applySiteSettings();
      setSettingsMsg({ ok: true, text: '사이트 설정이 적용되었습니다.' });
      setTimeout(() => setSettingsMsg(null), 4000);
    } catch (e: unknown) {
      setSettingsMsg({ ok: false, text: e instanceof Error ? e.message : '설정 적용 실패' });
    } finally {
      setApplyingSettings(false);
      isApplyingRef.current = false;
    }
  }

  const fetchList = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await devlogApi.list(p, 15);
      setPosts(result.posts);
      setTotalPages(result.meta.pagination.pages);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '목록 조회 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchList(page); }, [fetchList, page]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await devlogApi.delete(id);
      setConfirmId(null);
      await fetchList(page);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 py-6 space-y-4">
      {/* 사이트 설정 패널 */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-800">Ghost 사이트 설정</p>
          <p className="text-xs text-gray-500 mt-0.5">
            네비게이션(Home / About / Sign in) 및 구독 버튼 제거를 Ghost에 반영합니다.
          </p>
          {settingsMsg && (
            <p className={`text-xs mt-1 font-medium ${settingsMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
              {settingsMsg.text}
            </p>
          )}
        </div>
        <button
          onClick={() => { void handleApplySettings(); }}
          disabled={applyingSettings}
          className="flex-shrink-0 bg-gray-800 text-white rounded-md px-3 py-1.5 text-xs font-medium hover:bg-gray-900 disabled:opacity-50 transition-colors"
        >
          {applyingSettings ? '적용 중...' : '설정 적용'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center py-20 text-gray-400">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-sm">게시물이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div key={post.id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded ${
                      post.status === 'published'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {post.status === 'published' ? '게시됨' : '임시저장'}
                  </span>
                  <span className="text-xs text-gray-400">
                    {post.published_at
                      ? new Date(post.published_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
                      : new Date(post.updated_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-gray-900 hover:text-indigo-600 truncate block"
                >
                  {post.title}
                </a>
                {post.excerpt && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{post.excerpt}</p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  보기
                </a>

                {confirmId === post.id ? (
                  <>
                    <button
                      onClick={() => { void handleDelete(post.id); }}
                      disabled={deletingId === post.id}
                      className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 disabled:opacity-50"
                    >
                      {deletingId === post.id ? '삭제 중...' : '확인'}
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      취소
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmId(post.id)}
                    className="text-xs text-red-500 hover:text-red-700 font-medium"
                  >
                    삭제
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
          >
            이전
          </button>
          <span className="text-sm text-gray-600">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}

function LoadingLabel({ text }: { text: string }) {
  return (
    <span className="flex items-center justify-center gap-2">
      <SpinnerIcon />
      {text}
    </span>
  );
}

function SpinnerIcon() {
  return (
    <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
