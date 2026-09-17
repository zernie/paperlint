/**
 * hooks.harness.mjs — the three shipped hooks, each asserted in BOTH halves.
 *
 * 🔴 WHY "BOTH HALVES" IS THE ORGANISING RULE HERE AND NOT A STYLE. Two of these three are
 * ADVISORY: silence is their success state. So "it printed nothing" and "it is dead" look
 * identical from outside, and a harness that only checks the quiet case is green over a corpse.
 * Three hooks in the first consumer were dead for twelve days behind exactly that. Every block
 * below therefore pairs a firing case with a silent one.
 *
 * ── WHAT IS MEASURED: BYTES AND EXIT CODES, NOT THE RETURNED OBJECT ─────────
 * 🔴 The first consumer's harness asserts over the REACTION — the object the pure function
 * returned — and that is why a 184-assertion suite could not see that nine of its nudges were
 * being delivered nowhere. "The hook fired" and "the hook's text landed" are different claims
 * and the second does not follow from the first. Here every assertion reads `exitCode`,
 * `stdout` and `stderr` of a real `run-program`, through `runHook`.
 *
 * ── THE CAPABILITY SURFACE IS ASSERTED ON THE ARTIFACT THAT EXECUTES ────────
 * These hooks ship as `.mjs`, so `vigiles compile` — which normally enforces "a compiled hook
 * may import ONLY `vigiles/hook`" — never sees them. Part I runs that same check,
 * `checkHookImports`, over the shipped files directly. That is STRICTER than compiling a twin
 * `.ts` source would be: a twin can drift from its build, and there is no twin here to drift.
 *
 * Run: `npx vigiles test hooks/hooks.harness.mjs`
 * Killed by: `hooks/hooks.mutations.mjs`
 */
import assert from "node:assert/strict";
import { runHook } from "vigiles";
import { checkHookImports } from "vigiles/hook";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOOKS = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HOOKS, "..");
const CLI = join(ROOT, "node_modules", "vigiles", "dist", "cli.js");
/** `>` built rather than typed: a literal one in this file is a redirection to the guard's own scan. */
const GT = String.fromCharCode(62);

const SHIPPED = readdirSync(HOOKS)
  .filter((f) => f.endsWith(".hook.mjs"))
  .sort();

let n = 0;
const check = (label, cond) => {
  assert.ok(cond, label);
  n++;
};

/**
 * A throwaway consumer repository: a `package.json` with the given block, a papers tree, and
 * `node_modules` wired so both `vigiles/hook` and `require.resolve("<this package>/…")` work
 * from inside it.
 *
 * 🔴 IT IS A REAL DIRECTORY, NOT A MOCK, because what is under test is precisely the part a
 * mock would stub out: whether the hook can READ a declaration out of the consumer's
 * `package.json` via a provider command, and whether a path resolves once this package is
 * installed rather than adjacent. The `node_modules/<pkg>` entry is a symlink to this very
 * checkout, which is what `npm install` of a local package does anyway.
 */
const consumer = (block, { papers = "docs/papers", paper = "alpha" } = {}) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "rpp-hooks-")));
  const nm = join(dir, "node_modules");
  mkdirSync(nm, { recursive: true });
  symlinkSync(join(ROOT, "node_modules", "vigiles"), join(nm, "vigiles"));
  symlinkSync(ROOT, join(nm, "research-paper-pipeline"));
  writeFileSync(
    join(dir, "package.json"),
    block === null ? '{"name":"c","type":"module"}\n' : JSON.stringify({ name: "c", type: "module", ...block }) + "\n",
  );
  if (papers !== null) {
    mkdirSync(join(dir, papers, paper), { recursive: true });
    writeFileSync(
      join(dir, papers, paper, "PIPELINE-STATUS.md"),
      "**Readiness verdict:** ✅ fixture verdict line\n\n| gate | state |\n| study-accepted | ☐ |\n",
    );
  }
  return dir;
};

