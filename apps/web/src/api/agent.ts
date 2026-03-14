import { api } from './client.js';
import type { AgentResponse } from '@findthem/shared';

interface CreateAgentSessionResponse {
  sessionId: string;
  text: string;
  completed: boolean;
  toolsUsed: string[];
}

export async function createAgentSession(reportId?: string, platform?: string) {
  return api.post<CreateAgentSessionResponse>('/agent/sessions', { reportId, platform });
}

export async function sendAgentMessage(sessionId: string, message: string) {
  return api.post<AgentResponse>(`/agent/sessions/${sessionId}/messages`, { message });
}

export async function uploadAgentPhoto(sessionId: string, file: File, message?: string) {
  const formData = new FormData();
  formData.append('photo', file);
  if (message) formData.append('message', message);
  return api.post<AgentResponse & { photoUrl: string }>(
    `/agent/sessions/${sessionId}/upload`,
    formData,
  );
}

export async function getAgentSession(sessionId: string) {
  return api.get<{
    id: string;
    status: string;
    messages: Array<{
      role: string;
      content: string;
      photoUrl?: string;
      createdAt: string;
    }>;
  }>(`/agent/sessions/${sessionId}`);
}
