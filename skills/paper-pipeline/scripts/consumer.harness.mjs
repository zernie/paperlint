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
 *
 * Parts VIII-X cover the fourth carrier, `scriptsRoot()`. It fails in the same silent direction
 * as the rest and worse: its value is a PREFIX a caller filters prose with, so a wrong one
 * matches nothing and every check built on it reports zero findings.
 */
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  CONFIG_KEY,
  DEFAULT_SCRIPTS_ROOT,
  consumerRoot,
  consumerSkillsDir,
  insideNodeModules,
  installedSkills,
  isMain,
  ledgerPath,
  pipelineScripts,
  scriptsRoot,
  PACKAGE_NAME,
} from "./consumer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// ── THE PACKAGE NAME HAS ONE SOURCE, AND IT MATCHES THE MANIFEST ─────────────────────────────
// Every path into the installed package is built from PACKAGE_NAME. Two files cannot import it
// and spell it themselves: the manifest, and the hook wiring (JSON). Both are checked here.
{
  const root = resolve(HERE, "..", "..", "..");
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(
    manifest.name,
    PACKAGE_NAME,
    "package.json `name` and PACKAGE_NAME in consumer.mjs must agree",
  );
  assert.deepEqual(
    Object.keys(manifest.bin ?? {}),
    [PACKAGE_NAME],
    "the package exposes exactly one command, named like the package",
  );
  const wiring = JSON.parse(
    readFileSync(join(root, "plugin", "hooks", "hooks.json"), "utf8"),
  );
  const commands = Object.values(wiring.hooks ?? {})
    .flat()
    .flatMap((e) => e.hooks ?? [])
    .map((h) => h.command);
  assert.ok(
    commands.length > 0 &&
      commands.every((c) =>
        c.includes(`/node_modules/${PACKAGE_NAME}/bin/rpp.mjs`),
      ),
    `every command in plugin/hooks/hooks.json runs node_modules/${PACKAGE_NAME}/bin/rpp.mjs`,
  );
}
const TMP = realpathSync(mkdtempSync(join(tmpdir(), "consumer-harness-")));
process.on("exit", () => rmSync(TMP, { recursive: true, force: true }));

/** A throwaway consumer repository with the given `paperlint` block (or none). */
function fakeConsumer(block) {
  const root = mkdtempSync(join(TMP, "repo-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify(
      block === undefined ? { name: "x" } : { name: "x", [CONFIG_KEY]: block },
    ),
  );
  return root;
}
/** A directory that looks like an installed copy of this package. */
function installedDir(root) {
  const d = join(root, "node_modules", "paperlint", "skills", "pp", "scripts");
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
    () =>
      ledgerPath(installedDir(root), {
        env: {},
        cwd: fakeConsumer({ ledger: null }),
      }),
    /must be a non-empty string/,
    'a `"ledger": null` was accepted. Anything written down must be usable; only ABSENCE may ' +
      "fall through to the next rung.",
  );
  assert.throws(
    () =>
      ledgerPath(installedDir(root), {
        env: {},
        cwd: fakeConsumer({ ledger: "" }),
      }),
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
assert.equal(
  insideNodeModules(join("a", "node_modules", "b")),
  true,
  "a real install went undetected",
);
assert.equal(
  insideNodeModules(join("a", "my-node_modules-inspector", "b")),
  false,
  "a directory whose NAME merely contains `node_modules` was treated as an install — that " +
    "consumer would be refused its own ledger for a naming coincidence",
);
assert.equal(
  insideNodeModules(join("a", "b")),
  false,
  "a plain path was reported as installed",
);

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
      "console.log(JSON.stringify({ isMain: isMain(import.meta.url), legacy }));\n",
  );

  const read = (p) => {
    const r = spawnSync(process.execPath, [p], { encoding: "utf8" });
    assert.equal(r.status, 0, `probe failed: ${r.stderr}`);
    return JSON.parse(r.stdout);
  };

  const direct = read(probe);
  const viaLink = read(join(link, "probe.mjs"));

  assert.equal(
    direct.isMain,
    true,
    "isMain was false when the file WAS run directly",
  );
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
  assert.equal(
    direct.legacy,
    true,
    "the legacy guard failed even directly — the probe is wrong",
  );
}

