import { useState } from 'react';
import { useAdminData } from '../../hooks/useAdminApi.js';
import { adminApi } from '../../api/admin.js';

// ── 상수 ───────────────────────────────────────────────────────────────

const AGENT_LIST = [
  { id: 'image-matching', name: '탐정 클로드', icon: '🔍' },
  { id: 'promotion', name: '홍보왕 헤르미', icon: '📢' },
  { id: 'chatbot', name: '안내봇 알리', icon: '💬' },
  { id: 'outreach', name: '아웃리치', icon: '📬' },
  { id: 'crawl', name: '데이터 수집', icon: '🕷️' },
  { id: 'admin', name: '관리자 에이전트', icon: '🛡️' },
  { id: 'devlog', name: '데브로그', icon: '📝' },
  { id: 'social-parsing', name: '소셜 파싱', icon: '📱' },
];

// ── 타입 ───────────────────────────────────────────────────────────────

interface ProviderInfo {
  name: string;
  configured: boolean;
  models: string[];
}

interface AiSettingsResponse {
  defaultProvider: string;
  defaultModel: string;
  agents: Record<string, { provider: string | null; model: string | null }>;
  availableProviders: ProviderInfo[];
}

interface UsageSummaryResponse {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgLatencyMs: number;
  successRate: number;
  byAgent: Record<string, { calls: number; tokens: number }>;
  byProvider: Record<string, { calls: number; tokens: number }>;
}

