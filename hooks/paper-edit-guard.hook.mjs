/**
 * paper-edit-guard — a PreToolUse gate: a paper SOURCE must not be written from Bash, because a
 * Bash write skips every PostToolUse check that hangs on Edit/Write (readability thresholds, the
 * pipeline nudge, the unrun-gate surface).
 *
 * ── WHY THIS SHIPS AS `.mjs` AND NOT AS A `.hook.ts` SPEC ───────────────────
 * 🔴 MEASURED, both halves, four locations (2026-09-11). The same hook, byte for byte, placed
 * inside an installed package:
 *
 *     <pkg>/hooks/probe.hook.mjs   deny-input RC=2 + reason   allow-input RC=0, silent   ✅
 *     <pkg>/hooks/probe.hook.ts    deny-input RC=2 "cannot be loaded"
 *                                  allow-input RC=2 "cannot be loaded"                   🔴 DEAD
 *
 * A `.ts` reached through `node_modules` does not load, and a PreToolUse hook that does not load
 * refuses EVERY Bash command — including the one that would fix it. So the shipped artifact is
 * `.mjs`. The CLI transpiles TypeScript hooks with its own host; why that host does not serve a
 * path inside `node_modules` was not established, and does not need to be for this decision.
 *
 * ── WHY NOT A THIN SPEC IN THE CONSUMER THAT IMPORTS THIS LOGIC ─────────────
 * 🔴 ALSO MEASURED (2026-09-12), and it is the form that looks obviously right and is not. A
 * consumer-side `.hook.ts` that pulls this logic in from the installed package:
 *
 *     runtime          deny-input RC=2, allow-input RC=0        ✅ it runs
 *     `vigiles compile`  RC=1 — "hook program uses capabilities outside `vigiles/hook`"  🔴
 *
 * `checkHookImports` allows exactly one specifier, and that is not a bug to route around: the
 * import list IS the capability surface. The consequence is what kills the form: compile is also
 * what writes the tamper-evident stamp, so a hook it refuses can never be re-stamped, and the
 * runtime FAILS CLOSED on a stamp that no longer matches its source —
 *
 *     vigiles: hook … does not match its compiled stamp (tampered).
 *     … the way out is a FILE WRITE, not a command — this refusal blocks the recompile too.
 *
 * — i.e. editing that thin file wedges the repository, and the only steady state is running
 * permanently unstamped. Shipping the whole program instead keeps the stamp question from
 * arising (no sidecar ⇒ no check) and pins the source by lockfile integrity instead, which is
 * stronger than a local stamp: the consumer cannot hand-edit an installed tree without the next
 * install reverting it.
 *
 * The capability surface is therefore asserted HERE, on the artifact that actually executes:
 * `hooks.harness.mjs` runs `checkHookImports` over every shipped `.hook.mjs`. That is a stricter
 * check than compiling a twin `.ts` source would be, because a twin can drift from its build and
 * this cannot — there is only one file.
 *
 * ── WHERE THE CONSUMER'S PAPERS ARE ─────────────────────────────────────────
 * One declaration, `"research-paper-pipeline": { "papers": "…" }`, read the way a hook is able to
 * read anything at all: `needs: [provide("pkg", "cat \"${CLAUDE_PROJECT_DIR:-.}/package.json\"")]`.
 * The alternatives were measured and killed in `eslint-rules/papers.mjs` — an env var cannot be
 * read from a hook at all (no imports), and a symlinked root makes ESLint report zero files.
 *
 * 🔴 THE PATH IS ANCHORED, AND THAT IS NOT DECORATION. vigiles runs a provider "via execSync in
 * the hook's cwd", so a bare `cat package.json` resolves against whatever directory the hook
 * PROCESS happens to have — which is set by the consumer's wiring, a string this hook cannot
 * see and does not control. With the wiring this package documents (`cd "$CLAUDE_PROJECT_DIR"
 * && node …`) the bare read is correct; without it, any tool cwd outside the project root makes
 * the read fail, and by the paragraph below that failure DENIES EVERY BASH COMMAND until
 * something external resets the cwd — `pwd` included, so the wedge cannot be escaped from the
 * shell. Reported 2026-09-16 by a session that hit exactly that after a `cd` into a subtree.
 *
 * ⚠️ The wiring is not hypothetical to lose: `vigiles compile` has REGENERATED it without the
 * `cd` prefix once already in this corpus. A gate whose blast radius is "all of Bash" must not
 * rest on a prefix a code generator can drop. `${CLAUDE_PROJECT_DIR:-.}` keeps the old behaviour
 * when the variable is absent, so this is strictly wider than what it replaces.
 *
 * 🔴 AN UNREADABLE DECLARATION DENIES, IT DOES NOT DEFAULT. Measured 2026-09-12: when the
 * provider's command fails — no `package.json`, or one with conflict markers in it — `e.ctx.pkg`
 * arrives as the EMPTY STRING and the runtime says nothing. A `try { JSON.parse } catch { use the
 * default }` therefore turns a broken declaration into a silently permissive gate: the prefix
 * quietly becomes `papers`, nothing under the real root matches, and every Bash write to a paper
 * is allowed by a gate that still looks installed and green. So parse failure is a `deny` that
 * names the cure.
 *
 * ⚠️ That deny does refuse every Bash command while the declaration is broken, which is a known
 * and accepted cost rather than an oversight: the recovery is a FILE WRITE (Edit/Write bypass
 * PreToolUse entirely), and the message below says so. A gate that fails open here would be
 * indistinguishable from a gate that is working.
 *
 * ── HONEST SCOPE — three holes, left open on purpose ────────────────────────
 * 1. INTERPRETER INDIRECTION. The gate reads the Bash command's AST; a path that never appears
 *    in the command is invisible. A heredoc that writes a script naming the paper, then running
 *    it, passes. Closing it means deciding what an arbitrary program will write, which is
 *    undecidable, and every cheap approximation (deny `python3` with a file argument, scan
 *    heredoc bodies) buys a little coverage for a lot of false denials. A guard that denies
 *    legitimate commands gets muted, and a muted guard is worth less than none.
 * 2. A WRAPPER THAT CHANGES DIRECTORY. Measured: `sed -i s/a/b/ <root>/x/paper.tex` → blocked;
 *    `env -C <root-parent> sed -i s/a/b/ …` → allowed. Both scans compare against a prefix
 *    starting at the repository root and neither knows the command's working directory. Closing
 *    it means a cwd model that `cd`, `env -C`, `pushd`, `git -C` and a subshell can each move —
 *    that belongs in the vocabulary upstream, not in a guard reimplementing shell semantics.
 * 3. DELIVERY, from the product's own docs: a PreToolUse hook does not fire for a subagent's
 *    tool calls. So this is a strong default, never an unbypassable wall — and hole 3 is wider
 *    than 1 and 2 together, which is why patching them from inside the hook is not worth it.
 *
 * This gate is a SPEED BUMP against the idiom people reach for. The boundary is the convention
 * in the consumer's own instructions, and that is held by prose on purpose.
 */