// ── VII. imported, not executed ───────────────────────────────────────────────────────────────
assert.equal(
  isMain(import.meta.url) && !process.argv[1].endsWith("consumer.harness.mjs"),
  false,
  "isMain claimed a module was the entry point while something else was",
);

// ── VIII. THE FOURTH CARRIER — declared wins, absent falls back to the default ────────────────
// Both directions in one block on purpose: a resolver that returned the declaration for every
// input and a resolver that returned the default for every input each pass HALF of this pair,
// and half of a pair is a constant wearing a function's name.
{
  const declaredRoot = fakeConsumer({ scripts: "tools/pipeline" });
  mkdirSync(join(declaredRoot, "tools", "pipeline"), { recursive: true });

  // 🔴 RELATIVE, AND `/`-SEPARATED, ASSERTED BEFORE THE EQUALITIES BELOW — and the order is a
  // finding, not a preference. `assert` aborts at the first failure, so with this line placed
  // after them a resolver that returned an absolute path died on "must be returned as written":
  // the mutation run reported RED-but-a-DIFFERENT-case, i.e. this assertion was never reached and
  // nothing showed it can fail. The narrow property goes first; the equalities then cover the rest.
  // The value is compared against text a human typed inside a SKILL.md, so an absolute path makes
  // every `startsWith` false — not an error, an empty loop body.
  assert.equal(
    isAbsolute(scriptsRoot({ env: {}, cwd: declaredRoot })),
    false,
    "scriptsRoot returned an ABSOLUTE path. Callers match it against prose, so every comparison " +
      "would be false and every check built on it would silently examine nothing.",
  );

  assert.equal(
    scriptsRoot({ env: {}, cwd: declaredRoot }),
    "tools/pipeline",
    "a declared scripts path must be returned as written",
  );

  const defaultRoot = fakeConsumer(undefined);
  mkdirSync(join(defaultRoot, DEFAULT_SCRIPTS_ROOT), { recursive: true });
  assert.equal(
    scriptsRoot({ env: {}, cwd: defaultRoot }),
    DEFAULT_SCRIPTS_ROOT,
    "with nothing declared the customary location must be used — otherwise every consumer that " +
      "keeps the symlink where the prose already looks would have to say so",
  );

  // CLAUDE_PROJECT_DIR outranks the cwd here too, for the reason it does in consumerRoot: a hook
  // or an editor starts the process wherever it likes.
  assert.equal(
    scriptsRoot({
      env: { CLAUDE_PROJECT_DIR: declaredRoot },
      cwd: defaultRoot,
    }),
    "tools/pipeline",
    "the declaration must be read from CLAUDE_PROJECT_DIR when it is set, not from the cwd",
  );
}

