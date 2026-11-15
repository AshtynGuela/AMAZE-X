import { useEffect, useMemo, useState } from 'react';
import { jsonFetch } from './store';
import { lunarCelestialState } from '../engine/celestial-context.mjs';

const cache = new Map<string, Promise<any>>();
export type CelestialContext = ReturnType<typeof lunarCelestialState>;

export function useCelestialContext(time: number, enabled: boolean) {
  const month = new Date(time).toISOString().slice(0, 7);
  const [result, setResult] = useState<{ month: string; packets?: any; error?: string } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    if (!cache.has(month)) {
      const stamp = encodeURIComponent(`${month}-01T00:00:00.000Z`);
      const job = Promise.all(['earth', 'moon'].map(id => jsonFetch(`/api/solar/${id}?time=${stamp}`)))
        .then(([earth, moon]) => ({ earth, moon })).catch(error => { cache.delete(month); throw error; });
      cache.set(month, job);
      if (cache.size > 6) cache.delete(cache.keys().next().value!);
    }
    cache.get(month)!.then(packets => { if (active) setResult({ month, packets }); })
      .catch(error => { if (active) setResult({ month, error: error.message }); });
    return () => { active = false; };
  }, [month, enabled]);
  const data = useMemo(() => enabled && result?.month === month && result.packets
    ? lunarCelestialState(result.packets, time) : null, [enabled, month, result, time]);
  return { data, error: result?.month === month ? result.error : undefined };
}
