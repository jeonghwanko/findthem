import { createContext, useContext, useRef, useCallback, type ReactNode } from 'react';

type RefreshFn = () => Promise<void> | void;

interface PullToRefreshContextValue {
  register: (fn: RefreshFn) => () => void;
  invoke: () => Promise<void>;
  hasListener: () => boolean;
}

const PullToRefreshContext = createContext<PullToRefreshContextValue | null>(null);

export function PullToRefreshProvider({ children }: { children: ReactNode }) {
  const currentRef = useRef<RefreshFn | null>(null);

  const register = useCallback((fn: RefreshFn) => {
    currentRef.current = fn;
    return () => {
      currentRef.current = null;
    };
  }, []);

  const invoke = useCallback(async () => {
    await currentRef.current?.();
  }, []);

  const hasListener = useCallback(() => currentRef.current !== null, []);

  return (
    <PullToRefreshContext.Provider value={{ register, invoke, hasListener }}>
      {children}
    </PullToRefreshContext.Provider>
  );
}

export function usePullToRefreshContext() {
  const ctx = useContext(PullToRefreshContext);
  if (!ctx) throw new Error('usePullToRefreshContext must be used within PullToRefreshProvider');
  return ctx;
}
