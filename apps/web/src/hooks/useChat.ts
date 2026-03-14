import { useState, useCallback, useRef } from 'react';
import { api } from '../api/client';
import type { BotResponse } from '@findthem/shared';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  photoUrl?: string;
}

interface ChatSession {
  sessionId: string;
  messages: ChatMessage[];
  loading: boolean;
  completed: boolean;
  quickReplies: string[];
}

export function useChat(reportId?: string) {
  const [session, setSession] = useState<ChatSession>({
    sessionId: '',
    messages: [],
    loading: false,
    completed: false,
    quickReplies: [],
  });
  const idRef = useRef(0);

  const nextId = () => `msg_${++idRef.current}`;

  const startSession = useCallback(async () => {
    setSession((s) => ({ ...s, loading: true }));

    try {
      const res = await api.post<{ sessionId: string } & BotResponse>(
        '/chat/sessions',
        reportId ? { reportId } : {},
      );

      setSession({
        sessionId: res.sessionId,
        messages: [
          { id: nextId(), role: 'assistant', content: res.text },
        ],
        loading: false,
        completed: false,
        quickReplies: res.quickReplies || [],
      });
    } catch {
      setSession((s) => ({
        ...s,
        loading: false,
        messages: [
          ...s.messages,
          { id: nextId(), role: 'assistant', content: '연결에 실패했습니다.' },
        ],
      }));
    }
  }, [reportId]);

  const sendMessage = useCallback(
    async (message: string) => {
      if (!session.sessionId || session.loading || session.completed) return;

      // 사용자 메시지 즉시 표시
      setSession((s) => ({
        ...s,
        loading: true,
        quickReplies: [],
        messages: [
          ...s.messages,
          { id: nextId(), role: 'user', content: message },
        ],
      }));

      try {
        const res = await api.post<BotResponse>(
          `/chat/sessions/${session.sessionId}/messages`,
          { message },
        );

        setSession((s) => ({
          ...s,
          loading: false,
          completed: res.completed || false,
          quickReplies: res.quickReplies || [],
          messages: [
            ...s.messages,
            { id: nextId(), role: 'assistant', content: res.text },
          ],
        }));
      } catch {
        setSession((s) => ({
          ...s,
          loading: false,
          messages: [
            ...s.messages,
            { id: nextId(), role: 'assistant', content: '오류가 발생했습니다. 다시 시도해주세요.' },
          ],
        }));
      }
    },
    [session.sessionId, session.loading, session.completed],
  );

  const sendPhoto = useCallback(
    async (file: File) => {
      if (!session.sessionId || session.loading || session.completed) return;

      const formData = new FormData();
      formData.append('photo', file);

      setSession((s) => ({
        ...s,
        loading: true,
        quickReplies: [],
        messages: [
          ...s.messages,
          { id: nextId(), role: 'user', content: '📷 사진 전송' },
        ],
      }));

      try {
        const res = await api.post<BotResponse>(
          `/chat/sessions/${session.sessionId}/upload`,
          formData,
        );

        setSession((s) => ({
          ...s,
          loading: false,
          completed: res.completed || false,
          quickReplies: res.quickReplies || [],
          messages: [
            ...s.messages,
            { id: nextId(), role: 'assistant', content: res.text },
          ],
        }));
      } catch {
        setSession((s) => ({
          ...s,
          loading: false,
          messages: [
            ...s.messages,
            { id: nextId(), role: 'assistant', content: '사진 업로드에 실패했습니다.' },
          ],
        }));
      }
    },
    [session.sessionId, session.loading, session.completed],
  );

  return {
    ...session,
    startSession,
    sendMessage,
    sendPhoto,
  };
}
