import { useEffect, useRef } from 'react';
import { usePullToRefreshContext } from '../context/PullToRefreshContext';

export function usePullToRefresh(onRefresh: () => Promise<void> | void) {
  const { register } = usePullToRefreshContext();
  const fnRef = useRef(onRefresh);
  fnRef.current = onRefresh;

  useEffect(() => {
    return register(() => fnRef.current());
  }, [register]);
}