// 🔴 `tools`, PLURAL. The singular alias existed before vigiles 27.x and was REMOVED from
// `vigiles/hook` in it. The failure is not local: a missing import means the hook does not load,
// and a PreToolUse hook that does not load refuses EVERY Bash command — including the one that
// would fix it. Observed in the first consumer on 2026-09-10 after a 25.1.0 → 27.1.4 bump; the
// repository had to be recovered with a file write. Pin this package's vigiles to the consumer's.
import {
  experimental_defineHook,
  tools,
  provide,
  allow,
  deny,
} from "vigiles/hook";

/** The key every carrier of this package reads its consumer-specific settings from. */
export const CONFIG_KEY = "research-paper-pipeline";
/** The default. A consumer that declares nothing is assumed to keep papers in `papers/`. */
export const DEFAULT_PAPERS_ROOT = "papers";

/**
 * The declared papers root, or a `deny` explaining why there is not one.
 *
 * Returns a string on success and a `Decision` on failure, so the caller cannot accidentally
 * continue with a bad root: there is no value to continue WITH.
 *
 * 🔴 `declared === undefined`, NOT `declared ?? DEFAULT` — the two differ on exactly one input,
 * `"papers": null`, and that difference is the point: `??` reads an explicit `null` as "nothing
 * was declared" and silently substitutes the default, i.e. treats a typed keystroke as an
 * absence. The same distinction is made by every other carrier in this package.
 */
/**
 * EXPORTED ON PURPOSE — this is the only way to cross-check without a second copy of the logic.
 * `rpp doctor` has to say which directory THIS hook will guard, not what a retelling of it
 * would guard. The compiled hook is forbidden to IMPORT anything but `vigiles/hook`
 * (that's what `checkHookImports` enforces), so a shared module is impossible — but that ban
 * doesn't restrict exporting outward, and the reverse direction, CLI → hook, is free.
 * Returns the root string, or a rejection object: the caller tells them apart by `typeof`.
 */
