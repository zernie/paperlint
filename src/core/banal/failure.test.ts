/**
 * `failure.ts` — the one place a sentence about a banal failure is written, and the probe that
 * accepts a banal by a measurement.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { describe, describeLine, PERL_MISSING } from "./failure.ts";
import { acceptProbe } from "./probe.ts";

test("describe: perl missing carries the fix", () => {
  assert.deepEqual(describe({ kind: "perl-missing" }), [PERL_MISSING]);
  assert.match(PERL_MISSING, /apt-get install perl/);
});

test("describe: an explicit $BANAL that is not there says so, and nothing else is suggested", () => {
  // Guards: an explicit choice that is wrong is named, not replaced by "run rpp toolchain".
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
    "banal not found: /c/banal — `npx rpp toolchain` installs it",
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
