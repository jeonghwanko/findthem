import { useState, useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat';

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chat = useChat();

  // 채팅창 열 때 세션 시작
  useEffect(() => {
    if (open && !chat.sessionId && !chat.loading) {
      chat.startSession();
    }
  }, [open, chat.sessionId, chat.loading]);

  // 새 메시지 시 스크롤
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [chat.messages.length]);

  function handleSend() {
    const msg = input.trim();
    if (!msg) return;
    setInput('');
    chat.sendMessage(msg);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) chat.sendPhoto(file);
    if (fileRef.current) fileRef.current.value = '';
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-primary-600 hover:bg-primary-700 text-white rounded-full shadow-lg flex items-center justify-center text-2xl transition-colors z-50"
        aria-label="채팅 열기"
      >
        💬
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-[360px] h-[520px] bg-white rounded-2xl shadow-2xl flex flex-col z-50 border border-gray-200">
      {/* 헤더 */}
      <div className="bg-primary-600 text-white px-4 py-3 rounded-t-2xl flex items-center justify-between">
        <div>
          <div className="font-semibold">목격 제보 챗봇</div>
          <div className="text-xs text-primary-200">대화로 쉽게 제보하세요</div>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-white/70 hover:text-white text-xl"
        >
          ✕
        </button>
      </div>

      {/* 메시지 영역 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {chat.messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-primary-600 text-white rounded-br-sm'
                  : 'bg-gray-100 text-gray-800 rounded-bl-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {chat.loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-500 px-3 py-2 rounded-xl rounded-bl-sm text-sm">
              입력 중...
            </div>
          </div>
        )}
      </div>

      {/* 퀵 리플라이 */}
      {chat.quickReplies.length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {chat.quickReplies.map((reply) => (
            <button
              key={reply}
              onClick={() => chat.sendMessage(reply)}
              className="px-3 py-1 bg-primary-50 text-primary-700 rounded-full text-sm hover:bg-primary-100 transition-colors border border-primary-200"
            >
              {reply}
            </button>
          ))}
        </div>
      )}

      {/* 입력 영역 */}
      {!chat.completed && (
        <div className="p-3 border-t border-gray-100 flex items-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="text-gray-400 hover:text-primary-600 text-xl flex-shrink-0"
            title="사진 첨부"
          >
            📷
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhoto}
          />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요..."
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            disabled={chat.loading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || chat.loading}
            className="bg-primary-600 hover:bg-primary-700 text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors flex-shrink-0"
          >
            전송
          </button>
        </div>
      )}
    </div>
  );
}