/** `run-program <hook>` exactly as a consumer's settings block invokes it. */
const program = (name) =>
  `node ${JSON.stringify(CLI)} hook-runtime run-program ${JSON.stringify(join(HOOKS, name + ".hook.mjs"))}`;

const onBash = (command) => ({
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command },
});
const onEdit = (file_path) => ({
  hook_event_name: "PostToolUse",
  tool_name: "Edit",
  tool_input: { file_path },
  tool_response: {},
});
const STOP = { hook_event_name: "Stop", tool_name: "", tool_input: {} };

/** Run a hook AS a consumer: cwd and `CLAUDE_PROJECT_DIR` both point at the fixture repo. */
const at = (dir, name, input) =>
  runHook(program(name), input, { cwd: dir, env: { CLAUDE_PROJECT_DIR: dir } });

/**
 * The same hook, run with the tool's cwd DRIFTED away from the project root.
 *
 * 🔴 Why this helper has to exist at all: `at()` sets `cwd` and `CLAUDE_PROJECT_DIR` to the SAME
 * directory, so a provider reading `package.json` relatively and one reading it anchored are
 * indistinguishable under it. The defect was therefore invisible by construction — not missed
 * by inattention, but unexpressible by the only runner the harness had.
 *
 * ⚠️ The drifted cwd is deliberately a directory with NO `package.json`, because that is the
 * live case: a session `cd`s into a subtree, and vigiles runs every provider «via execSync in
 * the hook's cwd».
 */
const adrift = (dir, name, input) =>
  runHook(program(name), input, { cwd: realpathSync(mkdtempSync(join(tmpdir(), "drift-"))), env: { CLAUDE_PROJECT_DIR: dir } });

/** An injected notice, as the model would receive it — not the returned reaction. */
const injected = (r) => {
  try {
    return JSON.parse(r.stdout).hookSpecificOutput.additionalContext ?? "";
  } catch {
    return "";
  }
};

const tmps = [];
const fixture = (...args) => {
  const d = consumer(...args);
  tmps.push(d);
  return d;
};

