/**
 * papers.mjs — WHERE THE CONSUMER'S PAPERS LIVE. One declaration, three readers.
 *
 * ── THE PROBLEM THIS SOLVES ─────────────────────────────────────────────────
 * This package lints papers. It must not know where any particular consumer keeps them: the
 * first consumer keeps them two levels deep under a directory named in its own language, and
 * a package that hard-codes that word is a package with exactly one possible user. But the
 * path cannot simply be "passed in" either, because it is needed by FOUR carriers with four
 * different mechanics — an ESLint config (JavaScript), a compiled hook (a closed vocabulary
 * that forbids imports), the PROSE of a skill (read by a model, not resolved by code), and
 * LaTeX (`TEXINPUTS`, kpathsea).
 *
 * ── THE DECISION (2026-09-11) ───────────────────────────────────────────────
 * ONE declaration, in the consumer's `package.json`, with a default:
 *
 *     "paperlint": { "papersDir": "docs/papers" }
 *
 * (The field was called `papers` until 2026-09-24; the old name is now refused.)
 * No key → `papers`. Every carrier then reads that one value with its OWN standard mechanism:
 *
 *   ESLint  →  `import pkg from "./package.json" with { type: "json" }` + this module
 *   hook    →  `needs: [provide("pkg", "cat package.json")]`, JSON.parse inside `decide`
 *   prose   →  the skill names a COMMAND, not a path:
 *              `node -p "require('./package.json')['paperlint']?.papersDir ?? 'papers'"`
 *   LaTeX   →  `TEXINPUTS` built FROM THE SCRIPT (`$(dirname "$0")/../tex//:`), so the
 *              consumer declares nothing at all for this carrier
 *
 * `package.json` is the right home rather than a new dotfile for one measured reason: it is
 * the file Node already opens to resolve this package, so it cannot be absent, cannot be
 * gitignored, and needs no discovery rules of its own.
 *
 * ── WHAT WAS MEASURED AND KILLED, so it is not proposed again ───────────────
 * (full measurements: consumer repo, `idei/paper-pipeline-extraction/`, 2026-09-11)
 *
 *   A SYMLINK (`papers -> <the real directory>`) plus a hard-coded default, no config at all.
 *     ESLint does NOT descend into a symlinked directory when walking `.`: the run reported
 *     ZERO files and exit 0 — the green zero this package has a dedicated guard against.
 *
 *   AN ENVIRONMENT VARIABLE (`$PAPER_ROOT`).
 *     A compiled hook cannot read `process.env` — the vocabulary check rejects every import
 *     except `vigiles/hook`. The only way in is `provide("root", "echo $PAPER_ROOT")`, and
 *     then THREE different places must set the same value (the agent harness that spawns the
 *     hook, CI, the editor running ESLint). Unset, it expands to the empty string and every
 *     prefix test silently passes.
 *
 *   A FILENAME MARKER, no root at all (`**\/paper.tex`).
 *     Measured on the first consumer: `paper.tex` ×4 with one outside the corpus,
 *     `PIPELINE-STATUS.md` ×6 with two of them test fixtures, `paper.md` ×3 with two outside.
 *     The guard that would consume this is a `deny` at `error` severity; a denial on writing
 *     a fixture gets the hook switched off the same day.
 *
 *   `context.settings`.
 *     It delivers data INTO a rule; it does not choose which files a rule sees. `files:` is
 *     the only mechanism that does. Useful for a plugin's `structureRoot`, useless here.
 *
 * ── WHY THIS THROWS INSTEAD OF FALLING BACK ─────────────────────────────────
 * 🔴 A wrong root does not produce wrong findings — it produces NO findings, and a run with no
 * findings is byte-identical to a run that examined everything and passed. That is the one
 * failure mode of this whole design, and it belongs to the ESLint carrier alone: the other
 * three fail loudly on their own (a hook throws on `join(undefined)`, `ls` exits non-zero,
 * LaTeX stops with `! Emergency stop.`). So this module refuses to return a root it cannot
 * see on disk, and the refusal happens while the CONFIG is loading — before any rule runs,
 * where it cannot be mistaken for a clean lint.
 *
 * ⚠️ THAT IS NOT ENOUGH ON ITS OWN, and saying so is the point. `existsSync` proves the
 * directory exists, not that any rule was handed a file from it: a root that exists but holds
 * no papers, or a glob shape that stopped matching, still yields the green zero. The second
 * net is `scripts/rules-see-files.mjs`, which asks ESLint what the effective config of every
 * linted file is and names any rule that saw none. A consumer using this module without
 * running that script has one net, not two.
 *
 * ⚠️ THE EXAMPLES IN THIS FILE ARE DELIBERATELY GENERIC (`docs/papers`), and that is ENFORCED
 * rather than a style preference: `papers.harness.mjs` part IV fails if the first consumer's own
 * directory name appears anywhere in this package outside the test itself. It caught this very
 * docblock on 2026-09-11, where the example used the real value. An exemption list is what turns
 * such a check into decoration, so there is exactly one exemption: the file asserting it.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Re-exported, not re-declared. This file is not a hook, so nothing stops it importing the one
// source; it had its own copy for no reason, and that copy was outside the agreement check that
// compares the three hooks — it could have drifted in silence.
import {
  CONFIG_KEY,
  DEFAULT_PAPERS_ROOT,
  PAPERS_DIR_FIELD,
  declaredSettings,
  renamedFieldMessage,
  settingsOf,
} from "../lib/paper-config.mjs";
export { DEFAULT_PAPERS_ROOT };

/**
 * The declared papers root, verified to be on disk.
 *
 * @param pkg      the consumer's parsed `package.json`
 * @param baseDir  the directory the root is relative to. PASS `import.meta.dirname` FROM THE
 *                 CONFIG rather than relying on the default: `process.cwd()` is wherever the
 *                 editor, the hook runtime or the CI step happened to start, and in a git
 *                 worktree it can be a different checkout entirely. The config file sits at
 *                 the repository root, so its own directory is the stable answer.
 * @returns the root as DECLARED (relative), not resolved — it goes straight into `files:`
 *          globs, which ESLint interprets relative to the config, and an absolute path there
 *          would change their meaning.
 */