// ── IX. THE FOURTH CARRIER — the two refusals, each checked for its CURE ──────────────────────
{
  // 1. A value that resolves inside node_modules. This is the tempting wrong fix after the move,
  //    and it is how the DEFAULT fails as well: with the process started inside the installed
  //    package and CLAUDE_PROJECT_DIR unset, the consumer root is itself under node_modules.
  const root = fakeConsumer({
    scripts: "node_modules/paperlint/skills/pp/scripts",
  });
  mkdirSync(
    join(root, "node_modules", "paperlint", "skills", "pp", "scripts"),
    {
      recursive: true,
    },
  );
  let err;
  try {
    scriptsRoot({ env: {}, cwd: root });
  } catch (e) {
    err = e;
  }
  assert.ok(
    err,
    "🔴 scriptsRoot ACCEPTED a path inside node_modules — and the directory exists, so nothing " +
      "else would have complained. `npm ci` deletes that tree, and a skill's prose would name a " +
      "path the repository does not track.",
  );
  assert.match(
    err.message,
    /node_modules/,
    "the refusal must say what is wrong with the path",
  );
  assert.match(
    err.message,
    /symlink/,
    "the refusal must carry the cure — the symlink is what keeps the documented path working",
  );

  // The same failure reached through the DEFAULT: nothing declared, root under node_modules.
  const installed = installedDir(fakeConsumer(undefined));
  mkdirSync(join(installed, DEFAULT_SCRIPTS_ROOT), { recursive: true });
  assert.throws(
    () => scriptsRoot({ env: {}, cwd: installed }),
    /node_modules/,
    "the default resolved under node_modules and was accepted. A consumer root inside an " +
      "installed package is the one case where the default is wrong, and it is silent.",
  );

  // 2. A value that is not on disk at all — the wrong-prefix case, which produces no findings
  //    rather than wrong ones.
  let missing;
  try {
    scriptsRoot({ env: {}, cwd: fakeConsumer({ scripts: "tools/nope" }) });
  } catch (e) {
    missing = e;
  }
  assert.ok(
    missing,
    "🔴 scriptsRoot accepted a path that does not exist. Callers use it as a PREFIX: a wrong one " +
      "matches no instruction, so every check reports zero findings and exits 0 — byte-identical " +
      "to a corpus that was examined and passed.",
  );
  assert.match(
    missing.message,
    /"scripts"/,
    "the refusal must name the key to fix",
  );
  assert.match(
    missing.message,
    /package\.json/,
    "the refusal must name the file the key goes in",
  );

  // And the default's version of that message must say the default was used — otherwise someone
  // who declared nothing goes looking in package.json for a line that is not there.
  assert.throws(
    () => scriptsRoot({ env: {}, cwd: fakeConsumer(undefined) }),
    /Nothing was declared/,
    "a missing default must say it WAS the default; the declared-value message sends the reader " +
      "to a key that does not exist",
  );

  // 3. Anything written down must be usable; only ABSENCE may fall through to the default.
  assert.throws(
    () => scriptsRoot({ env: {}, cwd: fakeConsumer({ scripts: null }) }),
    /must be a non-empty string/,
    'a `"scripts": null` was accepted. `?? DEFAULT` reads an explicit null as an absence, which ' +
      "is a typed keystroke being ignored.",
  );
  assert.throws(
    () => scriptsRoot({ env: {}, cwd: fakeConsumer({ scripts: "" }) }),
    /must be a non-empty string/,
    "an empty scripts path was accepted; it resolves to the consumer root itself, so the prefix " +
      "would match every command in every skill",
  );
}

// ── X. THE SCRIPT NAMES ARE DERIVED, NOT RESTATED ─────────────────────────────────────────────
// The names belong to this package; a consumer that spelled them out would keep its copy in step
// by hand. The trailing slash on `prefix` is load-bearing: without it the prefix also matches a
// SIBLING directory whose name merely starts with the root's.
{
  const s = pipelineScripts("a/b");
  // The boundary is asserted BEFORE the literal equality for the same reason part VIII reorders:
  // `assert` aborts at the first failure, and a prefix that lost its slash died on "must end in a
  // separator" — leaving the assertion that states WHY the slash matters unreached and unproven.
  assert.equal(
    "a/b-other/ledger.mjs".startsWith(s.prefix),
    false,
    "the prefix matched a sibling directory sharing the root's name — drop the trailing slash " +
      "and every such path is mistaken for a pipeline script",
  );
  assert.equal(
    "a/b/ledger.mjs".startsWith(s.prefix),
    true,
    "the prefix failed on a real member",
  );
  assert.equal(s.prefix, "a/b/", "prefix must end in a separator");
  assert.equal(s.announce, "a/b/announce.mjs");
  assert.equal(s.ledger, "a/b/ledger.mjs");

  // EXACTLY ONE slash, whatever the consumer typed. `scriptsRoot()` returns the declaration
  // verbatim, so a trailing slash in package.json arrives here intact; `${root}/` would then give
  // `a/b//`, which matches nothing — the silent direction again.
  const typedSlash = pipelineScripts("a/b/");
  assert.equal(
    typedSlash.prefix,
    "a/b/",
    'a declared trailing slash doubled the separator. `"scripts": "tools/pipeline/"` is a normal ' +
      "thing to write, and the doubled prefix matches no instruction at all.",
  );
  assert.equal(
    typedSlash.ledger,
    "a/b/ledger.mjs",
    "the script paths doubled the separator too",
  );
}

