/**
 * paper-status-gates — a PostToolUse react: editing a paper's source surfaces that paper's
 * readiness verdict and its UNRUN GATES, unprompted.
 *
 * A ☐ against study-accepted / pc-panel / harden / verify-citations is a HOLE, not an
 * "anti-churn" skip: a session that skipped three of them had the panel come back with real
 * must-fixes. Advisory, never blocks, always exits 0 — a `react`'s type has no `deny`.
 *
 * ── WHY IT WAS WORTH SURFACING AT ALL ───────────────────────────────────────
 * The checker PARSED the verdict line (to test it was not a bare percentage) and never PRINTED
 * it, so the one fact its author kept asking for by hand was the one thing the tooling reliably
 * withheld. A status file nobody is shown is a status file nobody reads.
 *
 * ── THE PURE / IMPURE LINE, AND WHERE IT REALLY FALLS ───────────────────────
 * An earlier header claimed this half "READS A FILE and interpolates its contents, and a vigiles
 * `react` is a pure function — it cannot", and called that the honest boundary of the closed
 * vocabulary. That reading was one step too pessimistic. The boundary is real, but it falls
 * between DECIDING and DOING, not between "hook" and "shell": deciding whether this edit
 * concerns a paper, and WHICH one, is pure and belongs here; reading that paper's status file
 * and running the checker is a tool, and `run()` is how a react invokes one.
 *
 * ── WHY THE DIRECTORY NAME IS VALIDATED BEFORE IT REACHES A COMMAND ─────────
 * `run()` takes a string AND IT GOES THROUGH A SHELL — measured 2026-09-12: a `$(…)` inside a
 * `run()` command substitutes. This one embeds a path taken from the event, so the name is
 * extracted by an anchored pattern and accepted only if it is `[A-Za-z0-9._-]+` — no slash, no
 * space, no shell metacharacter can survive. The shell predecessor got this incidentally, via a
 * `grep -oE`; here it is explicit, because "incidentally safe" is how it stops being safe.
 *
 * 🔴 THE `(?:^|\/)` IS NOT DECORATION, AND LEAVING IT OUT KILLED THIS HOOK ONCE. The first
 * version anchored the papers root at `^`, which passed every test in the harness — because the
 * harness's own edit helper builds a RELATIVE path. The live harness sends an ABSOLUTE one.
 * Measured against the real runtime:
 *
 *   file_path "<root>/<paper>/paper.md"                → fires
 *   file_path "/abs/path/to/repo/<root>/<paper>/…"      → SILENT
 *
 * So the hook would have been dead in production and green in the tests: precisely the
 * false-confidence class this whole exercise is about, reintroduced while converting a hook away
 * from it. The shell version was accidentally immune — it grepped the raw payload with no anchor
 * at all. The harness now sends BOTH spellings for every case.
 *
 * The boundary is still required (`^` or `/`), so a directory merely ENDING in the root's last
 * segment cannot smuggle a match.
 *
 * ── WHAT THIS HOOK'S OUTPUT DOES *NOT* DO, measured and named ───────────────
 * ⚠️ A `run()` reaction's output is passed through RAW — 0 bytes of `hookSpecificOutput` on
 * stdout, the tool's own text on stderr (measured 2026-09-12: 1 184 bytes of stderr, 0 of
 * stdout). Only a `notice` on an injectable event becomes `additionalContext`. So this hook's
 * findings reach a HUMAN reading the transcript's debug output, not the model's context. That is
 * a property of the reaction KIND, not a bug here, and it is the reason the static half lives in
 * `paper-skills-nudge` as a `notice` instead: that one does land.
 *
 * ── WHY `.mjs` AND NOT A `.hook.ts` SPEC ────────────────────────────────────
 * See `paper-edit-guard.hook.mjs`: a `.ts` hook reached through `node_modules` does not load,
 * and a consumer-side thin spec importing this logic is refused by `vigiles compile` and can
 * never be re-stamped. Both halves measured there.
 */
import {
  experimental_defineReact,
  tools,
  provide,
  run,
  nothing,
} from "vigiles/hook";

/** The key every carrier of this package reads its consumer-specific settings from. */
export const CONFIG_KEY = "paperlint";
/** The key's name before 2.0.0 — still read, a copy of `lib/paper-config.mjs`. */
export const LEGACY_CONFIG_KEY = "research-paper-pipeline";
/** The default. A consumer that declares nothing is assumed to keep papers in `papers/`. */
export const DEFAULT_PAPERS_ROOT = "papers";
/**
 * The field under CONFIG_KEY that names the papers directory, and its old name. A copy of the
 * constants in `lib/paper-config.mjs` (a hook may import nothing but `vigiles/hook`);
 * `lib/paper-config.harness.mjs` checks that the copies match.
 */
