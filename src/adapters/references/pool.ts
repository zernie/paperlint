/**
 * `fn` over `items` with at most `limit` calls in flight, results in `items`' order — a promise
 * pool, the one piece of concurrency this adapter needs, so it is written here rather than
 * depended on. A rejection rejects the whole map, as `Promise.all` would: callers that must not
 * lose the other results catch inside `fn`.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return out;
}
