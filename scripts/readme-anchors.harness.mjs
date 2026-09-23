/**
 * Both halves for `readme-anchors.mjs`: it FIRES on a planted pointer to a heading that does not
 * exist, and stays QUIET on the real tree — plus the two ways it could go hollow: a string
 * literal counted as a pointer (a test planting a bad anchor in a string would turn the gate red
 * for nothing), and zero pointers read as a pass.
 *
 * ⚠️ Assertions at the TOP LEVEL: `vigiles test` imports the file and counts "did not throw"
 * as a pass.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "readme-anchors.mjs");
const { anchorsOf, commentsOf, pointersIn, checkAnchors } = await import(
  SCRIPT
);

let n = 0;
const check = (label, cond) => {
  n++;
  assert.ok(cond, label);
};

// ── the anchors are GitHub's, not a guess ─────────────────────────────────────────────────
const anchors = anchorsOf(
  "# Top\n\n## Install and set up\n\n## What `rpp init` writes\n\n## Commands\n\n### Commands\n",
);
check(
  "headings become GitHub's anchors — inline code keeps its text, punctuation goes",
  anchors.includes("install-and-set-up") &&
    anchors.includes("what-rpp-init-writes"),
);
check(
  "a repeated heading gets GitHub's -1 suffix, not the same anchor twice",
  anchors.includes("commands") && anchors.includes("commands-1"),
);

// ── only COMMENTS carry pointers ──────────────────────────────────────────────────────────
const src = [
  "// Documented in README.md#install-and-set-up — update it when this changes.",
  "/** block: README.md#commands */",
  'const s = "README.md#in-a-string";',
  "const t = `README.md#in-a-template`;",
  "// another file: docs/README.md#elsewhere",
  "function f() {",
  "  return 1;",
  "  // before a closing brace: README.md#tail",
  "}",
].join("\n");
const found = pointersIn(commentsOf(src, "x.mjs")).map((p) => p.anchor);
check(
  "line and block comments are read, including one attached to no statement",
  found.includes("install-and-set-up") &&
    found.includes("commands") &&
    found.includes("tail"),
);
check(
  "🔴 a string or template literal is NOT a pointer — the parser tells them apart",
  !found.includes("in-a-string") && !found.includes("in-a-template"),
);
check(
  "another file's README (docs/README.md#…) is not this one's",
  !found.includes("elsewhere"),
);
check(
  "a TypeScript file parses as TypeScript",
  pointersIn(
    commentsOf("// README.md#x\nexport const a: number = 1;\n", "x.ts"),
  ).length === 1,
);

// ── the real tree is clean, and has something to check ────────────────────────────────────
const real = checkAnchors();
check(
  "🔴 the real tree: at least the two install/new pointers, and none broken",
  real.pointers.length >= 2 && real.broken.length === 0,
);

// ── a planted tree: the fire half, and the empty half, through the real entry point ───────
const work = realpathSync(mkdtempSync(join(tmpdir(), "rpp-anchors-")));
try {
  writeFileSync(join(work, "README.md"), "# T\n\n## Real heading\n");
  mkdirSync(join(work, "src"));
  const run = () =>
    spawnSync(process.execPath, [SCRIPT, work], { encoding: "utf8" });

  const empty = run();
  check(
    "🔴 zero pointers is a FAILURE — nothing checked is not everything passing",
    empty.status === 1 && /nothing was checked/.test(empty.stderr),
  );

  writeFileSync(
    join(work, "src", "a.ts"),
    "// Documented in README.md#missing-one — update it when this changes.\nexport {};\n",
  );
  const bad = run();
  check(
    "🔴 a pointer to a heading that does not exist FAILS, naming file, line and anchor",
    bad.status === 1 &&
      /src\/a\.ts:1 {2}README\.md#missing-one/.test(bad.stderr),
  );

  writeFileSync(
    join(work, "src", "a.ts"),
    "// Documented in README.md#real-heading — update it when this changes.\nexport {};\n",
  );
  const good = run();
  check(
    "and a pointer to a real heading passes",
    good.status === 0 && /every anchor resolves/.test(good.stdout),
  );

  mkdirSync(join(work, "node_modules", "x"), { recursive: true });
  writeFileSync(
    join(work, "node_modules", "x", "i.js"),
    "// README.md#someone-elses\n",
  );
  check("node_modules is not this package's code", run().status === 0);
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(
  `✓ ${String(n)} assertions passed — README pointers in code resolve`,
);
