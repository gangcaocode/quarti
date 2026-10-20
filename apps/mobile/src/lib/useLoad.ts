// A tiny loader: run an async function, keep its result, reload on demand (pull to refresh) and when the screen gains focus.
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const v = await fn();
      if (my === seq.current) { setData(v); setError(null); }
    } catch (e) {
      if (my === seq.current) setError(e as Error);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, deps);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  return { data, error, loading, reload, setData };
}
