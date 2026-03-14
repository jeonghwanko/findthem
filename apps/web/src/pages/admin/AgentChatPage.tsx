import { useState, useEffect, useRef, useCallback } from 'react';
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

export default function AgentChatPage() {
  const [sessions, setSessions] = useState<AdminAgentSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const result = await adminApi.get<AdminAgentSessionListResponse>(
        '/admin/agent/sessions',
      );
      setSessions(result.sessions ?? []);
    } catch (e: unknown) {
      console.error('세션 로드 실패:', e);
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
      setError(e instanceof Error ? e.message : '세션 생성 실패');
    } finally {
      setSending(false);
    }
  }

  async function handleSelectSession(session: AdminAgentSession) {
    setActiveSessionId(session.id);
    setMessages([]);
    setError(null);
    // 세션 내 메시지 로드 — API가 없으면 빈 상태로 시작
    try {
      const result = await adminApi.get<{ messages: DisplayMessage[] }>(
        `/admin/agent/sessions/${session.id}`,
      );
      setMessages(result.messages ?? []);
    } catch {
      // 세션 상세 API 없는 경우 무시
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
      setError(e instanceof Error ? e.message : '전송 실패');
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

  return (
    <div className="flex h-full">
      {/* 세션 목록 */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-gray-100">
          <button
            onClick={() => { void handleNewSession(); }}
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
                onClick={() => { void handleSelectSession(session); }}
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
      </aside>

      {/* 대화 영역 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 헤더 */}
        <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-3">
          <h1 className="font-semibold text-gray-900">AI 에이전트 대화</h1>
          {activeSessionId && (
            <span className="font-mono text-xs text-gray-400 bg-gray-100 rounded px-2 py-0.5">
              {shortId(activeSessionId)}
            </span>
          )}
        </div>

        {/* 메시지 목록 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
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
                <AgentMessageBubble key={i} message={msg} />
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
          <div className="mx-5 mb-2 bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {/* 입력 */}
        <div className="bg-white border-t border-gray-200 px-5 py-3">
          <div className="flex gap-3">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="메시지를 입력하세요... (Enter: 전송, Shift+Enter: 줄바꿈)"
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
