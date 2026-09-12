/**
 * consumer.harness.mjs — every rung of `ledgerPath()`, both directions, plus the two path facts
 * the move into a package depends on.
 *
 * `npx vigiles test skills/paper-pipeline/scripts/consumer.harness.mjs`
 *
 * 🔴 WHY THIS FILE IS NOT OPTIONAL. The resolutions in `consumer.mjs` all fail in the SILENT
 * direction when they are wrong: a bad ledger path still accepts appends, a bad main guard still
 * exits 0, a bad root still hashes a missing directory to a stable value. None of them produce an
 * error, and every one of them produces a run that reads as success. So each is asserted here in
 * BOTH directions — fires when it should, silent when it should — because an assertion that only
 * ever sees the good case cannot tell a working resolver from a constant.
 *
 * Assertions run at module top level: `vigiles test` treats "did not throw" as a pass.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  CONFIG_KEY,
  consumerRoot,
  consumerSkillsDir,
  insideNodeModules,
  isMain,
  ledgerPath,
} from "./consumer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TMP = mkdtempSync(join(tmpdir(), "consumer-harness-"));
process.on("exit", () => rmSync(TMP, { recursive: true, force: true }));

/** A throwaway consumer repository with the given `research-paper-pipeline` block (or none). */
function fakeConsumer(block) {
  const root = mkdtempSync(join(TMP, "repo-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify(block === undefined ? { name: "x" } : { name: "x", [CONFIG_KEY]: block }),
  );
  return root;
}
/** A directory that looks like an installed copy of this package. */
function installedDir(root) {
  const d = join(root, "node_modules", "research-paper-pipeline", "skills", "pp", "scripts");
  mkdirSync(d, { recursive: true });
  return d;
}

// ── I. RUNG 1 — the environment wins, and it wins over a declaration ─────────────────────────
{
  const root = fakeConsumer({ ledger: "declared/here.jsonl" });
  const env = { PIPELINE_LEDGER: join(root, "from-env.jsonl") };
  assert.equal(
    ledgerPath(installedDir(root), { env, cwd: root }),
    resolve(join(root, "from-env.jsonl")),
    "PIPELINE_LEDGER did not win. It must outrank everything: harnesses set it BEFORE importing " +
      "the ledger precisely so fixture rows cannot reach real history, and a declaration on disk " +
      "that could override it would put them there.",
  );
  // The other direction: with the variable gone, the same call must move to the next rung.
  assert.equal(
    ledgerPath(installedDir(root), { env: {}, cwd: root }),
    resolve(root, "declared/here.jsonl"),
    "without PIPELINE_LEDGER the declaration must be used — otherwise rung 1 is not a rung, it " +
      "is the only path, and this assertion pair proves nothing about precedence.",
  );
}

// ── II. RUNG 2 — the consumer's declaration, resolved against the consumer root ───────────────
{
  const root = fakeConsumer({ ledger: "docs/pipeline-runs.jsonl" });
  assert.equal(
    ledgerPath(installedDir(root), { env: {}, cwd: root }),
    join(root, "docs/pipeline-runs.jsonl"),
    "a declared relative ledger must resolve against the consumer root, not against the cwd of " +
      "whatever process happened to start",
  );
  // 🔴 `null` is a keystroke, not an absence. `?? DEFAULT` would read it as "nothing declared"
  // and silently use another file — the same distinction `papersRoot()` makes.
  assert.throws(
    () => ledgerPath(installedDir(root), { env: {}, cwd: fakeConsumer({ ledger: null }) }),
    /must be a non-empty string/,
    'a `"ledger": null` was accepted. Anything written down must be usable; only ABSENCE may ' +
      "fall through to the next rung.",
  );
  assert.throws(
    () => ledgerPath(installedDir(root), { env: {}, cwd: fakeConsumer({ ledger: "" }) }),
    /must be a non-empty string/,
    "an empty declared ledger was accepted; it resolves to the consumer root itself",
  );
}

// ── III. RUNG 3 — beside the file, but NEVER inside node_modules ──────────────────────────────
{
  const root = fakeConsumer(undefined);
  // Developing the package in its own checkout: the default is legitimate.
  const own = mkdtempSync(join(TMP, "checkout-"));
  assert.equal(
    ledgerPath(own, { env: {}, cwd: root }),
    join(own, "runs.jsonl"),
    "outside node_modules and with nothing declared, the ledger belongs beside the module",
  );
  // Installed as a dependency with nothing declared: refusing is the whole point.
  let err;
  try {
    ledgerPath(installedDir(root), { env: {}, cwd: root });
  } catch (e) {
    err = e;
  }
  assert.ok(
    err,
    "🔴 ledgerPath RETURNED A PATH INSIDE node_modules. Appending there SUCCEEDS, so the rows " +
      "look recorded until the next `npm ci` deletes them — silent data loss with no error at " +
      "any point. This must throw.",
  );
  assert.match(
    err.message,
    /"ledger"/,
    "the refusal must name the key to declare. An error that states the problem without the cure " +
      "gets worked around by whoever hits it.",
  );
  assert.match(
    err.message,
    /package\.json/,
    "the refusal must name the file the key goes in",
  );
}

// ── IV. `insideNodeModules` is SEGMENT-WISE, not a substring ──────────────────────────────────
assert.equal(insideNodeModules(join("a", "node_modules", "b")), true, "a real install went undetected");
assert.equal(
  insideNodeModules(join("a", "my-node_modules-inspector", "b")),
  false,
  "a directory whose NAME merely contains `node_modules` was treated as an install — that " +
    "consumer would be refused its own ledger for a naming coincidence",
);
assert.equal(insideNodeModules(join("a", "b")), false, "a plain path was reported as installed");

// ── V. `consumerRoot` prefers the harness-provided root over the cwd ──────────────────────────
assert.equal(
  consumerRoot({ env: { CLAUDE_PROJECT_DIR: "/x/y" }, cwd: "/somewhere/else" }),
  "/x/y",
  "CLAUDE_PROJECT_DIR must win: a hook or an editor can start the process anywhere, and the cwd " +
    "then names the wrong repository",
);
assert.equal(
  consumerRoot({ env: {}, cwd: "/somewhere/else" }),
  "/somewhere/else",
  "without the variable the cwd is the answer — every documented invocation is typed from the root",
);
assert.equal(
  consumerSkillsDir({ env: {}, cwd: "/r" }),
  join("/r", ".claude", "skills"),
  "the skills directory must hang off the consumer root",
);

// ── VI. 🔴 `isMain` THROUGH A SYMLINK — the measurement the whole move rests on ────────────────
// Node resolves the entry point to its REALPATH but leaves `process.argv[1]` as typed. The idiom
// `import.meta.url === `file://${process.argv[1]}`` is therefore FALSE when a script is reached
// through a symlink — and false silently: the process exits 0 having run no CLI at all. Nine
// scripts in this directory are reached exactly that way by a consumer.
{
  const root = mkdtempSync(join(TMP, "symlink-"));
  const real = join(root, "node_modules", "pkg", "scripts");
  mkdirSync(real, { recursive: true });
  const link = join(root, "linked");
  symlinkSync(real, link, "dir");

  const probe = join(real, "probe.mjs");
  writeFileSync(
    probe,
    `import { isMain } from ${JSON.stringify(join(HERE, "consumer.mjs"))};\n` +
      "const legacy = import.meta.url === `file://${process.argv[1]}`;\n" +
      'console.log(JSON.stringify({ isMain: isMain(import.meta.url), legacy }));\n',
  );

  const read = (p) => {
    const r = spawnSync(process.execPath, [p], { encoding: "utf8" });
    assert.equal(r.status, 0, `probe failed: ${r.stderr}`);
    return JSON.parse(r.stdout);
  };

  const direct = read(probe);
  const viaLink = read(join(link, "probe.mjs"));

  assert.equal(direct.isMain, true, "isMain was false when the file WAS run directly");
  assert.equal(
    viaLink.isMain,
    true,
    "🔴 isMain is false through a symlink — every CLI in this directory would exit 0 doing " +
      "nothing when a consumer runs it at the path its own skills document.",
  );
  // The other half, and it is what makes the case above worth asserting rather than assuming:
  // the idiom this replaced really does break here. If this ever passes, the measurement that
  // justifies `isMain` has changed and the function can go.
  assert.equal(
    viaLink.legacy,
    false,
    "the legacy `file://${argv[1]}` guard now WORKS through a symlink. Node's behaviour changed; " +
      "re-measure before keeping isMain, because its whole reason to exist was this line.",
  );
  assert.equal(direct.legacy, true, "the legacy guard failed even directly — the probe is wrong");
}

// ── VII. imported, not executed ───────────────────────────────────────────────────────────────
assert.equal(
  isMain(import.meta.url) && !process.argv[1].endsWith("consumer.harness.mjs"),
  false,
  "isMain claimed a module was the entry point while something else was",
);

console.log(
  "✓ consumer: three rungs each proved in both directions, node_modules refused, symlinked main guard held",
);
