import { useState, useEffect, useRef, useCallback } from 'react';
import type { AgentActivityResponse, AgentActivityAgent, AgentActivityEvent } from '@findthem/shared';
import { api } from '../api/client';

const POLL_INTERVAL = 15_000;
const MAX_BUFFER_SIZE = 50;

export interface UseAgentActivityResult {
  agents: AgentActivityAgent[];
  /** 아직 Pixi 씬에서 소비되지 않은 새 이벤트 (ref 기반) */
  pendingEventsRef: React.MutableRefObject<AgentActivityEvent[]>;
  isLoading: boolean;
}

export function useAgentActivity(enabled = true): UseAgentActivityResult {
  const [agents, setAgents] = useState<AgentActivityAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const sinceRef = useRef<string | null>(null);
  const pendingEventsRef = useRef<AgentActivityEvent[]>([]);
  const seenIdsRef = useRef(new Set<string>());

  const fetchActivity = useCallback(async (signal: AbortSignal) => {
    const params = new URLSearchParams();
    if (sinceRef.current) params.set('since', sinceRef.current);

    const data = await api.get<AgentActivityResponse>(
      `/community/agent-activity?${params}`,
      { signal },
    );

    sinceRef.current = data.serverTime;
    setAgents(data.agents);

    // 새 이벤트를 pendingEvents에 push (중복 제거)
    for (const agent of data.agents) {
      for (const evt of agent.recentEvents) {
        if (!seenIdsRef.current.has(evt.id)) {
          seenIdsRef.current.add(evt.id);
          pendingEventsRef.current.push(evt);
        }
      }
    }

    // 버퍼 크기 제한
    if (pendingEventsRef.current.length > MAX_BUFFER_SIZE) {
      pendingEventsRef.current = pendingEventsRef.current.slice(-MAX_BUFFER_SIZE);
    }
    if (seenIdsRef.current.size > 200) {
      const recent = new Set(pendingEventsRef.current.map((e) => e.id));
      seenIdsRef.current = recent;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const abortController = new AbortController();

    // 최초 fetch
    fetchActivity(abortController.signal)
      .catch(() => {})
      .finally(() => setIsLoading(false));

    // 폴링
    const timer = setInterval(() => {
      fetchActivity(abortController.signal).catch(() => {});
    }, POLL_INTERVAL);

    return () => {
      abortController.abort();
      clearInterval(timer);
    };
  }, [enabled, fetchActivity]);

  return { agents, pendingEventsRef, isLoading };
}
