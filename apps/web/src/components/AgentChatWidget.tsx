import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAgentChat } from '../hooks/useAgentChat';

export default function AgentChatWidget() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const chat = useAgentChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { sessionId, loading, error, startSession } = chat;

  useEffect(() => {
    if (open && !sessionId && !loading && !error) {
      void startSession();
    }
  }, [open, sessionId, loading, error, startSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.messages.length]);

  function handleSend() {
    const msg = input.trim();
    if (!msg) return;
    setInput('');
    void chat.sendMessage(msg);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void chat.sendPhoto(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 md:bottom-6 right-6 w-14 h-14 bg-primary-600 hover:bg-primary-700 text-white rounded-full shadow-lg flex items-center justify-center text-2xl transition-colors z-50"
        aria-label={t('agent.openChat')}
      >
        🤖
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 md:bottom-6 right-4 left-4 md:left-auto md:right-6 md:w-96 h-[480px] md:h-[560px] bg-white rounded-2xl shadow-2xl flex flex-col z-50 border border-gray-200">
      {/* 헤더 */}
      <div className="bg-primary-600 text-white px-4 py-3 rounded-t-2xl flex items-center justify-between">
        <div>
          <div className="font-semibold">{t('agent.title')}</div>
          <div className="text-xs text-primary-200">{t('agent.subtitle')}</div>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-white/70 hover:text-white text-xl"
          aria-label="닫기"
        >
          ✕
        </button>
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {chat.messages.map((msg) => (
          <div
            key={`${msg.createdAt}-${msg.role}`}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-primary-600 text-white rounded-br-sm'
                  : 'bg-gray-100 text-gray-800 rounded-bl-sm'
              }`}
            >
              {/* 사용자 사진 미리보기 */}
              {msg.photoUrl && msg.role === 'user' && (
                <img
                  src={msg.photoUrl}
                  alt="첨부 사진"
                  className="w-40 h-40 object-cover rounded-lg mb-2"
                />
              )}

              {msg.content}

              {/* 도구 사용 배지 */}
              {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {msg.toolsUsed.map((tool) => (
                    <span
                      key={tool}
                      className="inline-block bg-primary-100 text-primary-700 text-xs rounded px-1.5 py-0.5"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              )}

              {/* 사진 분석 결과 */}
              {msg.photoAnalysis && (
                <div className="mt-2 bg-blue-50 rounded p-2 text-xs border border-blue-100">
                  <span className="font-medium">📸 {t('agent.photoLabel')}</span>{' '}
                  {msg.photoAnalysis.description}
                  {msg.photoAnalysis.features.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {msg.photoAnalysis.features.map((f) => (
                        <span key={f} className="bg-blue-100 text-blue-700 rounded px-1 py-0.5">
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 유사 신고 카드 */}
              {msg.similarReports && msg.similarReports.length > 0 && (
                <div className="mt-2 bg-amber-50 rounded p-2 text-xs border border-amber-100">
                  <span className="font-medium">🔍 {t('agent.similarReports')}</span>
                  {msg.similarReports.map((r) => (
                    <div key={r.id} className="mt-1 flex items-center gap-2">
                      {r.photoUrl && (
                        <img
                          src={r.photoUrl}
                          alt={r.name}
                          className="w-10 h-10 object-cover rounded flex-shrink-0"
                        />
                      )}
                      <div>
                        <a
                          href={`/reports/${r.id}`}
                          className="text-primary-600 underline font-medium"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {r.name}
                        </a>
                        <div className="text-gray-600">{r.features}</div>
                        <div className="text-amber-600">{t('agent.similarity')} {r.similarity}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {chat.loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-500 px-3 py-2 rounded-xl rounded-bl-sm text-sm">
              {t('agent.analyzing')}
            </div>
          </div>
        )}

        {chat.error && !chat.loading && (
          <div className="flex justify-start">
            <div className="bg-red-50 text-red-600 px-3 py-2 rounded-xl rounded-bl-sm text-sm flex items-center gap-2">
              <span>{t(`agent.${chat.error}`)}</span>
              <button
                onClick={() => void chat.startSession()}
                className="underline text-red-700 hover:text-red-800 font-medium"
              >
                {t('agent.retry')}
              </button>
            </div>
          </div>
        )}

        {chat.completed && (
          <div className="text-center py-2">
            <span className="inline-block bg-green-100 text-green-700 text-sm px-3 py-1 rounded-full">
              {t('agent.completed')}
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 입력 영역 */}
      {!chat.completed && (
        <div className="p-3 border-t border-gray-100 flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-gray-400 hover:text-primary-600 text-xl flex-shrink-0"
            title={t('agent.photoAttach')}
            disabled={chat.loading}
          >
            📷
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhoto}
          />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('agent.placeholder')}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            disabled={chat.loading || !chat.sessionId}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || chat.loading || !chat.sessionId}
            className="bg-primary-600 hover:bg-primary-700 text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors flex-shrink-0"
          >
            {t('agent.send')}
          </button>
        </div>
      )}
    </div>
  );
}
