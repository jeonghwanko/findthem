import { useState, useEffect, useCallback } from 'react';
import type { ExternalAgentAdmin } from '@findthem/shared';
import { adminApi } from '../../api/admin.js';

interface ExternalAgentListResponse {
  items: ExternalAgentAdmin[];
  total: number;
}

interface CreateAgentResponse {
  agent: ExternalAgentAdmin;
  apiKey: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function shortId(id: string) {
  return id.slice(0, 8);
}

export default function ExternalAgentsPage() {
  const [agents, setAgents] = useState<ExternalAgentAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // 신규 등록 모달
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createAvatarUrl, setCreateAvatarUrl] = useState('');
  const [createWebhookUrl, setCreateWebhookUrl] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // API 키 표시 모달
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [newAgentName, setNewAgentName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.get<ExternalAgentListResponse>('/admin/external-agents');
      setAgents(result.items);
      setTotal(result.total);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreateLoading(true);
    setCreateError(null);
    try {
      const result = await adminApi.post<CreateAgentResponse>('/admin/external-agents', {
        name: createName.trim(),
        description: createDescription.trim() || null,
        avatarUrl: createAvatarUrl.trim() || null,
        webhookUrl: createWebhookUrl.trim() || null,
      });
      setAgents((prev) => [result.agent, ...prev]);
      setTotal((prev) => prev + 1);
      setShowCreateModal(false);
      setCreateName('');
      setCreateDescription('');
      setCreateAvatarUrl('');
      setCreateWebhookUrl('');
      // API 키 표시 모달 열기
      setNewApiKey(result.apiKey);
      setNewAgentName(result.agent.name);
      setCopied(false);
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : '등록 실패');
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleToggleActive(agent: ExternalAgentAdmin) {
    const action = agent.isActive ? '비활성화' : '활성화';
    if (!window.confirm(`"${agent.name}"을(를) ${action}하시겠습니까?`)) return;
    setActionLoading(agent.id);
    try {
      const updated = await adminApi.patch<ExternalAgentAdmin>(
        `/admin/external-agents/${agent.id}`,
        { isActive: !agent.isActive },
      );
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? updated : a)));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '처리 실패');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(agent: ExternalAgentAdmin) {
    if (!window.confirm(`"${agent.name}"을(를) 삭제하시겠습니까?\n삭제하면 해당 API 키는 즉시 무효화됩니다.`)) return;
    setActionLoading(agent.id);
    try {
      await adminApi.delete<unknown>(`/admin/external-agents/${agent.id}`);
      setAgents((prev) => prev.filter((a) => a.id !== agent.id));
      setTotal((prev) => prev - 1);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCopyKey() {
    if (!newApiKey) return;
    try {
      await navigator.clipboard.writeText(newApiKey);
      setCopied(true);
    } catch {
      // clipboard API 실패 시 무시
    }
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="flex flex-wrap gap-2 items-center justify-between mb-5">
        <div>
          <h1 className="text-lg lg:text-xl font-bold text-gray-900">외부 에이전트 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">전체 {total}개</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { void fetchAgents(); }}
            disabled={loading}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? '로딩 중...' : '새로고침'}
          </button>
          <button
            onClick={() => {
              setShowCreateModal(true);
              setCreateError(null);
            }}
            className="bg-indigo-600 text-white rounded px-4 py-1.5 text-sm hover:bg-indigo-700 font-medium"
          >
            + 신규 등록
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* 테이블 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[600px]">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-3 font-medium text-gray-600 border-b">ID</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">이름</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">설명</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b text-center">상태</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">등록일</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">마지막 사용</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">Webhook</th>
              <th className="px-4 py-3 font-medium text-gray-600 border-b">액션</th>
            </tr>
          </thead>
          <tbody>
            {loading && agents.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-gray-400">
                  데이터를 불러오는 중...
                </td>
              </tr>
            ) : agents.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-gray-400">
                  등록된 외부 에이전트가 없습니다.
                </td>
              </tr>
            ) : (
              agents.map((agent) => (
                <tr key={agent.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-500 text-xs">
                    {shortId(agent.id)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {agent.avatarUrl ? (
                        <img
                          src={agent.avatarUrl}
                          alt={agent.name}
                          className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-xs text-gray-500">
                          {agent.name.charAt(0)}
                        </div>
                      )}
                      <span className="font-medium text-gray-900">{agent.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">
                    {agent.description ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {agent.isActive ? (
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">
                        활성
                      </span>
                    ) : (
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500">
                        비활성
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(agent.createdAt)}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {agent.lastUsedAt ? formatDate(agent.lastUsedAt) : '-'}
                  </td>
                  <td className="px-4 py-3 text-xs max-w-[180px] truncate">
                    {agent.webhookUrl ? (
                      <span className="text-green-600" title={agent.webhookUrl}>설정됨</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => { void handleToggleActive(agent); }}
                        disabled={actionLoading === agent.id}
                        className={`rounded px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
                          agent.isActive
                            ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}
                      >
                        {actionLoading === agent.id
                          ? '처리 중...'
                          : agent.isActive
                          ? '비활성화'
                          : '활성화'}
                      </button>
                      <button
                        onClick={() => { void handleDelete(agent); }}
                        disabled={actionLoading === agent.id}
                        className="rounded px-2.5 py-1 text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* 신규 등록 모달 */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">외부 에이전트 신규 등록</h2>
            <form onSubmit={(e) => { void handleCreate(e); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  이름 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="에이전트 이름"
                  required
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
                <input
                  type="text"
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="에이전트 설명 (선택)"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">아바타 URL</label>
                <input
                  type="url"
                  value={createAvatarUrl}
                  onChange={(e) => setCreateAvatarUrl(e.target.value)}
                  placeholder="https://... (선택)"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL</label>
                <input
                  type="url"
                  value={createWebhookUrl}
                  onChange={(e) => setCreateWebhookUrl(e.target.value)}
                  placeholder="https://your-agent.example.com/webhook (선택)"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">새 질문/댓글 발생 시 이 URL로 알림을 보냅니다.</p>
              </div>

              {createError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2 text-sm">
                  {createError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="border rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={createLoading || !createName.trim()}
                  className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {createLoading ? '등록 중...' : '등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* API 키 표시 모달 */}
      {newApiKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">API 키 발급 완료</h2>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-medium text-gray-700">{newAgentName}</span> 에이전트가 등록되었습니다.
            </p>

            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
              <p className="text-sm text-amber-800 font-medium">
                이 API 키는 지금만 확인할 수 있습니다. 반드시 복사하여 안전한 곳에 저장하세요.
              </p>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <code className="flex-1 bg-gray-100 rounded px-3 py-2.5 text-xs font-mono text-gray-800 break-all select-all">
                {newApiKey}
              </code>
              <button
                onClick={() => { void handleCopyKey(); }}
                className={`flex-shrink-0 px-3 py-2.5 rounded text-sm font-medium transition-colors ${
                  copied
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {copied ? '복사됨' : '복사'}
              </button>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setNewApiKey(null)}
                className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700"
              >
                확인했습니다
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
