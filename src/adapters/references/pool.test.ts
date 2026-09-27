/** mapLimit: results in input order, never more than `limit` in flight, an empty list at once. */
import assert from "node:assert/strict";
import { test } from "vitest";
import { mapLimit } from "./pool.ts";

test("results keep the input order although they finish out of order", async () => {
  const out = await mapLimit([30, 5, 20, 1], 2, async (ms) => {
    await new Promise((r) => {
      setTimeout(r, ms);
    });
    return ms * 10;
  });
  assert.deepEqual(out, [300, 50, 200, 10]);
});

test("never more than `limit` calls in flight; fewer items than the limit start fewer workers", async () => {
  let now = 0;
  let peak = 0;
  const track = async () => {
    peak = Math.max(peak, ++now);
    await new Promise((r) => {
      setTimeout(r, 2);
    });
    now--;
  };
  await mapLimit(Array.from({ length: 10 }), 3, track);
  const three = peak;
  peak = 0;
  await mapLimit([1, 2], 6, track);
  assert.deepEqual([three, peak, await mapLimit([], 6, track)], [3, 2, []]);
});
