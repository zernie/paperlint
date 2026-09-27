/**
 * `failure.ts` — the one place a sentence about a banal failure is written, and the probe that
 * accepts a banal by a measurement.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  type BanalFailure,
  describe,
  describeLine,
  PERL_MISSING,
} from "./failure.ts";
import { acceptProbe } from "./probe.ts";

test("describe: perl missing carries the fix", () => {
  assert.deepEqual(describe({ kind: "perl-missing" }), [PERL_MISSING]);
  assert.match(PERL_MISSING, /apt-get install perl/);
});

test("describe: an explicit $BANAL that is not there says so, and nothing else is suggested", () => {
  // Guards: an explicit choice that is wrong is named, not replaced by "run paperlint toolchain".
  const [line] = describe({
    kind: "banal-missing",
    missing: { kind: "explicit-not-found", path: "/x/banal" },
  });
  assert.equal(
    line,
    "banal not found: $BANAL names /x/banal, which does not exist",
  );
});

test("describe: not installed names where it was looked for and the fix", () => {
  const [line] = describe({
    kind: "banal-missing",
    missing: { kind: "not-installed", installed: "/c/banal" },
  });
  assert.equal(
    line,
    "banal not found: /c/banal — `npx paperlint toolchain` installs it",
  );
});

test("describe: a sha256 mismatch shows both hashes on their own lines", () => {
  const lines = describe({
    kind: "sha-mismatch",
    url: "https://x/banal",
    expected: "a".repeat(64),
    got: "b".repeat(64),
  });
  assert.equal(lines.length, 3);
  assert.match(lines[0], /does not have the pinned sha256/);
  assert.equal(lines[1], `expected ${"a".repeat(64)}`);
});

test("describeLine: a nonzero exit with no stderr says so", () => {
  assert.equal(
    describeLine({ kind: "process-failed", status: 3, stderrHead: "" }),
    "banal failed (exit 3): no output",
  );
});

test("acceptProbe: one page and a body size is accepted; anything else is `probe-rejected`", () => {
  assert.ok(acceptProbe({ pages: [{}], bodyfontsize: 10.3 }).ok);
  // Guards: acceptance is a MEASUREMENT — a banal that runs and measures nothing is refused.
  const r = acceptProbe({ pages: [{}], bodyfontsize: null });
  assert.equal(!r.ok && r.error.kind, "probe-rejected");
  assert.equal(acceptProbe({ pages: [], bodyfontsize: 10 }).ok, false);
});

test("describe: every other kind is one exact sentence", () => {
  const cases: readonly [BanalFailure, string][] = [
    [
      { kind: "process-failed", status: 2, stderrHead: "boom" },
      "banal failed (exit 2): boom",
    ],
    [
      { kind: "signalled", signal: "SIGKILL", stderrHead: "" },
      "banal failed (SIGKILL): no output",
    ],
    [
      { kind: "signalled", signal: "SIGTERM", stderrHead: "late" },
      "banal failed (SIGTERM): late",
    ],
    [{ kind: "spawn-failed", message: "EACCES" }, "banal failed: EACCES"],
    [
      { kind: "timed-out", afterMs: 500 },
      "banal failed: no answer after 500 ms",
    ],
    [{ kind: "no-json", head: "" }, "banal printed no JSON: nothing"],
    [{ kind: "no-json", head: "Usage:" }, "banal printed no JSON: Usage:"],
    [
      { kind: "banal-error", stderrHead: "bad xml" },
      "banal could not read the banal input XML: bad xml",
    ],
    [
      {
        kind: "unexpected-shape",
        issues: ["pages missing", "bodyfontsize not a number"],
      },
      "banal printed JSON that is not a measurement: pages missing; bodyfontsize not a number",
    ],
    [
      { kind: "probe-rejected", got: { pages: [] } },
      'banal ran on a one-page probe but measured nothing: {"pages":[]}',
    ],
    [
      { kind: "download-failed", url: "https://x/banal", detail: "HTTP 404" },
      "could not download banal from https://x/banal: HTTP 404",
    ],
    [
      { kind: "not-pinned", path: "/c/banal" },
      "banal in /c/banal is not the pinned one (sha256 differs)",
    ],
    [
      {
        kind: "does-not-run",
        path: "/c/banal",
        why: { kind: "timed-out", afterMs: 9 },
      },
      "banal in /c/banal does not run: banal failed: no answer after 9 ms",
    ],
  ];
  for (const [failure, sentence] of cases)
    assert.deepEqual(describe(failure), [sentence]);
});

test("describeLine: a sha256 mismatch joins its three lines", () => {
  assert.equal(
    describeLine({ kind: "sha-mismatch", url: "u", expected: "e", got: "g" }),
    "banal from u does not have the pinned sha256 — refusing to install it; expected e; got      g",
  );
});