export const papersRoot = (rawPkg) => {
  let pkg;
  try {
    pkg = JSON.parse(rawPkg);
  } catch {
    return deny(
      `${CONFIG_KEY}: this gate could not read the consumer's package.json, so it does not know ` +
        `where papers live and is refusing rather than guessing.\n` +
        `The declaration it needs is:\n` +
        `  "${CONFIG_KEY}": { "papers": "path/to/papers" }\n` +
        `(no key at all is fine too — the default is "${DEFAULT_PAPERS_ROOT}").\n` +
        `If package.json is mid-merge or otherwise broken, fix it with Edit or Write: file ` +
        `tools do not pass through this gate, so that path out is always open.\n` +
        `This refuses rather than falling back on purpose. A gate whose prefix quietly became ` +
        `the default would allow every Bash write to the real papers root while still looking ` +
        `installed and green.`,
    );
  }
  const declared = pkg?.[CONFIG_KEY]?.papers;
  const root = declared === undefined ? DEFAULT_PAPERS_ROOT : declared;
  if (typeof root !== "string" || root.length === 0)
    return deny(
      `${CONFIG_KEY}: "papers" must be a non-empty string, got ${JSON.stringify(root)}.\n` +
        `Fix it in the consumer's package.json. This gate refuses while the value is unusable: ` +
        `an empty prefix matches nothing, so the gate would pass every paper write in silence.`,
    );
  // One trailing slash at most, whatever the consumer typed: `"papers": "docs/papers/"` reaches
  // here with its own, and `prefix + "/"` would become `docs/papers//`, which matches NOTHING.
  // That exact defect (a trailing slash in the guarded prefix) made an earlier version of this
  // guard a no-op while its comment claimed otherwise.
  return root.replace(/\/+$/, "");
};

/**
 * Redirection targets (`> f`, `>> f`, `1> f`, `&> f`), which `touches` cannot see.
 *
 * MEASURED, not assumed: `leafCommandsNormalized("echo x > p/x/paper.md")` returns
 * `[{head:"echo", argv:["echo","x"], args:["x"], …}]` — the redirection and its target are
 * DROPPED by the parser, so they appear in no field of any leaf. The closed vocabulary
 * (`runs` / `touches` / `pipesToShell` / `isSideEffecting`) has no way to ask what a command
 * WRITES. Filed upstream as a `writesTo(prefixes)` primitive; when that lands, this helper
 * deletes and the assertions stay.
 *
 * 🔴 THE SCAN IS QUOTE-AWARE, and the version before it was not. It stripped quoted spans
 * wholesale, so a quoted redirection target vanished with them. MEASURED on this guard:
 *
 *   echo x > <root>/x/paper.md     → blocked
 *   echo x > "<root>/x/paper.md"   → ALLOWED
 *   echo x > '<root>/x/paper.md'   → ALLOWED
 *
 * Stripping was not merely careless: a `>` INSIDE quotes is not a redirection at all, so the
 * guard has to know about quoting or it fires on any command that merely QUOTES a paper write —
 * which it did, three times in a row, on the very commands testing it. Both facts are true at
 * once and a regex cannot hold them both: the operator must be found OUTSIDE quotes while the
 * target must be read THROUGH them. Hence a character scan that tracks quote state.
 */
const redirectTargets = (raw) => {
  const src = raw.replace(/<<-?\s*'?(\w+)'?[\s\S]*?^\1$/gm, "<<HEREDOC");
  const out = [];
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      if (c === "\\" && quote === '"') i += 1;
      else if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      i += 1;
      continue;
    }
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c !== ">") {
      i += 1;
      continue;
    }
    i += 1;
    if (src[i] === ">") i += 1;
    while (i < src.length && (src[i] === " " || src[i] === "\t")) i += 1;
    // Read the target, unquoting as we go. `2>&1` and `2>/dev/null` fall out for free: `&` is a
    // delimiter, so the first yields an empty token, and the second simply names a path under no
    // guarded prefix.
    let tok = "";
    let tq = null;
    while (i < src.length) {
      const d = src[i];
      if (tq) {
        if (d === "\\" && tq === '"') {
          tok += src[i + 1] ?? "";
          i += 2;
          continue;
        }
        if (d === tq) {
          tq = null;
          i += 1;
          continue;
        }
        tok += d;
        i += 1;
        continue;
      }
      if (d === "'" || d === '"') {
        tq = d;
        i += 1;
        continue;
      }
      if (/[\s;|&()<>]/.test(d)) break;
      if (d === "\\") {
        tok += src[i + 1] ?? "";
        i += 2;
        continue;
      }
      tok += d;
      i += 1;
    }
    if (tok !== "") out.push(tok.replace(/^\.\//, ""));
  }
  return out;
};

