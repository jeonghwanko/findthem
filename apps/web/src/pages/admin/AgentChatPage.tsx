import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../api/admin.js';
import type {
  AdminAgentChatResponse,
  AdminAgentToolResult,
  AdminAgentChatRequest,
} from '@findthem/shared';

interface AdminAgentSession {
  id: string;
  createdAt: string;
  summary?: string | null;
  messageCount?: number;
}

interface AdminAgentSessionListResponse {
  sessions: AdminAgentSession[];
}

interface DisplayMessage {
  role: 'user' | 'agent';
  content: string;
  toolResults?: AdminAgentToolResult[];
  createdAt: string;
}

function AgentMessageBubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          isUser ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-900'
        }`}
      >
        <div className="whitespace-pre-wrap text-sm">{message.content}</div>
        {message.toolResults && message.toolResults.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.toolResults.map((tr, i) => (
              <details key={i} className="text-xs bg-gray-200 rounded p-2">
                <summary className="cursor-pointer font-medium text-gray-700">
                  도구: {tr.tool}
                </summary>
                <pre className="mt-1 overflow-auto max-h-40 text-gray-600">
                  {JSON.stringify(tr.output, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        )}
        <div
          className={`text-xs mt-1 ${isUser ? 'text-indigo-200' : 'text-gray-400'}`}
        >
          {new Date(message.createdAt).toLocaleTimeString('ko-KR')}
        </div>
      </div>
    </div>
  );
}

function shortId(id: string) {
  return id.slice(0, 12);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR');
}

function SessionList({
  sessions,
  sessionsLoading,
  activeSessionId,
  sending,
  onNewSession,
  onSelectSession,
}: {
  sessions: AdminAgentSession[];
  sessionsLoading: boolean;
  activeSessionId: string | null;
  sending: boolean;
  onNewSession: () => void;
  onSelectSession: (session: AdminAgentSession) => void;
}) {
  return (
    <>
      <div className="p-3 border-b border-gray-100">
        <button
          onClick={onNewSession}
          disabled={sending}
          className="w-full bg-indigo-600 text-white rounded px-3 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          + 새 대화
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {sessionsLoading ? (
          <div className="text-center py-8 text-sm text-gray-400">로딩 중...</div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400">세션 없음</div>
        ) : (
          sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => onSelectSession(session)}
              className={`w-full text-left px-4 py-3 text-sm border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                activeSessionId === session.id ? 'bg-indigo-50 border-l-2 border-l-indigo-600' : ''
              }`}
            >
              <div className="font-mono text-xs text-gray-500 mb-0.5">
                {shortId(session.id)}
              </div>
              {session.summary && (
                <div className="text-gray-700 truncate text-xs mb-0.5">
                  {session.summary}
                </div>
              )}
              <div className="text-xs text-gray-400">{formatDate(session.createdAt)}</div>
            </button>
          ))
        )}
      </div>
    </>
  );
}

export default function AgentChatPage() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<AdminAgentSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const result = await adminApi.get<AdminAgentSessionListResponse>(
        '/admin/agent/sessions',
      );
      setSessions(result.sessions ?? []);
    } catch {
      // 세션 로드 실패 시 무시
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleNewSession() {
    setDrawerOpen(false);
    setSending(true);
    setError(null);
    try {
      const body: AdminAgentChatRequest = { message: '안녕하세요' };
      const result = await adminApi.post<AdminAgentChatResponse>('/admin/agent/chat', body);
      setActiveSessionId(result.sessionId);
      setMessages([
        {
          role: 'agent',
          content: result.reply,
          toolResults: result.toolResults,
          createdAt: new Date().toISOString(),
        },
      ]);
      await fetchSessions();
    } catch (e: unknown) {
      const code = e instanceof Error ? e.message : '';
      setError(t(`errors.${code}`, { defaultValue: t('admin.errorFallback') }));
    } finally {
      setSending(false);
    }
  }

  async function handleSelectSession(session: AdminAgentSession) {
    setDrawerOpen(false);
    setActiveSessionId(session.id);
    setMessages([]);
    setError(null);
    try {
      const result = await adminApi.get<{ messages: DisplayMessage[] }>(
        `/admin/agent/sessions/${session.id}`,
      );
      setMessages(result.messages ?? []);
    } catch {
      setMessages([]);
    }
  }

  async function handleSend() {
    if (!inputText.trim() || sending) return;
    const text = inputText.trim();
    setInputText('');
    setError(null);

    const userMsg: DisplayMessage = {
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const body: AdminAgentChatRequest = {
        sessionId: activeSessionId ?? undefined,
        message: text,
      };
      const result = await adminApi.post<AdminAgentChatResponse>('/admin/agent/chat', body);

      if (!activeSessionId) {
        setActiveSessionId(result.sessionId);
        await fetchSessions();
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'agent',
          content: result.reply,
          toolResults: result.toolResults,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (e: unknown) {
      const code = e instanceof Error ? e.message : '';
      setError(t(`errors.${code}`, { defaultValue: t('admin.errorFallback') }));
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  const sessionListProps = {
    sessions,
    sessionsLoading,
    activeSessionId,
    sending,
    onNewSession: () => { void handleNewSession(); },
    onSelectSession: (s: AdminAgentSession) => { void handleSelectSession(s); },
  };

  return (
    <div className="flex h-full">
      {/* 모바일 세션 drawer 오버레이 */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 모바일 세션 drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white flex flex-col transform transition-transform duration-200 ease-in-out lg:hidden ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <span className="font-semibold text-sm text-gray-900">세션 목록</span>
          <button
            onClick={() => setDrawerOpen(false)}
            className="text-gray-400 hover:text-gray-600 p-1"
            aria-label="세션 목록 닫기"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <SessionList {...sessionListProps} />
      </aside>

      {/* 데스크톱 세션 사이드바 */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-gray-200 flex-col flex-shrink-0">
        <SessionList {...sessionListProps} />
      </aside>

      {/* 대화 영역 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 헤더 */}
        <div className="bg-white border-b border-gray-200 px-4 lg:px-5 py-3 flex items-center gap-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden text-gray-600 hover:text-gray-900 p-1"
            aria-label="세션 목록 열기"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8M4 18h16" />
            </svg>
          </button>
          <h1 className="font-semibold text-gray-900 text-sm lg:text-base">AI 에이전트 대화</h1>
          {activeSessionId && (
            <span className="font-mono text-xs text-gray-400 bg-gray-100 rounded px-2 py-0.5 hidden sm:inline">
              {shortId(activeSessionId)}
            </span>
          )}
        </div>

        {/* 메시지 목록 */}
        <div className="flex-1 overflow-y-auto px-4 lg:px-5 py-4">
          {!activeSessionId && messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <div className="text-4xl mb-3">🤖</div>
              <p className="text-sm">새 대화를 시작하거나 기존 세션을 선택하세요.</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
              메시지가 없습니다. 대화를 시작하세요.
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <AgentMessageBubble key={`${msg.createdAt}-${msg.role}-${i}`} message={msg} />
              ))}
              {sending && (
                <div className="flex justify-start mb-3">
                  <div className="bg-gray-100 rounded-lg px-4 py-2">
                    <div className="flex gap-1 items-center">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* 에러 */}
        {error && (
          <div className="mx-4 lg:mx-5 mb-2 bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {/* 입력 */}
        <div className="bg-white border-t border-gray-200 px-4 lg:px-5 py-3">
          <div className="flex gap-2 lg:gap-3">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="메시지를 입력하세요..."
              disabled={sending}
              rows={2}
              className="flex-1 border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none disabled:opacity-50"
            />
            <button
              onClick={() => { void handleSend(); }}
              disabled={!inputText.trim() || sending}
              className="bg-indigo-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 self-end"
            >
              전송
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
