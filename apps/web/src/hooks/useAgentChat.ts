import { useState, useCallback } from 'react';
import { createAgentSession, sendAgentMessage, uploadAgentPhoto } from '../api/agent.js';
import type { AgentResponse } from '@findthem/shared';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  photoUrl?: string;
  photoAnalysis?: AgentResponse['photoAnalysis'];
  similarReports?: AgentResponse['similarReports'];
  toolsUsed?: string[];
  createdAt: string;
}

export function useAgentChat(reportId?: string) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);

  const addUserMessage = (content: string, photoUrl?: string) => {
    setMessages((prev) => [
      ...prev,
      { role: 'user', content, photoUrl, createdAt: new Date().toISOString() },
    ]);
  };

  const addBotMessage = (res: AgentResponse) => {
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: res.text,
        photoAnalysis: res.photoAnalysis,
        similarReports: res.similarReports,
        toolsUsed: res.toolsUsed,
        createdAt: new Date().toISOString(),
      },
    ]);
    if (res.completed) setCompleted(true);
  };

  const startSession = useCallback(async () => {
    setLoading(true);
    try {
      const res = await createAgentSession(reportId);
      setSessionId(res.sessionId);
      addBotMessage(res as AgentResponse);
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!sessionId || !text.trim()) return;
      addUserMessage(text);
      setLoading(true);
      try {
        const res = await sendAgentMessage(sessionId, text);
        addBotMessage(res);
      } finally {
        setLoading(false);
      }
    },
    [sessionId],
  );

  const sendPhoto = useCallback(
    async (file: File, message?: string) => {
      if (!sessionId) return;
      const previewUrl = URL.createObjectURL(file);
      addUserMessage(message || '사진 첨부', previewUrl);
      setLoading(true);
      try {
        const res = await uploadAgentPhoto(sessionId, file, message);
        addBotMessage(res);
      } finally {
        setLoading(false);
      }
    },
    [sessionId],
  );

  return { sessionId, messages, loading, completed, startSession, sendMessage, sendPhoto };
}
