/**
 * Both halves of `scripts/readme-numbers.mjs`, plus a third that makes the number check meaningful: it must
 * know how to COUNT CORRECTLY itself.
 *
 * 🔴 Two bugs in this script were caught not by eye, but by divergence from independent commands, and
 * both are nailed down here as assertions:
 *   1. rule counting accepted only the form `{ rules: {…} }` and SILENTLY dropped `tex-build.mjs`
 *      (rules directly in `default`) into "not a plugin" — confident 8 instead of 10;
 *   2. tree walk used `statSync`, meaning VIA SYMLINKS, and 24 links `.claude/skills/*` →
 *      `skills/*` gave 83 harnesses instead of 49.
 * Both are "a counter counting what it ignores": a miss says nothing, a counter does.
 */
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const {
  countFiles,
  countRules,
  declaredCounts,
  actualCounts,
  actualNode,
  declaredNode,
  nodeFindings,
  DECLARING_FILES,
} = await import(join(HERE, "readme-numbers.mjs"));

let n = 0;
const check = (label, cond) => {
  assert.ok(cond, label);
  n++;
};

// ── marks in prose ───────────────────────────────────────────────────────────────────────────
const d = declaredCounts(
  "text <!-- count:rules -->10 and also <!--count:skills-->24 tail",
);
check(
  "marks are read, spaces inside are not required",
  d.rules === 10 && d.skills === 24,
);
// A number AS A WORD cannot be compared — exactly why README diverged. The assertion fixes that
// such form does NOT count as a declaration.
check(
  "a number as a word is not a declaration",
  Object.keys(declaredCounts("Forty-five of those.")).length === 0,
);
check(
  "text without marks gives an empty set — CLI exits with code 1 on this",
  Object.keys(declaredCounts("# README\n\nno numbers")).length === 0,
);
// 🔴 A COUNTER NAME MAY CARRY A DIGIT, and this is not cosmetic. `e2e` is the name of a real
// counter in `actualCounts`; under `[a-z]+` the pattern matched `e`, then wanted `-->` and found
// `2`, so `docs/e2e.md` declared the number and the check reported it as declared NOWHERE. The
// charset was a second, narrower, unstated definition of what a counter may be called.
check(
  "a counter whose name carries a digit is read",
  declaredCounts("there are <!-- count:e2e -->2 of them").e2e === 2,
);