export function papersRoot(pkg, baseDir = process.cwd()) {
  const found = declaredSettings(pkg);
  if (found.conflict !== null) throw new TypeError(found.conflict);
  const renamed = renamedFieldMessage(found.settings);
  if (renamed) throw new TypeError(renamed);
  const declared = settingsOf(pkg)?.[PAPERS_DIR_FIELD];
  // 🔴 `declared === undefined`, NOT `declared ?? DEFAULT`. The two differ on exactly one
  // input — `"papersDir": null` — and the difference is the whole point: `??` reads an explicit
  // `null` as "nothing was declared" and silently uses the default, which is a typed keystroke
  // being treated as an absence. Caught by the harness on 2026-09-11, where the first draft of
  // this line used `??` and let `null` through. Absence means default; anything written down
  // means it must be usable.
  const root = declared === undefined ? DEFAULT_PAPERS_ROOT : declared;
  if (typeof root !== "string" || root.length === 0)
    throw new TypeError(
      `${CONFIG_KEY}: "${PAPERS_DIR_FIELD}" must be a non-empty string, got ${JSON.stringify(root)}`,
    );
  if (!existsSync(resolve(baseDir, root)))
    throw new Error(
      `${CONFIG_KEY}: the papers root "${root}" does not exist under ${baseDir}.\n` +
        (declared === undefined
          ? `Nothing was declared, so the default "${DEFAULT_PAPERS_ROOT}" was used. Declare the ` +
            `real location in package.json:\n` +
            `  "${CONFIG_KEY}": { "${PAPERS_DIR_FIELD}": "path/to/papers" }`
          : `It is declared in package.json as "${declared}". Fix it there, or create the ` +
            `directory.`) +
        `\nThis is thrown rather than ignored on purpose: a papers root that matches nothing ` +
        `makes every rule lint zero files, and a run with zero findings is indistinguishable ` +
        `from a run that checked everything and passed.`,
    );
  return root;
}

/**
 * The glob sets a consumer declares its blocks on, derived from one root.
 *
 * 🔴 THE SHAPES LIVE HERE, NOT IN THE CONSUMER, and that is the half that keeps a rule from
 * going blind later. `paper.md` + `draft.md`, `_build/*.facts.json`, `PIPELINE-STATUS.md` are
 * this pipeline's CONVENTION; if a rule starts reading a new file, the glob for it must arrive
 * with the rule, in the same package, rather than as a line every consumer has to add by hand
 * to keep up. A hand-maintained list of paths is the thing that rots, and rots silently.
 */
export function paperFiles(root) {
  return {
    /** Markdown drafts — the two names a paper's prose is allowed to have. */
    md: [`${root}/*/paper.md`, `${root}/*/draft.md`],
    /** The LaTeX source of a paper (not its figures, not its vendored drafts). */
    tex: [`${root}/*/paper.tex`],
    /** The per-paper stage ledger. */
    status: [`${root}/*/PIPELINE-STATUS.md`],
    /** The venue data card. */
    venue: [`${root}/*/venue.json`],
    /** Facts extracted from the built PDF. */
    pdfFacts: [`${root}/*/_build/paper.facts.json`],
    /** Facts extracted from the bibliography. */
    refFacts: [`${root}/*/_build/refs.facts.json`],
    /** Everything under the root — for blocks that turn other tooling OFF rather than on. */
    all: [`${root}/**/*.*`],
  };
}