// ── 유틸 ───────────────────────────────────────────────────────────────

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function fmtLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}초`;
  return `${ms}ms`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// ── 프로바이더 설정 탭 ──────────────────────────────────────────────────

interface SettingsTabProps {
  settings: AiSettingsResponse;
  onSaved: () => void;
}

function SettingsTab({ settings, onSaved }: SettingsTabProps) {
  const { availableProviders } = settings;

  const [defaultProvider, setDefaultProvider] = useState(settings.defaultProvider);
  const [defaultModel, setDefaultModel] = useState(settings.defaultModel);
  const [agentOverrides, setAgentOverrides] = useState<
    Record<string, { provider: string; model: string }>
  >(() => {
    const init: Record<string, { provider: string; model: string }> = {};
    for (const agent of AGENT_LIST) {
      init[agent.id] = {
        provider: settings.agents[agent.id]?.provider ?? '',
        model: settings.agents[agent.id]?.model ?? '',
      };
    }
    return init;
  });

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 프로바이더 변경 시 모델 목록도 리셋
  function handleDefaultProviderChange(p: string) {
    setDefaultProvider(p);
    const pInfo = availableProviders.find((x) => x.name === p);
    setDefaultModel(pInfo?.models[0] ?? '');
  }

  function handleAgentProviderChange(agentId: string, p: string) {
    const pInfo = availableProviders.find((x) => x.name === p);
    setAgentOverrides((prev) => ({
      ...prev,
      [agentId]: { provider: p, model: p === '' ? '' : (pInfo?.models[0] ?? '') },
    }));
  }

  function handleAgentModelChange(agentId: string, m: string) {
    setAgentOverrides((prev) => ({
      ...prev,
      [agentId]: { ...prev[agentId], model: m },
    }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      // 기본 프로바이더/모델 저장
      await adminApi.patch('/admin/ai/settings', {
        key: 'default_provider',
        value: defaultProvider,
      });
      await adminApi.patch('/admin/ai/settings', {
        key: 'default_model',
        value: defaultModel,
      });

      // 에이전트별 오버라이드 저장
      for (const agent of AGENT_LIST) {
        const override = agentOverrides[agent.id];
        await adminApi.patch('/admin/ai/settings', {
          key: `agent_${agent.id}_provider`,
          value: override.provider || null,
        });
        await adminApi.patch('/admin/ai/settings', {
          key: `agent_${agent.id}_model`,
          value: override.model || null,
        });
      }

      onSaved();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  }

  const defaultModels =
    availableProviders.find((p) => p.name === defaultProvider)?.models ?? [];

  return (
    <div className="space-y-8">
      {/* 기본 프로바이더 */}
      <section className="bg-white rounded-lg shadow p-5">
        <h2 className="text-base font-semibold text-gray-700 mb-4">기본 프로바이더</h2>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">프로바이더</label>
            <select
              value={defaultProvider}
              onChange={(e) => handleDefaultProviderChange(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {availableProviders.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                  {!p.configured ? ' (미설정)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">모델</label>
            <select
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {defaultModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* 에이전트별 설정 */}
      <section className="bg-white rounded-lg shadow p-5">
        <h2 className="text-base font-semibold text-gray-700 mb-1">에이전트별 설정</h2>
        <p className="text-xs text-gray-400 mb-4">기본값 사용 시 비워두기</p>

        <div className="divide-y divide-gray-100">
          {AGENT_LIST.map((agent) => {
            const override = agentOverrides[agent.id];
            const selectedProvider = override.provider;
            const agentModels =
              selectedProvider === ''
                ? []
                : (availableProviders.find((p) => p.name === selectedProvider)?.models ?? []);

            return (
              <div key={agent.id} className="py-3 flex flex-wrap items-center gap-3">
                <div className="w-56 flex items-center gap-2 flex-shrink-0">
                  <span className="text-lg leading-none">{agent.icon}</span>
                  <div>
                    <div className="text-sm font-medium text-gray-800">{agent.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{agent.id}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">프로바이더</label>
                    <select
                      value={override.provider}
                      onChange={(e) => handleAgentProviderChange(agent.id, e.target.value)}
                      className="border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">기본값</option>
                      {availableProviders.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name}
                          {!p.configured ? ' (미설정)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">모델</label>
                    <select
                      value={override.model}
                      onChange={(e) => handleAgentModelChange(agent.id, e.target.value)}
                      disabled={selectedProvider === ''}
                      className="border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                    >
                      {selectedProvider === '' ? (
                        <option value="">기본값</option>
                      ) : (
                        agentModels.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 저장 버튼 */}
      {saveError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-3 text-sm">
          {saveError}
        </div>
      )}
      <div className="flex justify-end">
        <button
          onClick={() => { void handleSave(); }}
          disabled={saving}
          className="bg-indigo-600 text-white rounded px-5 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  );
}

// ── 사용량 통계 탭 ──────────────────────────────────────────────────────

function UsageTab() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [queryParams, setQueryParams] = useState(`from=${monthStart()}&to=${today()}`);

  const { data, loading, error, refresh } = useAdminData<UsageSummaryResponse>(
    `/admin/ai/usage/summary?${queryParams}`,
    [queryParams],
  );

  function handleSearch() {
    setQueryParams(`from=${from}&to=${to}`);
    void refresh();
  }

  const byAgent = data?.byAgent ?? {};
  const agentRows = Object.entries(byAgent).sort((a, b) => b[1].calls - a[1].calls);

  return (
    <div className="space-y-6">
      {/* 기간 선택 */}
      <div className="bg-white rounded-lg shadow p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">시작일</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <span className="text-gray-400 pb-2">~</span>
          <div>
            <label className="block text-xs text-gray-500 mb-1">종료일</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="bg-indigo-600 text-white rounded px-4 py-2 text-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? '조회 중...' : '조회'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* 요약 카드 */}
      {loading && !data ? (
        <div className="text-sm text-gray-400">데이터를 불러오는 중...</div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard label="총 호출" value={`${data.totalCalls.toLocaleString()}회`} />
            <SummaryCard
              label="입력 토큰"
              value={fmtTokens(data.totalInputTokens)}
            />
            <SummaryCard
              label="출력 토큰"
              value={fmtTokens(data.totalOutputTokens)}
            />
            <SummaryCard
              label="평균 응답"
              value={fmtLatency(data.avgLatencyMs)}
            />
          </div>

          {/* 에이전트별 테이블 */}
          <section className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="text-base font-semibold text-gray-700">에이전트별 통계</h2>
            </div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-5 py-3 font-medium text-gray-600 border-b">에이전트</th>
                  <th className="px-5 py-3 font-medium text-gray-600 border-b text-right">호출</th>
                  <th className="px-5 py-3 font-medium text-gray-600 border-b text-right">토큰</th>
                  <th className="px-5 py-3 font-medium text-gray-600 border-b text-right">성공률</th>
                </tr>
              </thead>
              <tbody>
                {agentRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-10 text-gray-400">
                      데이터 없음
                    </td>
                  </tr>
                ) : (
                  agentRows.map(([agentId, stats]) => {
                    const agentMeta = AGENT_LIST.find((a) => a.id === agentId);
                    const successRate =
                      'successRate' in stats
                        ? (stats as { calls: number; tokens: number; successRate?: number }).successRate
                        : undefined;
                    return (
                      <tr key={agentId} className="border-b hover:bg-gray-50">
                        <td className="px-5 py-3 text-gray-800">
                          <span className="mr-2">{agentMeta?.icon ?? '🤖'}</span>
                          <span className="font-medium">{agentMeta?.name ?? agentId}</span>
                          <span className="ml-2 text-xs text-gray-400 font-mono">
                            ({agentId})
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right text-gray-700">
                          {stats.calls.toLocaleString()}
                        </td>
                        <td className="px-5 py-3 text-right text-gray-700">
                          {fmtTokens(stats.tokens)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {successRate !== undefined ? (
                            <span
                              className={
                                successRate >= 0.97
                                  ? 'text-green-600'
                                  : successRate >= 0.9
                                  ? 'text-yellow-600'
                                  : 'text-red-600'
                              }
                            >
                              {Math.round(successRate * 100)}%
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </section>

          {/* 프로바이더별 테이블 */}
          {Object.keys(data.byProvider).length > 0 && (
            <section className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-5 py-4 border-b">
                <h2 className="text-base font-semibold text-gray-700">프로바이더별 통계</h2>
              </div>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-5 py-3 font-medium text-gray-600 border-b">프로바이더</th>
                    <th className="px-5 py-3 font-medium text-gray-600 border-b text-right">호출</th>
                    <th className="px-5 py-3 font-medium text-gray-600 border-b text-right">토큰</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.byProvider)
                    .sort((a, b) => b[1].calls - a[1].calls)
                    .map(([provider, stats]) => (
                      <tr key={provider} className="border-b hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-800 capitalize">
                          {provider}
                        </td>
                        <td className="px-5 py-3 text-right text-gray-700">
                          {stats.calls.toLocaleString()}
                        </td>
                        <td className="px-5 py-3 text-right text-gray-700">
                          {fmtTokens(stats.tokens)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-4 text-center">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="text-xl font-bold text-gray-800">{value}</div>
    </div>
  );
}

// ── 메인 페이지 ────────────────────────────────────────────────────────

type Tab = 'settings' | 'usage';

export default function AiSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('settings');
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const {
    data: settings,
    loading: settingsLoading,
    error: settingsError,
    refresh: refreshSettings,
  } = useAdminData<AiSettingsResponse>('/admin/ai/settings');

  function handleSaved() {
    void refreshSettings();
    setSavedAt(new Date().toLocaleTimeString('ko-KR'));
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'settings', label: '프로바이더 설정' },
    { id: 'usage', label: '사용량 통계' },
  ];

  return (
    <div className="p-6 max-w-4xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">AI 설정</h1>
        {savedAt && (
          <span className="text-xs text-green-600 bg-green-50 rounded px-2.5 py-1">
            저장됨 {savedAt}
          </span>
        )}
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === 'settings' && (
        <>
          {settingsError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-3 mb-4 text-sm">
              {settingsError}
            </div>
          )}
          {settingsLoading && !settings ? (
            <div className="text-sm text-gray-400">데이터를 불러오는 중...</div>
          ) : settings ? (
            <SettingsTab settings={settings} onSaved={handleSaved} />
          ) : null}
        </>
      )}

      {activeTab === 'usage' && <UsageTab />}
    </div>
  );
}