/**
 * 🔴 UNQUOTES rather than DELETES — the argument scan used to strip quoted spans, and a quoted
 * path therefore vanished before it could be matched. MEASURED against this guard:
 *
 *   sed -i s/a/b/ <root>/x/paper.tex     → blocked
 *   sed -i s/a/b/ "<root>/x/paper.tex"   → ALLOWED
 *
 * Quoting a path is what anyone writes for a path with a space in it, so the gate was one quote
 * from open. Deleting quoted text was not wrong for its own job — it stopped the guard firing on
 * a command that merely QUOTES a paper write, which really happened — but that job now belongs
 * to `writesTo`, which answers "is this WRITTEN" instead of "is this mentioned". With the write
 * established there, the argument scan only has to say WHICH file, so it must see the path, not
 * lose it. Heredocs are still collapsed: their body is data, not argv.
 */
const unquote = (s) =>
  s
    .replace(/<<-?\s*'?(\w+)'?[\s\S]*?^\1$/gm, "<<HEREDOC")
    .replace(/'([^']*)'/g, "$1")
    .replace(/"((?:[^"\\]|\\.)*)"/g, "$1");

const redirectsInto = (raw, prefixes) =>
  redirectTargets(raw).some(
    (t) =>
      // ⚠️ This leg is WIDER than the argv leg: it claims any redirect target under the root,
      // whatever its extension, so the frozen-snapshot carve-out has to be repeated here. It
      // does not reach the argv leg's carve-outs either — noted, not widened, because loosening
      // a guard beyond the case at hand is how gates stop holding.
      !isFrozenSnapshot(t) &&
      prefixes.some(
        (p) => t === p || t.startsWith(p + "/") || t.includes("/" + p + "/"),
      ),
  );

/**
 * Programs that WRITE a path given as an argument. The list is explicit because `touches`
 * answers "is this path MENTIONED", not "is it written".
 *
 * 🔴 An earlier version leaned on `isSideEffecting()` to tell a read from a write. That
 * classifies the WHOLE command line, so `grep -c '☐' <root>/x/STATUS.md 2>/dev/null` came back
 * side-effecting, touched a paper path, and was blocked — a plain read, refused. Coarse enough
 * to be useless as a discriminator, and it fired on real work twice within the hour.
 */
const MUTATORS = [
  "sed -i",
  "cp",
  "mv",
  "tee",
  "dd",
  "truncate",
  "install",
  "shred",
];

/**
 * Does the command RUN a mutator?
 *
 * 🔴 THE `runs()` CONJUNCT CANNOT BE DROPPED — it is what separates a write from a read. Without
 * it `cat <root>/x/paper.tex` touches a paper, names a paper source, and would be denied: a
 * plain read refused, which this guard has already done once and which cost real work.
 *
 * ⚠️ A RAW-TEXT CRUTCH USED TO SIT BESIDE IT, AND IT IS GONE BECAUSE ITS PREMISE EXPIRED. On
 * 2026-08-13, against vigiles 15.x, `runs()` read the RAW leaves while `writesTo`/`touches` read
 * the NORMALIZED ones, so the vocabulary contradicted itself on a wrapped command and
 * `env sed -i … <root>/x/paper.tex` was ALLOWED with a full, correct path. A second scan over the
 * unquoted raw text patched that, with a comment saying it "deletes on the day the vocabulary
 * stops disagreeing, not before".
 *
 * That day arrived. Re-measured on vigiles 27.1.4 (2026-09-12), and the old table is stale in
 * the row that motivated the crutch:
 *
 *   command                              runs("sed -i")  writesTo  touches
 *   sed -i … <root>/x/paper.tex          true            true      true
 *   env sed -i … <root>/x/paper.tex      true  ← was FALSE   true      true
 *   env -C <parent> sed -i … <root>/…    true  ← was false   true      false
 *   cd <parent> && sed -i … <root>/…     true            false     false
 *
 * `runs()` now sees through `env`, `env -C`, `command`, `nice`, `xargs`, `sudo`, `time`, a
 * repeated space and a quoted head — every form tried. So the crutch defended nothing, which is
 * not a judgement but a measurement: removing it left all 78 harness assertions GREEN, and no
 * command form could be found that it alone catches. A line no mutation can kill is a line
 * documenting a defence that does not exist, so it was deleted rather than kept for comfort.
 *
 * ⚠️ WHAT THIS DOES NOT FIX: rows 3 and 4 above. A wrapper that moves the working directory is
 * still invisible, because `touches`/`namesPaperSource` compare against a repo-root prefix and
 * neither knows the command's cwd — see hole 2 in the header. Only the `env`-without-`-C` row
 * closed.
 */
