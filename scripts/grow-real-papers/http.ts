/**
 * The transport behind `Get`: one request at a time per service, a fixed gap between two requests
 * to the same service (arXiv asks for 3 s between ANY two of its requests, export API and e-prints
 * alike), and a retry after a 429, a 5xx or a dropped connection. `fetch` and the clock are passed
 * in, so a test runs it on fakes without waiting.
 */
import type { Fetched, Get } from "./sources.ts";

export type Clock = Readonly<{
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}>;

/** The real clock. */
export const realClock: Clock = {
  now: Date.now,
  sleep: (ms) => new Promise<void>((done) => setTimeout(done, ms)),
};

export const USER_AGENT =
  "paperlint-fixtures/1.0 (+https://github.com/zernie/paperlint)";

/** arXiv's hosts share one gap (3.1 s); any other host, Semantic Scholar's, has its own (1.1 s). */
export const serviceOf = (
  url: string,
): Readonly<{ key: string; gapMs: number }> => {
  const host = new URL(url).hostname;
  return host === "arxiv.org" || host.endsWith(".arxiv.org")
    ? { key: "arxiv", gapMs: 3100 }
    : { key: host, gapMs: 1100 };
};

/** One request: its answer, or the status worth a retry (429, 5xx, a dropped connection). */
const once = async (
  fetchFn: typeof fetch,
  url: string,
): Promise<Fetched | Readonly<{ retry: string }>> => {
  try {
    const res = await fetchFn(url, { headers: { "user-agent": USER_AGENT } });
    if (res.ok)
      return { ok: true, bytes: new Uint8Array(await res.arrayBuffer()) };
    const status = String(res.status);
    return res.status === 429 || res.status >= 500
      ? { retry: status }
      : { ok: false, status };
  } catch (e) {
    return { retry: String(e) };
  }
};

export function throttledGet(
  fetchFn: typeof fetch,
  clock: Clock,
  attempts = 4,
): Get {
  const last = new Map<string, number>();
  const wait = async (key: string, gapMs: number): Promise<void> => {
    const due = (last.get(key) ?? -Infinity) + gapMs - clock.now();
    if (due > 0) await clock.sleep(due);
    last.set(key, clock.now());
  };
  const tryFrom = async (url: string, attempt: number): Promise<Fetched> => {
    const { key, gapMs } = serviceOf(url);
    await wait(key, gapMs);
    const r = await once(fetchFn, url);
    if (!("retry" in r)) return r;
    if (attempt >= attempts)
      return {
        ok: false,
        status: `${r.retry} after ${String(attempts)} attempts`,
      };
    await clock.sleep(10_000 * attempt);
    return tryFrom(url, attempt + 1);
  };
  return (url) => tryFrom(url, 1);
}