try {
  // ═══════════════════════════════════════════════════════════════════════════
  // I. CAPABILITY CLOSURE — on the shipped artifact, not on a source twin
  // ═══════════════════════════════════════════════════════════════════════════
  // ⚠️ `checkHookImports` IS A REGEX OVER THE SOURCE TEXT, so it counts an import-shaped
  // sentence inside a COMMENT as an offender. Measured 2026-09-12: this block failed on the
  // guard's own docblock, which quoted the rejected form verbatim while explaining why it was
  // rejected. That is the product's own instrument landing on the "a string is the SHADOW of a
  // thing" rule — and the fix is NOT to loosen the check, because it is the same check any
  // future `vigiles compile`/`lint` pass would apply to the shipped artifact. It is to describe
  // a forbidden import in prose WITHOUT writing one. Anyone extending these headers: do not
  // quote an import statement in a comment here; name it in words.
  check("there are shipped hooks to check at all", SHIPPED.length === 3);
  for (const f of SHIPPED) {
    const offenders = checkHookImports(readFileSync(join(HOOKS, f), "utf8"));
    check(
      `${f} imports ONLY vigiles/hook (offenders: ${offenders.join(", ") || "none"})`,
      offenders.length === 0,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // II. EVERY SHIPPED HOOK LOADS — FIRST among the behavioural blocks, deliberately
  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 A hook that cannot resolve its imports prints `vigiles: cannot load hook program` and,
  // for a PreToolUse gate, REFUSES EVERY COMMAND. In the first consumer that state was reached
  // five separate times — a lockfile behind its manifest, a missing `node_modules`, a merge
  // conflict on the import path, a removed export after a major bump. The behavioural blocks
  // below do go red for it, but they name a hundred other things first: "blocks a redirect
  // write" is a long way from "your runtime lacks the export this hook imports".
  //
  // 🔑 IT RUNS EARLY, AND THAT PLACEMENT IS THE CHECK — node's assert aborts on the first
  // failure, so a diagnostic written at the END only ever prints when nothing else is broken,
  // which is when it diagnoses nothing.
  {
    const dir = fixture({ "research-paper-pipeline": { papers: "docs/papers" } });
    for (const f of SHIPPED) {
      const name = f.replace(/\.hook\.mjs$/, "");
      const r = at(dir, name, STOP);
      check(
        `${name} LOADS (the runtime can resolve its imports)`,
        !/cannot load hook program/.test(r.stdout + r.stderr),
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // III. paper-edit-guard — the blocking half and the allowing half
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const dir = fixture({ "research-paper-pipeline": { papers: "docs/papers" } });
    const P = "docs/papers/alpha/paper.md";
    const T = "docs/papers/alpha/paper.tex";
    const deny = (label, cmd) => {
      const r = at(dir, "paper-edit-guard", onBash(cmd));
      check(`guard BLOCKS ${label} (rc=${r.exitCode})`, r.exitCode === 2 && r.blocked);
      check(`guard's refusal of ${label} says what to do instead`, /Use Edit or Write/.test(r.stderr));
    };
    const allow = (label, cmd) => {
      const r = at(dir, "paper-edit-guard", onBash(cmd));
      check(`guard ALLOWS ${label} (rc=${r.exitCode}, ${r.stderr.length}b err)`, r.exitCode === 0 && !r.blocked);
    };

    // The two cases `touches` alone MISSES: a redirection target is not an argv token.
    deny("a redirect write to paper.md", `echo x ${GT} ${P}`);
    deny("an append write to a .tex", `cat /tmp/a ${GT}${GT} ${T}`);
    deny("sed -i on a paper", `sed -i s/a/b/ ${P}`);
    deny("cp onto a paper", `cp /tmp/a ${P}`);
    // The quote bypasses: both were OPEN until 2026-08-13 and each was one quote wide.
    deny("a QUOTED redirect target", `echo x ${GT} "${P}"`);
    deny("a QUOTED argv path", `sed -i s/a/b/ "${T}"`);
    // The wrapper bypass: `runs()` reads RAW leaves, `writesTo`/`touches` read NORMALIZED ones.
    deny("a mutator behind `env`", `env sed -i s/a/b/ ${T}`);

    allow("reading a paper", `cat ${P}`);
    allow("an unrelated command", "echo hi");
    allow("an unrelated write", `echo x ${GT} /tmp/unrelated.txt`);
    // The false positives that blocked real work: a bundle copy is data, and a grep is a read.
    allow("a copy into a paper's repro bundle", `cp h.mjs docs/papers/alpha/repro/anon/h.mjs`);
    // A FROZEN SNAPSHOT is archival, not the live source: `versions/` is immutable by
    // construction and `paper/stages` gates it by bytes, which is stricter than anything the
    // PostToolUse checks this guard protects would say about it.
    allow("freezing a snapshot into versions/", `cp /tmp/frozen.tex docs/papers/alpha/versions/2026-08-29-camera-ready.tex`);
    allow("a redirect into versions/", `echo x ${GT} docs/papers/alpha/versions/a.tex`);
    // ⚠️ NOT exempt, and deliberately asserted so the limit is recorded rather than discovered:
    // with the LIVE source as the copy's argument, `namesPaperSource` hits on that token, and
    // argv carries no direction — `cp a b` and `cp b a` are the same shape. Freezing therefore
    // goes through a temp file, which is what the refusal already tells the caller to do.
    deny("a copy whose SOURCE argument is the live paper", `cp ${T} docs/papers/alpha/versions/a.tex`);
    // 🔴 The other half: the carve-out must not reach the LIVE source, which keeps the same
    // extension. Without this assert the exemption could be widened to `.tex` and stay green.
    deny("sed -i on the live source beside versions/", `sed -i s/a/b/ ${T}`);
    deny("a write to a .tex that merely MENTIONS versions", `cp /tmp/versions/a.tex ${T}`);
    allow("a grep of a status file", `grep -c x docs/papers/alpha/PIPELINE-STATUS.md 2${GT}/dev/null`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // III-b. CWD DRIFT — every hook reads its manifest from the PROJECT ROOT
  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 Reported live 2026-09-16 by a consumer session: after a `cd` into a subdirectory with no
  // `package.json`, `paper-edit-guard` denied EVERY Bash command — `pwd` included — and the wedge
  // could not be escaped from the shell, because a PreToolUse hook fires before the command that
  // would fix it. The cause is one character of scope: the provider read `package.json`
  // relatively, and vigiles runs providers «via execSync in the hook's cwd».
  //
  // 🔴 AND THE SIBLINGS FAIL THE OTHER WAY, WHICH IS WHY THEY GET THEIR OWN ASSERTIONS. They are
  // PostToolUse and answer `nothing()` when the root will not parse, so a drifted cwd does not
  // block anything — it turns them OFF. Silence is a nudge's success state, so a dead nudge and a
  // working one produce identical output. The lockout announces itself; this does not.
  {
    const dir = fixture({ "research-paper-pipeline": { papers: "docs/papers" } });

    // paper-edit-guard: still GUARDS from a foreign cwd, rather than denying everything.
    const write = at(dir, "paper-edit-guard", onBash(`sed -i s/a/b/ docs/papers/alpha/paper.tex`));
    check("drift · guard still blocks a paper write", write.exitCode === 2);
    const idle = adrift(dir, "paper-edit-guard", onBash("echo hi"));
    check(`drift · guard does NOT deny an unrelated command (rc=${idle.exitCode})`, idle.exitCode === 0);
    const guarded = adrift(dir, "paper-edit-guard", onBash(`sed -i s/a/b/ docs/papers/alpha/paper.tex`));
    check("drift · guard STILL blocks the paper write it exists for", guarded.exitCode === 2);

    // The two PostToolUse hooks: still SPEAK from a foreign cwd.
    const nudge = adrift(dir, "paper-skills-nudge", onEdit(`${dir}/docs/papers/alpha/paper.tex`));
    check("drift · the skills nudge still fires", injected(nudge).length > 0);
    const gates = adrift(dir, "paper-status-gates", onEdit(`${dir}/docs/papers/alpha/PIPELINE-STATUS.md`));
    check(`drift · the status-gates hook still runs (rc=${gates.exitCode})`, gates.exitCode === 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IV. THE CARRIER — a root that cannot be read DENIES, it does not default
  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 THIS IS THE BLOCK THE EXTRACTION EXISTS FOR. Measured 2026-09-12: when the provider's
  // command fails, `e.ctx.pkg` arrives as the EMPTY STRING and the runtime says nothing. So a
  // `catch { use the default }` silently re-roots the gate at `papers/`, nothing under the real
  // root matches, and every Bash write to a paper is allowed by a gate that still looks
  // installed. An empty prefix must mean REFUSE, never "pass everything".
  {
    const harmless = onBash("echo hi");
    // 🔴 THE TWO PATHS ARE CHOSEN SO THE DECLARATION AND THE DEFAULT DISAGREE. A first draft of
    // this block declared `docs/papers` and tested a write under it — which proves nothing,
    // because the guard's prefix test is DEPTH-AGNOSTIC on purpose (`t.includes("/" + p + "/")`,
    // so a relative path deeper in the tree still matches). `docs/papers/…` is therefore a hit
    // under the default `papers` as well, and the "declared root is honoured" assertion passed
    // for a gate that had never read the declaration. Caught by its own negative control,
    // 2026-09-12. A declared root only demonstrates anything when the default would MISS it.
    const DECLARED = "writing/drafts";
    const declaredWrite = onBash(`echo x ${GT} ${DECLARED}/alpha/paper.md`);
    const defaultWrite = onBash(`echo x ${GT} papers/alpha/paper.md`);

    // (a) a declared root is used AS DECLARED — and the default is NOT.
    {
      const dir = fixture({ "research-paper-pipeline": { papers: DECLARED } }, { papers: DECLARED });
      check("carrier: a DECLARED root is honoured", at(dir, "paper-edit-guard", declaredWrite).exitCode === 2);
      check(
        "carrier: …and the DEFAULT root is not guarded once something else is declared",
        at(dir, "paper-edit-guard", defaultWrite).exitCode === 0,
      );
      check("carrier: and it still allows an unrelated command", at(dir, "paper-edit-guard", harmless).exitCode === 0);
    }
    // (b) no key at all → the documented default, and the converse of (a).
    {
      const dir = fixture(null, { papers: "papers" });
      check(
        "carrier: no declaration → the default root guards `papers/`",
        at(dir, "paper-edit-guard", defaultWrite).exitCode === 2,
      );
      check(
        "carrier: …and does NOT guard a root nobody declared",
        at(dir, "paper-edit-guard", declaredWrite).exitCode === 0,
      );
    }
    // (c) an explicit `null` is a KEYSTROKE, not an absence. `??` would read it as "undeclared"
    //     and silently substitute the default.
    {
      const dir = fixture({ "research-paper-pipeline": { papers: null } });
      const r = at(dir, "paper-edit-guard", harmless);
      check(`carrier: "papers": null REFUSES (rc=${r.exitCode})`, r.exitCode === 2);
      check("carrier: …and the refusal names the offending value", /got null/.test(r.stderr));
    }
    // (d) the empty string — the value that makes every prefix test vacuously true.
    {
      const dir = fixture({ "research-paper-pipeline": { papers: "" } });
      const r = at(dir, "paper-edit-guard", harmless);
      check(`carrier: "papers": "" REFUSES (rc=${r.exitCode})`, r.exitCode === 2);
      check("carrier: …and explains that an empty prefix matches nothing", /matches nothing/.test(r.stderr));
    }
    // (e) an unreadable package.json — the case that arrives by itself, mid-merge.
    {
      const dir = fixture({ "research-paper-pipeline": { papers: DECLARED } }, { papers: DECLARED });
      writeFileSync(join(dir, "package.json"), '{ "name": "c" <<<<<<< HEAD\n');
      const r = at(dir, "paper-edit-guard", harmless);
      check(`carrier: an unparseable package.json REFUSES (rc=${r.exitCode})`, r.exitCode === 2);
      check(
        "carrier: …and the refusal carries the way OUT (a file write, not a command)",
        /Edit or Write/.test(r.stderr) && /do not pass through this gate/.test(r.stderr),
      );
    }
    // (f) a trailing slash the consumer typed — `prefix + "/"` would become `//`, matching
    //     nothing. This defect made an earlier version of the guard a silent no-op.
    {
      const dir = fixture({ "research-paper-pipeline": { papers: DECLARED + "/" } }, { papers: DECLARED });
      check(
        "carrier: a TRAILING SLASH in the declaration still guards",
        at(dir, "paper-edit-guard", declaredWrite).exitCode === 2,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // V. paper-skills-nudge — it must LAND, not merely fire
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const dir = fixture({ "research-paper-pipeline": { papers: "docs/papers" } });
    const lands = (label, p) => {
      const r = at(dir, "paper-skills-nudge", onEdit(p));
      const ctx = injected(r);
      check(`nudge LANDS on ${label} (${r.stdout.length}b stdout)`, ctx.length > 0);
      check(`nudge's text on ${label} is the checklist`, /Pre-submit checklist/.test(ctx));
      check(`nudge on ${label} exits 0`, r.exitCode === 0);
    };
    const silent = (label, p) => {
      const r = at(dir, "paper-skills-nudge", onEdit(p));
      check(`nudge SILENT on ${label} (${r.stdout.length}b stdout, ${r.stderr.length}b stderr)`,
        r.stdout.length === 0 && r.stderr.length === 0 && r.exitCode === 0);
    };
    lands("a relative paper.md", "docs/papers/alpha/paper.md");
    lands("a .tex", "docs/papers/alpha/paper.tex");
    // 🔴 THE ABSOLUTE SPELLING. The live harness sends absolute paths; a helper that only builds
    // relative ones let an anchored predecessor pass every test while being dead in production.
    lands("an ABSOLUTE paper.md", join(dir, "docs/papers/alpha/paper.md"));
    silent("a README under the papers root", "docs/papers/README.md");
    silent("a file outside the papers root", "README.md");
    // The advisory's own asymmetry: it goes quiet where the gate refuses.
    {
      const broken = fixture({ "research-paper-pipeline": { papers: null } }, { papers: "papers" });
      const r = at(broken, "paper-skills-nudge", onEdit("docs/papers/alpha/paper.md"));
      check("nudge is SILENT (not blocking) on an unusable declaration", r.exitCode === 0 && r.stdout.length === 0);
      // 🔴 AND SILENT ON THE DEFAULT ROOT TOO — this is the half that catches `??`. With
      // `declared ?? DEFAULT` an explicit `null` is read as «nothing was declared», the prefix
      // becomes `papers/`, and the nudge starts firing about a tree the consumer never named.
      // Without this case that mutation survives, because the assertion above passes either way.
      const d = at(broken, "paper-skills-nudge", onEdit("papers/alpha/paper.md"));
      check(
        "nudge: an explicit null is NOT read as an absence (no fallback to the default root)",
        d.stdout.length === 0,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VI. paper-status-gates — the tool runs, and only for a validated directory
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const dir = fixture({ "research-paper-pipeline": { papers: "docs/papers" } });
    const fires = (label, p) => {
      const r = at(dir, "paper-status-gates", onEdit(p));
      check(`gates FIRES on ${label} (${r.stderr.length}b stderr)`, /fixture verdict line/.test(r.stderr));
      check(`gates on ${label} exits 0`, r.exitCode === 0);
    };
    const silent = (label, p) => {
      const r = at(dir, "paper-status-gates", onEdit(p));
      check(`gates SILENT on ${label}`, r.stdout.length === 0 && r.stderr.length === 0 && r.exitCode === 0);
    };
    fires("a relative paper.md", "docs/papers/alpha/paper.md");
    fires("an ABSOLUTE paper.md", join(dir, "docs/papers/alpha/paper.md"));
    silent("a README under the papers root", "docs/papers/README.md");
    silent("a file outside the papers root", "README.md");
    // 🔴 THE BOUNDARY IN `(?:^|/)`: a directory merely ENDING in the root's last segment must
    // not smuggle a match. Without the boundary this is a hit.
    silent("a look-alike root (`notdocs/papers/…`)", "notdocs/papers/alpha/paper.md");
    // A `.tex` whose directory name carries a shell metacharacter cannot reach a command.
    silent("a directory name with a shell metacharacter", "docs/papers/al;pha/paper.tex");
    // 🔴 The `??` discriminator again, for this hook's own copy of the carrier.
    {
      const broken = fixture({ "research-paper-pipeline": { papers: null } }, { papers: "papers" });
      check(
        "gates: an explicit null is NOT read as an absence (no fallback to the default root)",
        at(broken, "paper-status-gates", onEdit("papers/alpha/paper.md")).stderr.length === 0,
      );
    }
    // The declared root is regex-ESCAPED: `.` in a root must not act as a wildcard.
    {
      const dotted = fixture({ "research-paper-pipeline": { papers: "docs.v2/papers" } }, { papers: "docs.v2/papers" });
      check(
        "gates: a root with a dot matches ITSELF",
        /fixture verdict line/.test(at(dotted, "paper-status-gates", onEdit("docs.v2/papers/alpha/paper.md")).stderr),
      );
      check(
        "gates: …and the dot is NOT a wildcard",
        at(dotted, "paper-status-gates", onEdit("docsXv2/papers/alpha/paper.md")).stderr.length === 0,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VII. THE FORCED DUPLICATION — three hooks, one contract
  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 The carrier's key and default are SPELLED OUT IN ALL THREE FILES, and they have to be: a
  // compiled hook may import only `vigiles/hook`, so a shared module is not available to them.
  // Duplication that cannot be removed has to be CHECKED instead, and checked by comparing the
  // captured values against each other rather than by grepping for a literal — a substring
  // search would find the same text in the prose ABOUT the value one line above it.
  {
    const seen = SHIPPED.map((f) => {
      const src = readFileSync(join(HOOKS, f), "utf8");
      return {
        f,
        key: (src.match(/^const CONFIG_KEY = "([^"]+)";$/m) ?? [])[1],
        def: (src.match(/^const DEFAULT_PAPERS_ROOT = "([^"]+)";$/m) ?? [])[1],
      };
    });
    for (const s of seen) {
      check(`${s.f} declares CONFIG_KEY`, typeof s.key === "string" && s.key.length > 0);
      check(`${s.f} declares DEFAULT_PAPERS_ROOT`, typeof s.def === "string" && s.def.length > 0);
    }
    check(
      `all three hooks agree on CONFIG_KEY (${[...new Set(seen.map((s) => s.key))].join(" / ")})`,
      new Set(seen.map((s) => s.key)).size === 1,
    );
    check(
      `all three hooks agree on DEFAULT_PAPERS_ROOT (${[...new Set(seen.map((s) => s.def))].join(" / ")})`,
      new Set(seen.map((s) => s.def)).size === 1,
    );
    check(
      "the key they agree on is this package's name",
      seen[0].key === JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).name,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIII. paper-status-gates.sh — a TOOL, and it must refuse to be a hook
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const dir = fixture({ "research-paper-pipeline": { papers: "docs/papers" } });
    const sh = (args) =>
      runHook(`bash ${JSON.stringify(join(HOOKS, "paper-status-gates.sh"))} ${args}`, STOP, {
        cwd: dir,
        env: { CLAUDE_PROJECT_DIR: dir },
      });
    const usage = sh("");
    check("the .sh called with no --surface says it is a tool", /a tool, not a hook/.test(usage.stderr));
    check("…and still exits 0 (it must never block)", usage.exitCode === 0);
    const good = sh("--surface alpha");
    check("the .sh surfaces the verdict for a real paper", /fixture verdict line/.test(good.stderr));
    check("…and reads the papers root from the DECLARATION", good.exitCode === 0);
    const missing = sh("--surface nosuchpaper");
    check("the .sh is silent for a directory with no status file", missing.stderr.length === 0);
    // 🔴 THE NASTY NAME NEEDS A REAL DIRECTORY BEHIND IT, or the assertion cannot fail. First
    // draft just passed `a;b` and checked for silence — but a name that names nothing is silent
    // anyway, for want of a status file, so the mutation that DELETES the name check survived
    // green. The fixture now contains a paper literally called `a;b` with a status file in it:
    // with the check, silence; without it, the verdict comes out. Measured 2026-09-12.
    mkdirSync(join(dir, "docs/papers/a;b"), { recursive: true });
    writeFileSync(
      join(dir, "docs/papers/a;b/PIPELINE-STATUS.md"),
      "**Readiness verdict:** ✅ fixture verdict line\n",
    );
    check(
      "the .sh's positive control: a plain name with a status file DOES surface",
      /fixture verdict line/.test(sh("--surface alpha").stderr),
    );
    const nasty = sh("--surface 'a;b'");
    check(
      "the .sh re-rejects a name with a metacharacter EVEN THOUGH that paper exists",
      nasty.stderr.length === 0 && nasty.exitCode === 0,
    );
  }

  console.log(`hooks.harness: ${n} assertions passed`);
} finally {
  for (const d of tmps) rmSync(d, { recursive: true, force: true });
}