const runsMutator = (cmd) => MUTATORS.some((m) => cmd.runs(m));

/**
 * A PAPER SOURCE, not merely a path under the papers root.
 *
 * 🔴 An earlier version guarded the whole subtree, so copying a script into a paper's
 * reproduction bundle — ordinary work, touching no prose — was denied. The gate exists to stop a
 * paper's PROSE being edited past the PostToolUse checks; everything else under that directory
 * is data, code and bundles that no readability gate looks at. Observed while it was blocking
 * the artifact fix the pre-submission gate had just asked for.
 */
const isPaperSource = (p) => !isFrozenSnapshot(p) && hasSourceExtension(p);

const hasSourceExtension = (p) =>
  p.endsWith(".tex") ||
  /\/(paper|draft)\.md$/.test(p) ||
  /^(paper|draft)\.md$/.test(p);

/**
 * A FROZEN SNAPSHOT — a file under a paper's `versions/`, which is the same carve-out as the
 * reproduction bundle above and was missed only because a snapshot keeps the `.tex` extension of
 * the live source it was copied from.
 *
 * 🔴 Why the gate must not claim it. Everything the guard protects is a PostToolUse check on the
 * paper being WRITTEN — readability thresholds, the pipeline nudge, the unrun-gate check. None of
 * them has anything to say about a snapshot: a frozen version is immutable by construction, it is
 * never the file an author edits, and `paper/stages` already gates it far more strictly than any
 * of those, by BYTES, in both directions.
 *
 * ⚠️ Observed: restoring `versions/2026-08-29-camera-ready.tex` from the one commit that still
 * resolved was denied, so the only recoverable source of four declared stages was unreachable by
 * the tool that could reach it. The guard was refusing the archival write while the live
 * `paper.tex` beside it — the file it actually exists to protect — stayed open.
 */
const isFrozenSnapshot = (p) => /(^|\/)versions\/[^/]+$/.test(p);

/** Paper-source paths named as arguments (as opposed to redirection targets). */
const namesPaperSource = (raw, prefixes) =>
  unquote(raw)
    .split(/[\s;|&()<>]+/)
    .some(
      (tok) =>
        isPaperSource(tok) &&
        prefixes.some(
          (p) => tok.startsWith(p + "/") || tok.includes("/" + p + "/"),
        ),
    );

export default experimental_defineHook({
  on: "PreToolUse",
  match: tools("Bash"),
  needs: [provide("pkg", 'cat "${CLAUDE_PROJECT_DIR:-.}/package.json"')],
  decide: (e) => {
    const root = papersRoot(e.ctx.pkg);
    // A `deny` object rather than a string means the root could not be established. Returning it
    // unchanged is deliberate: there is no root to continue with, so there is nothing to decide.
    if (typeof root !== "string") return root;
    const PAPER_SOURCES = [root];

    // Reads are fine — the point is that WRITES must not bypass the gates that hang on
    // Edit/Write. A command that merely names a paper is not a bypass. `writesTo` establishes
    // that something under the papers root is WRITTEN — quote-safe, and it sees redirection
    // targets that `touches` cannot. The argument scan then only decides WHICH file, so the
    // extension filter still applies and an artifact/bundle write stays allowed.
    // ⚠️ That scan survives only because `writesTo` returns a boolean, not the targets it
    // matched; with `writeTargets()` upstream this helper deletes.
    const writesViaArgv =
      runsMutator(e.command) &&
      (e.command.writesTo(PAPER_SOURCES) || e.command.touches(PAPER_SOURCES)) &&
      namesPaperSource(e.command.raw, PAPER_SOURCES);
    const hits = writesViaArgv || redirectsInto(e.command.raw, PAPER_SOURCES);
    if (!hits) return allow();

    return deny(
      "Writing a paper source from Bash skips every PostToolUse gate " +
        "(the readability thresholds, the pipeline nudge, the unrun-gate check). " +
        "Use Edit or Write. For a machine-generated rewrite, emit to a temp file " +
        `outside ${root}/ and land it with Write.`,
    );
  },
});
