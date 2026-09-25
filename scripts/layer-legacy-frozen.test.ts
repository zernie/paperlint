/**
 * The legacy-exemption ratchet (`layer-legacy-frozen.mjs`): each of its refusals fires on a planted
 * case and stays silent on the matching clean one. The inputs are ESLint's own result shape, so the
 * tally is tested on what the linter reports, not on source text.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { judge, tally, type Suppressed } from "./layer-legacy-frozen.mjs";

const IO = "legacy I/O, moves behind a port in #76";
const LAYER = "legacy layer, moves behind a port in #76";

/** One file's result with a suppressed finding per `[rule, justification]`. */
const result = (filePath: string, ...s: [string, string][]): Suppressed => ({
  filePath,
  suppressedMessages: s.map(([ruleId, justification], i) => ({
    ruleId,
    line: i + 1,
    suppressions: [{ justification }],
  })),
});

const BUILD = result(
  "src/build.ts",
  ["boundaries/dependencies", IO],
  ["boundaries/dependencies", LAYER],
  ["no-restricted-globals", IO],
);
const FROZEN = {
  "src/build.ts": { "boundaries/dependencies": 2, "no-restricted-globals": 1 },
};

const problemsOf = (results: Suppressed[], frozen = FROZEN) =>
  judge({ ...tally(results), frozen });

test("counts per file and rule, and a tally equal to the frozen list is clean", () => {
  assert.deepEqual(tally([BUILD]).counts, FROZEN);
  assert.deepEqual(problemsOf([BUILD]), []);
});

test("a legacy suppression in a file the list does not name is a new exemption", () => {
  const p = problemsOf([
    BUILD,
    result("src/new.ts", ["boundaries/dependencies", IO]),
  ]);
  assert.equal(p.length, 1);
  assert.match(p[0] ?? "", /^src\/new\.ts: a new legacy layer exemption/);
});

test("a count that grew fails, and so does a rule the file was not frozen with", () => {
  const grown = result(
    "src/build.ts",
    ["boundaries/dependencies", IO],
    ["boundaries/dependencies", IO],
    ["boundaries/dependencies", IO],
    ["no-restricted-globals", IO],
  );
  assert.match(
    problemsOf([grown]).join("\n"),
    /3 legacy boundaries\/dependencies suppressions, frozen at 2/,
  );
  const newRule = judge({
    ...tally([BUILD]),
    frozen: { "src/build.ts": { "boundaries/dependencies": 2 } },
  });
  assert.match(
    newRule.join("\n"),
    /no-restricted-globals suppression\(s\), frozen at 0/,
  );
});

test("a count that shrank fails until the frozen number is lowered, and a fixed file must leave", () => {
  const shrunk = result(
    "src/build.ts",
    ["boundaries/dependencies", IO],
    ["no-restricted-globals", IO],
  );
  assert.match(problemsOf([shrunk]).join("\n"), /lower it to 1/);
  assert.match(
    problemsOf([]).join("\n"),
    /src\/build\.ts: no legacy boundaries\/dependencies suppression left/,
  );
});

test("no file inside the new folders may carry one, even if someone froze it", () => {
  for (const f of [
    "src/domain/x.ts",
    "src/ports/x.ts",
    "src/adapters/banal/x.ts",
  ]) {
    const p = problemsOf([BUILD, result(f, ["boundaries/dependencies", IO])], {
      ...FROZEN,
      [f]: { "boundaries/dependencies": 1 },
    });
    assert.equal(p.length, 1, p.join("\n"));
    assert.match(p[0] ?? "", /written under the rules/);
  }
});

test("a layer finding silenced without naming #76 is reported; other rules' suppressions are not counted", () => {
  const r = result(
    "src/build.ts",
    ["boundaries/dependencies", IO],
    ["boundaries/dependencies", LAYER],
    ["no-restricted-globals", IO],
    ["boundaries/dependencies", "temporary"],
    ["@typescript-eslint/no-explicit-any", "#49: replace with a real type"],
  );
  const p = problemsOf([r]);
  assert.equal(p.length, 1, p.join("\n"));
  assert.match(
    p[0] ?? "",
    /src\/build\.ts:4: boundaries\/dependencies is silenced with "temporary"/,
  );
});
