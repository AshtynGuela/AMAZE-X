// Share simultaneous, ordinary GETs only. Completed responses use HTTP cache
// policy; callers with a signal retain independent cancellation ownership.
export function createJsonFetch(fetcher = (...args) => fetch(...args)) {
  const pending = new Map();
  return function jsonFetch(url, options) {
    const share = !options || Object.keys(options).length === 0;
    if (share && pending.has(url)) return pending.get(url);
    const work = (async () => {
      const response = await fetcher(url, options);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || `Request failed (${response.status})`);
      return json;
    })();
    if (!share) return work;
    const tracked = work.finally(() => { pending.delete(url); });
    pending.set(url, tracked);
    return tracked;
  };
}
export const jsonFetch = createJsonFetch();
