/**
 * The transport over a fake `fetch` and a fake clock: arXiv's 3-second gap shared by all its hosts,
 * Semantic Scholar's own gap, and the retries. No real request, no real wait.
 */
import { describe, expect, test } from "vitest";
import { realClock, serviceOf, throttledGet, USER_AGENT } from "./http.ts";

type Answer = number | "drop";

/** A clock whose sleeps only move its time, and a `fetch` that answers from a script. */
function world(answers: readonly Answer[]) {
  const t = { now: 0 };
  const sleeps: number[] = [];
  const calls: (readonly [string, number])[] = [];
  const queue = [...answers];
  const fetchFn: typeof fetch = (input, init) => {
    const url = typeof input === "string" ? input : "not a string URL";
    calls.push([url, t.now]);
    // Guards: every request names this package.
    expect(init?.headers).toEqual({ "user-agent": USER_AGENT });
    const a = queue.shift() ?? 200;
    return a === "drop"
      ? Promise.reject(new Error("socket hang up"))
      : Promise.resolve(new Response(a === 200 ? "body" : "", { status: a }));
  };
  const clock = {
    now: () => t.now,
    sleep: (ms: number) => {
      sleeps.push(ms);
      t.now += ms;
      return Promise.resolve();
    },
  };
  return { get: throttledGet(fetchFn, clock), sleeps, calls };
}

describe("the gap between requests", () => {
  test("arXiv's hosts share one gap; another service has its own", async () => {
    const w = world([]);
    await w.get("https://export.arxiv.org/api/query?a");
    await w.get("https://api.semanticscholar.org/x");
    await w.get("https://arxiv.org/src/1");
    // Guards: the e-print waits 3.1 s after the export API, while S2 did not wait for arXiv.
    expect(w.calls).toEqual([
      ["https://export.arxiv.org/api/query?a", 0],
      ["https://api.semanticscholar.org/x", 0],
      ["https://arxiv.org/src/1", 3100],
    ]);
    // Guards: which hosts are arXiv.
    expect(
      [
        "https://arxiv.org/",
        "https://export.arxiv.org/",
        "https://notarxiv.org/",
      ].map((u) => serviceOf(u)),
    ).toEqual([
      { key: "arxiv", gapMs: 3100 },
      { key: "arxiv", gapMs: 3100 },
      { key: "notarxiv.org", gapMs: 1100 },
    ]);
  });
});

describe("retries", () => {
  test("a 429, a 5xx and a dropped connection are retried with a growing pause", async () => {
    const w = world([429, 503, "drop", 200]);
    const r = await w.get("https://api.semanticscholar.org/x");
    // Guards: the fourth attempt's answer comes back.
    expect(r).toEqual({ ok: true, bytes: new Uint8Array(Buffer.from("body")) });
    // Guards: 10, 20, 30 s between attempts (the 1.1 s gap already passed).
    expect(w.sleeps).toEqual([10_000, 20_000, 30_000]);
  });

  test("a 404 is final, and four failures give up", async () => {
    const w = world([404, 500, 500, 500, 500]);
    // Guards: a client error is not retried.
    expect(await w.get("https://api.semanticscholar.org/a")).toEqual({
      ok: false,
      status: "404",
    });
    // Guards: the last status, with the number of attempts.
    expect(await w.get("https://api.semanticscholar.org/b")).toEqual({
      ok: false,
      status: "500 after 4 attempts",
    });
    expect(w.calls.length).toBe(5);
  });
});

test("the real clock sleeps and tells the time", async () => {
  const before = realClock.now();
  await realClock.sleep(1);
  // Guards: time moves forward across a sleep.
  expect(realClock.now()).toBeGreaterThanOrEqual(before);
});
