/**
 * `output.ts` — every way a banal run can end, as a table of `ProcessExit` → `Result`, and the
 * measurement → geometry projection. Pure: no perl, no disk. The real banal is `test/e2e/banal.mjs`.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import type { ProcessExit } from "../../domain/ports.ts";
import { err } from "../../domain/result.ts";
import type { BanalFailure } from "./failure.ts";
import {
  geometryOf,
  parseBanalOutput,
  type BanalMeasurement,
} from "./output.ts";

const exited = (
  over: Partial<{ status: number; stdout: string; stderr: string }>,
): ProcessExit => ({
  kind: "exited",
  status: 0,
  stdout: "",
  stderr: "",
  ...over,
});

/** The failure a row expects, or the `kind` only when its detail is a zod message. */
const ROWS: readonly (readonly [
  string,
  ProcessExit,
  BanalFailure | BanalFailure["kind"],
])[] = [
  [
    // Guards: perl missing is its own diagnosis, not "banal failed: ENOENT".
    "perl not found",
    { kind: "not-found", file: "perl" },
    { kind: "perl-missing" },
  ],
  [
    "spawn failed",
    { kind: "spawn-failed", message: "EACCES" },
    { kind: "spawn-failed", message: "EACCES" },
  ],
  [
    "timed out",
    { kind: "timed-out", afterMs: 50, stdout: "", stderr: "" },
    { kind: "timed-out", afterMs: 50 },
  ],
  [
    "killed by a signal",
    { kind: "signalled", signal: "SIGKILL", stdout: "", stderr: "\n oom \n" },
    { kind: "signalled", signal: "SIGKILL", stderrHead: "oom" },
  ],
  [
    "a nonzero exit names the exit and banal's first line",
    exited({ status: 1, stderr: "\nx.xml: Error: bad\nmore" }),
    { kind: "process-failed", status: 1, stderrHead: "x.xml: Error: bad" },
  ],
  [
    "output that is not JSON",
    exited({ stdout: "Usage: banal" }),
    { kind: "no-json", head: "Usage: banal" },
  ],
  [
    // Guards: banal's own failure object exits 0 — it must not read as zero pages.
    'banal\'s `"error": true` with exit 0',
    exited({ stdout: '{"error": true, "pages": []}', stderr: "cannot read" }),
    { kind: "banal-error", stderrHead: "cannot read" },
  ],
  [
    "JSON that is not an object",
    exited({ stdout: "[1, 2]" }),
    "unexpected-shape",
  ],
  [
    "an object with no `pages`",
    exited({ stdout: '{"columns": 2}' }),
    "unexpected-shape",
  ],
];

for (const [label, exit, want] of ROWS) {
  test(`parseBanalOutput: ${label}`, () => {
    const got = parseBanalOutput(exit);
    if (typeof want === "string")
      assert.equal(!got.ok && got.error.kind, want, JSON.stringify(got));
    else assert.deepEqual(got, err(want));
  });
}

test("parseBanalOutput: a measurement is parsed, unknown fields kept", () => {
  const got = parseBanalOutput(
    exited({ stdout: '{"columns": 2, "pages": [{}], "extra": 1}' }),
  );
  assert.ok(got.ok);
  assert.equal(got.value.columns, 2);
  assert.equal(got.value.pages.length, 1);
});

const M = (over: Partial<BanalMeasurement>): BanalMeasurement => ({
  pages: [],
  ...over,
});

test("geometryOf: a page without a type IS a body page", () => {
  // Guards: banal omits `type` on body pages; counting type === "body" gave zero for every paper.
  const g = geometryOf(
    M({
      pages: [
        {},
        {},
        {},
        { type: "bib", reffontsize: 8.5 },
        { type: "appendix" },
      ],
    }),
  );
  assert.deepEqual(
    [g.body_pages, g.ref_pages, g.appendix_pages, g.ref_pt],
    [3, 1, 1, 8.5],
  );
  assert.deepEqual(g.pages_by_type, { body: 3, bib: 1, appendix: 1 });
});

test("geometryOf: papersize is [height, width] in points → inches", () => {
  const g = geometryOf(
    M({ papersize: [792, 612], columns: 2, bodyfontsize: 10 }),
  );
  assert.deepEqual(
    [g.page_w_in, g.page_h_in, g.columns, g.body_pt],
    [8.5, 11, 2, 10],
  );
});

test("geometryOf: an empty measurement is nulls and zeros, not a crash", () => {
  const g = geometryOf(M({ bodyfontsize: null }));
  assert.deepEqual(
    [g.page_w_in, g.columns, g.body_pt, g.ref_pt, g.body_pages],
    [null, null, null, null, 0],
  );
});
