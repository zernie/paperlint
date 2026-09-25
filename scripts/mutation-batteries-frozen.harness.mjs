/**
 * Colocated test for `scripts/mutation-batteries-frozen.mjs` — the shrink-only guard (#52).
 * Run: `npx vigiles test scripts/mutation-batteries-frozen.harness.mjs`
 *
 * Both halves:
 *   I.  QUIET on this repository — every battery on disk is listed, every listed one exists,
 *       and every count matches. Plus a non-vacuity row: the walk found batteries at all.
 *   II. RED on a planted tree — a new battery, a grown one, a shrunk one, a stale list entry
 *       and an uncountable table are each named; an unchanged battery beside them is not.
 *   III. The case counter on each table shape the repository actually uses.
 *
 * ⚠️ Assertions at the TOP LEVEL: `vigiles test` imports the file and counts "did not throw"
 * as a pass.
 */
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const { checkFrozen, countCases, findBatteries, FROZEN_FILE } = await import(
  join(HERE, "mutation-batteries-frozen.mjs")
);

let n = 0;
const check = (label, cond, detail = "") => {
  n++;
  assert.ok(cond, detail ? `${label}\n${detail}` : label);
};

// ── I. quiet on this repository ─────────────────────────────────────────────────────────
{
  const { problems, found, frozen } = checkFrozen(ROOT);
  check(
    "the walk finds batteries in this repository — otherwise the quiet below proves nothing",
    found.length > 0,
  );
  check(
    "this repository passes: nothing new, nothing grown, nothing stale",
    problems.length === 0,
    problems.join("\n"),
  );
  check(
    "the frozen list names exactly the batteries on disk",
    JSON.stringify(Object.keys(frozen).sort()) === JSON.stringify(found),
  );
}

// ── II. red on a planted tree ───────────────────────────────────────────────────────────
const driverBattery = (k) =>
  `import { runMutations } from "./lib/mutation-driver.mjs";\n` +
  `process.exit(runMutations({ root: ".", cases: [${Array.from({ length: k }, (_, i) => `{ name: "c${String(i)}" }`).join(", ")}] }));\n`;

const TMP = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-frozen-h-")));
process.on("exit", () => rmSync(TMP, { recursive: true, force: true }));
mkdirSync(join(TMP, "scripts"), { recursive: true });
mkdirSync(join(TMP, "src"), { recursive: true });
mkdirSync(join(TMP, "node_modules", "dep"), { recursive: true });
writeFileSync(join(TMP, "src", "same.mutations.mjs"), driverBattery(3));
writeFileSync(join(TMP, "src", "grown.mutations.mjs"), driverBattery(4));
writeFileSync(join(TMP, "src", "shrunk.mutations.mjs"), driverBattery(1));
writeFileSync(join(TMP, "src", "planted.mutations.mjs"), driverBattery(1));
writeFileSync(
  join(TMP, "src", "opaque.mutations.mjs"),
  `const ALL = [{}, {}];\nrunMutations({ cases: ALL.filter(Boolean) });\n`,
);
// Not the repository's own files: a dependency, and a symlinked view of `src/`.
writeFileSync(
  join(TMP, "node_modules", "dep", "theirs.mutations.mjs"),
  driverBattery(9),
);
symlinkSync(join(TMP, "src"), join(TMP, "view"), "dir");
writeFileSync(
  join(TMP, FROZEN_FILE),
  JSON.stringify({
    batteries: {
      "src/same.mutations.mjs": { cases: 3 },
      "src/grown.mutations.mjs": { cases: 2 },
      "src/shrunk.mutations.mjs": { cases: 2 },
      "src/opaque.mutations.mjs": { cases: 2 },
      "src/gone.mutations.mjs": { cases: 5 },
    },
  }),
);
{
  const { problems, found } = checkFrozen(TMP);
  const about = (file) => problems.filter((p) => p.startsWith(`${file}:`));
  const all = problems.join("\n");
  check(
    "the walk skips node_modules and does not follow symlinks — each battery once",
    JSON.stringify(found) ===
      JSON.stringify([
        "src/grown.mutations.mjs",
        "src/opaque.mutations.mjs",
        "src/planted.mutations.mjs",
        "src/same.mutations.mjs",
        "src/shrunk.mutations.mjs",
      ]),
    JSON.stringify(found),
  );
  check(
    "🔴 a NEW battery fails, pointing at #52",
    about("src/planted.mutations.mjs").some((p) =>
      p.includes(
        "new hand-written mutation batteries are not accepted, see #52",
      ),
    ),
    all,
  );
  check(
    "🔴 a battery that GREW fails, naming both counts",
    about("src/grown.mutations.mjs").some(
      (p) => p.includes("4 cases, frozen at 2") && p.includes("#52"),
    ),
    all,
  );
  check(
    "🔴 a listed file that no longer exists fails: remove it from the frozen list",
    about("src/gone.mutations.mjs").some(
      (p) =>
        p.includes("remove it from") &&
        p.includes("the list must shrink with the code"),
    ),
    all,
  );
  check(
    "a battery that SHRANK fails until its recorded count is lowered to the new one",
    about("src/shrunk.mutations.mjs").some((p) =>
      p.includes('lower "cases" to 1'),
    ),
    all,
  );
  check(
    "a table the counter cannot read is a failure, never a guessed number",
    about("src/opaque.mutations.mjs").some((p) =>
      p.includes("cannot be counted"),
    ),
    all,
  );
  check(
    "control: an unchanged battery beside them is not reported",
    about("src/same.mutations.mjs").length === 0,
    all,
  );
  check(
    "exactly the five planted defects, nothing else",
    problems.length === 5,
    all,
  );
}

// ── III. the counter, on each table shape in use ────────────────────────────────────────
const cases = (src) => countCases(src, "x.mutations.mjs");
check("inline `cases: [...]` literal", cases(driverBattery(3)).count === 3);
check(
  "`cases: TABLE.map(...)` counts TABLE",
  cases(
    `const T = [[1], [2], [3], [4]];\nrunMutations({ cases: T.map(([a]) => ({ a })) });`,
  ).count === 4,
);
check(
  "`const CASES = A.map(...)` then `cases: CASES`, and the shorthand `{ cases }`",
  cases(
    `const A = [1, 2];\nconst CASES = A.map((x) => x);\nrunMutations({ cases: CASES });`,
  ).count === 2 &&
    cases(`const cases = [1, 2, 3];\nrunMutations({ root, cases });`).count ===
      3,
);
check(
  "a spread of another const table adds its length",
  cases(`const A = [1, 2];\nrunMutations({ cases: [...A, 3] });`).count === 3,
);
check(
  "a self-contained battery: the loop over M counts, the results loop over `rows = []` does not",
  cases(
    `const M = [["a"], ["b"], ["c"]];\nconst rows = [];\nfor (const [x] of M) rows.push(x);\nfor (const r of rows) console.log(r);`,
  ).count === 3,
);
check(
  "a file with no table is an error, not zero",
  "error" in cases(`console.log("hi");`),
);
check(
  "two driver calls are ambiguous, not summed",
  "error" in
    cases(`runMutations({ cases: [1] });\nrunMutations({ cases: [2] });`),
);
check(
  "findBatteries on this repository matches only `*.mutations.mjs` names",
  findBatteries(ROOT).every((f) => f.endsWith(".mutations.mjs")),
);

console.log(
  `✓ ${String(n)} assertions passed — mutation-batteries-frozen: quiet here, red on a new, grown, shrunk, stale or uncountable battery`,
);