// ── XI. WHICH SKILLS ARE INSTALLED — a link counts, a dangling link is REFUSED (rpp#62) ────────
// `paperlint init` installs every skill as a SYMLINK `.claude/skills/<name> -> …/skills/<name>`. A
// `Dirent` from `readdirSync(…, { withFileTypes: true })` describes the entry ITSELF and does not
// follow links, so `e.isDirectory()` is false for every one of them: the eval preflights that
// asked this question that way saw ZERO installed skills in every consumer and refused to start.
// The tree below is built on disk, not faked — the property under test is how the filesystem
// answers, and a stub would test the stub.
{
  const home = join(TMP, "skills-home");
  const store = join(TMP, "skills-store");
  const skill = (dir, name) => {
    mkdirSync(join(dir, name), { recursive: true });
    writeFileSync(join(dir, name, "SKILL.md"), `---\nname: ${name}\n---\n`);
  };
  mkdirSync(home, { recursive: true });
  skill(home, "real-dir"); //                        an ordinary directory
  skill(store, "linked"); //                         the shape `paperlint init` makes: a RELATIVE link
  symlinkSync(
    join("..", "skills-store", "linked"),
    join(home, "linked"),
    "dir",
  );
  mkdirSync(join(home, "not-a-skill")); //           a directory without SKILL.md
  mkdirSync(join(store, "linked-not-a-skill"));
  symlinkSync(
    join(store, "linked-not-a-skill"),
    join(home, "linked-not-a-skill"),
    "dir",
  );
  writeFileSync(join(home, "README.md"), "a file, not a skill\n");

  const names = installedSkills(home);
  assert.ok(
    names.includes("linked"),
    "a SYMLINKED skill was not counted as installed. This is rpp#62: `paperlint init` installs every " +
      "skill as a link, so a reader that does not follow links sees none of them in any consumer.",
  );
  assert.deepEqual(
    names,
    ["linked", "real-dir"],
    "installedSkills must return exactly the entries that lead to a directory holding SKILL.md, " +
      "sorted — a directory or link without SKILL.md, or a plain file, is not a skill",
  );

  // 🔴 The dangling link: its target is gone (a skill dropped by an upgrade, a moved store). It is
  // neither skipped — that would read as "not installed", sending the reader after the wrong
  // cause — nor counted, which would hand a caller a skill whose SKILL.md cannot be opened.
  symlinkSync(join("..", "skills-store", "gone"), join(home, "gone"), "dir");
  let err;
  try {
    installedSkills(home);
  } catch (e) {
    err = e;
  }
  assert.ok(
    err,
    "a DANGLING skill link was silently accepted. It must be refused by name — skipped, it reads " +
      "as a skill that was never installed; counted, it is a skill whose SKILL.md cannot be read.",
  );
  assert.equal(err.code, "DANGLING_SKILL_LINK", `wrong error: ${err.message}`);
  assert.deepEqual(
    err.dangling.map((d) => d.name),
    ["gone"],
    "the refusal must name exactly the dangling entries",
  );
  assert.match(
    err.message,
    /gone -> \.\.[/\\]skills-store[/\\]gone/,
    "the refusal must say where the dangling link points — that is the cure's first half",
  );
  // The other direction: remove it and the same directory answers again.
  rmSync(join(home, "gone"));
  assert.deepEqual(installedSkills(home), ["linked", "real-dir"]);

  // A link that cannot be resolved for another reason (a loop) is refused the same way.
  symlinkSync("loop", join(home, "loop"));
  assert.throws(
    () => installedSkills(home),
    (e) => e.code === "DANGLING_SKILL_LINK" && /loop/.test(e.message),
    "a link that cannot be resolved (ELOOP) was not refused",
  );
  rmSync(join(home, "loop"));
}

console.log(
  "✓ consumer: three rungs each proved in both directions, node_modules refused, symlinked main guard held, " +
    "scripts root declared/default/refused, installed skills follow links and refuse dangling ones",
);