// ── tree walk does not follow symlinks ───────────────────────────────────────────────────────
{
  // 🔴 `realpathSync` around `mkdtempSync`: on macOS `/var` itself is a symlink to `/private/var`, and without
  // it, path comparison catches two spellings of one directory. This case already sits as a separate
  // issue (#9) on three repository harnesses — here it is intentionally not reproduced.
  const root = realpathSync(mkdtempSync(join(tmpdir(), "readme-nums-")));
  try {
    mkdirSync(join(root, "real"), { recursive: true });
    writeFileSync(join(root, "real", "a.harness.mjs"), "");
    writeFileSync(join(root, "real", "b.harness.mjs"), "");
    check("counts real files", countFiles(root, ".harness.mjs") === 2);

    symlinkSync(join(root, "real"), join(root, "mirror"), "dir");
    check(
      "SYMLINK to directory does not double the count — it is not a new directory",
      countFiles(root, ".harness.mjs") === 2,
    );

    // 🔴 SECOND TYPE of link, and it was not here — a mutation caught it, not me. A link to a DIRECTORY
    // is filtered by the fact that `lstat` does not call it a directory; a separate guard
    // `isSymbolicLink()` is needed for a link to a FILE with the right suffix — it would pass
    // the `endsWith` check and double the count. Without this assertion the guard looks like dead code.
    symlinkSync(
      join(root, "real", "a.harness.mjs"),
      join(root, "link.harness.mjs"),
    );
    check(
      "SYMLINK to a harness file also does not double the count",
      countFiles(root, ".harness.mjs") === 2,
    );

    mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(root, "node_modules", "pkg", "c.harness.mjs"), "");
    check(
      "node_modules is not counted",
      countFiles(root, ".harness.mjs") === 2,
    );

    // The driver `run-mutations.mjs` ends in `mutations.mjs` but is not a battery:
    // the suffix is checked WITH A DOT. This is what `git grep` got wrong, giving 27 instead of 26.
    writeFileSync(join(root, "real", "run-mutations.mjs"), "");
    writeFileSync(join(root, "real", "x.mutations.mjs"), "");
    check(
      "`run-mutations.mjs` is not a battery — suffix requires a dot",
      countFiles(root, ".mutations.mjs") === 1,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── rule count accepts both forms and DOES NOT stay silent about a third ────────────────────
{
  const root = realpathSync(mkdtempSync(join(tmpdir(), "readme-rules-")));
  try {
    const dir = join(root, "eslint-rules");
    mkdirSync(dir, { recursive: true });
    const rule = "{ meta: { schema: [] }, create() { return {}; } }";
    writeFileSync(
      join(dir, "plugin-shape.mjs"),
      `export default { rules: { a: ${rule}, b: ${rule} } };`,
    );
    writeFileSync(
      join(dir, "bare-shape.mjs"),
      `export default { c: ${rule} };`,
    );
    check(
      "both export forms are counted — plugin and bare rules",
      (await countRules(root)) === 3,
    );

    // The third form — the one the script already failed on silently. Now it is an ERROR.
    writeFileSync(join(dir, "helpers.mjs"), "export const helper = () => 1;");
    let threw = null;
    try {
      await countRules(root);
    } catch (e) {
      threw = e;
    }
    check(
      "an unknown-form module is an ERROR, not a silent skip",
      threw !== null,
    );
    check(
      "and the error NAMES the file, not just complains",
      threw && /helpers\.mjs/.test(threw.message),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── the Node versions: engines.node and the workflows against the README ─────────────────
{
  const root = realpathSync(mkdtempSync(join(tmpdir(), "readme-node-")));
  try {
    const wf = join(root, ".github", "workflows");
    mkdirSync(wf, { recursive: true });
    const pkg = (range) =>
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({ engines: { node: range } }),
      );
    pkg(">=22.13");
    writeFileSync(
      join(wf, "ci.yml"),
      "jobs:\n  gates:\n    steps:\n      - uses: actions/checkout@v7\n      - uses: actions/setup-node@v7\n        with:\n          node-version: 22\n",
    );
    writeFileSync(
      join(wf, "platform.yml"),
      "jobs:\n  macos:\n    steps:\n      - uses: actions/setup-node@v7\n        with:\n          node-version: '24'\n",
    );
    writeFileSync(join(wf, "other.yaml"), "on: push\njobs: {}\n");
    const got = actualNode(root);
    check(
      "actualNode reads the floor out of engines.node",
      got.min === "22.13",
    );
    check(
      "actualNode reads every workflow's node-version, numeric or quoted, sorted",
      JSON.stringify(got.tested) === JSON.stringify(["22", "24"]),
    );

    pkg("^22.13");
    let threw = null;
    try {
      actualNode(root);
    } catch (e) {
      threw = e;
    }
    check(
      'a caret range is refused — "X or newer" would be false for it',
      threw !== null && threw.message.includes("^22.13"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
check(
  "declaredNode reads every node:min and node:tested mark",
  JSON.stringify(
    declaredNode(
      "Node <!-- node:min -->22.13 or newer (tested on <!--node:tested-->22 and <!-- node:tested -->24).",
    ),
  ) === JSON.stringify({ min: ["22.13"], tested: ["22", "24"] }),
);
{
  const actual = { min: "22.13", tested: ["22", "24"] };
  const ok = { min: ["22.13"], tested: ["22", "24"] };
  check(
    "nodeFindings is silent when the marks match",
    nodeFindings(ok, actual).length === 0,
  );
  check(
    "fires: a README minimum that differs from engines.node",
    nodeFindings({ ...ok, min: ["22.12"] }, actual).some((b) =>
      b.includes("22.12"),
    ),
  );
  check(
    "fires: no document declares the minimum at all",
    nodeFindings({ ...ok, min: [] }, actual).length === 1,
  );
  check(
    "fires: a workflow version missing from the tested list",
    nodeFindings({ ...ok, tested: ["22"] }, actual).some((b) =>
      b.includes("runs Node 24"),
    ),
  );
  check(
    "fires: a tested version no workflow runs",
    nodeFindings({ ...ok, tested: ["22", "24", "26"] }, actual).some((b) =>
      b.includes("tested on Node 26"),
    ),
  );
  check(
    "fires: no workflow runs the floor's major",
    nodeFindings(
      { min: ["22.13"], tested: ["24"] },
      { min: "22.13", tested: ["24"] },
    ).some((b) => b.includes("minimum is untested")),
  );
}
{
  // The other half: the real repository is silent.
  const declared = { min: [], tested: [] };
  for (const f of DECLARING_FILES) {
    const d = declaredNode(readFileSync(join(HERE, "..", f), "utf8"));
    declared.min.push(...d.min);
    declared.tested.push(...d.tested);
  }
  const findings = nodeFindings(declared, actualNode());
  check(
    `silent on the real repository (got: ${findings.join(" | ") || "nothing"})`,
    findings.length === 0,
  );
}

// ── on a live tree the numbers are positive and plausible ────────────────────────────────────
const live = await actualCounts();
check(
  "on a live tree all four counters are greater than zero",
  Object.values(live).every((v) => Number.isInteger(v) && v > 0),
);

console.log(
  `✓ ${String(n)} assertions passed — readme-numbers, numbers are produced, not written`,
);