export const PAPERS_DIR_FIELD = "papersDir";
export const OLD_PAPERS_DIR_FIELD = "papers";

/**
 * The declared papers root, or `null` when it is unusable.
 *
 * ⚠️ `null` means SILENCE, not refusal — same asymmetry as `paper-skills-nudge` and for the same
 * reason: this is advisory, and a `react` cannot deny anyway. The gate (`paper-edit-guard`) is
 * the one that must refuse on an unreadable declaration, because there a silent default would
 * pass the very writes it exists to stop.
 *
 * 🔴 `declared === undefined`, NOT `declared ?? DEFAULT` — `"papersDir": null` is a keystroke, not
 * an absence.
 */
const papersRoot = (rawPkg) => {
  let declared;
  try {
    const pkg = JSON.parse(rawPkg);
    const settings = pkg?.[CONFIG_KEY] ?? pkg?.[LEGACY_CONFIG_KEY];
    // Old field name: stay silent rather than fall back to the default directory.
    if (settings && Object.hasOwn(settings, OLD_PAPERS_DIR_FIELD)) return null;
    declared = settings?.[PAPERS_DIR_FIELD];
  } catch {
    return null;
  }
  const root = declared === undefined ? DEFAULT_PAPERS_ROOT : declared;
  if (typeof root !== "string" || root.length === 0) return null;
  return root.replace(/\/+$/, "");
};

/**
 * A paper SOURCE under `<root>/<dir>/`, with `<dir>` captured.
 *
 * 🔴 THE ROOT IS REGEX-ESCAPED. It is a path from a config file, and `.` is both a legal
 * directory character and a regex wildcard: an unescaped root like `docs.v2/papers` would match
 * `docsXv2/papers` too. Cheap to get right, and the failure it prevents is a hook firing about
 * the wrong tree.
 */
const paperSourceRe = (root) =>
  new RegExp(
    `(?:^|/)${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/([A-Za-z0-9._-]+)/(?:[^/]*\\.tex|(?:.*/)?(?:paper|draft)\\.md)$`,
  );

/**
 * The tool invocation, with the script located rather than assumed.
 *
 * 🔴 `require.resolve` INSTEAD OF A HARD-CODED `node_modules/<pkg>/…` PATH. This package must
 * not spell its own install location: a consumer may install it under an alias, and a
 * pnpm/yarn-berry layout is not `node_modules/<name>` at all. `require.resolve` asks the
 * resolver the same question Node itself answers, and it works for a non-JS extension —
 * measured 2026-09-12 against a `.md` and a `.sh` in an installed copy. It runs in a `$(…)`
 * because `run()` goes through a shell (also measured).
 */
const surface = (dir) =>
  `bash "$(node -p "require.resolve('${CONFIG_KEY}/hooks/paper-status-gates.sh')")" --surface ${dir}`;

export default experimental_defineReact({
  on: "PostToolUse",
  match: tools("Edit", "Write", "MultiEdit"),
  // 🔴 THE PATH IS ANCHORED TO THE PROJECT ROOT, and that is not decoration. vigiles runs the
  // provider "via execSync in the hook's cwd", and the hook process's cwd is the consumer's
  // own wiring — a string this hook cannot see. A bare `cat package.json` therefore reads from
  // whatever directory the Bash tool last moved to, and a `cd` into a subdirectory with no
  // manifest breaks the read.
  //
  // ⚠️ THE FAILURE HERE IS SILENT, which makes it more dangerous than its neighbor's.
  // `paper-edit-guard` on PreToolUse DENIES loudly and visibly when the declaration is
  // unreadable. This hook on PostToolUse just returns `nothing()`, i.e. simply stops firing:
  // the `cat` chain fails → empty string → `JSON.parse("")` throws → `papersRoot` returns null
  // → silence. And silence is exactly what a nudge's success state looks like, so a dead hook
  // is indistinguishable from a working one.
  needs: [provide("pkg", 'cat "${CLAUDE_PROJECT_DIR:-.}/package.json"')],
  react: (e) => {
    const root = papersRoot(e.ctx.pkg);
    if (root === null) return nothing();
    const m = paperSourceRe(root).exec(e.path.raw.replace(/^\.\//, ""));
    if (m === null) return nothing();
    return run(surface(m[1]));
  },
});
