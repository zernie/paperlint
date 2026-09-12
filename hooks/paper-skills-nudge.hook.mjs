/**
 * paper-skills-nudge — a PostToolUse react: editing a paper SOURCE surfaces the static
 * pre-submit checklist, so the pipeline is driven rather than winged.
 *
 * ── THE BUG THIS REMOVES ────────────────────────────────────────────────────
 * Its shell predecessor was dead for twelve days: it read the payload from `$CLAUDE_TOOL_INPUT`
 * while the harness delivers on stdin, so its path match never ran and it exited 0 in silence
 * across dozens of paper edits. An advisory hook cannot be NOTICED failing — silence is also its
 * success case, which is why it took a frozen throttle stamp to find it. A `react` never touches
 * the payload: the runtime decodes the event and hands in `e.path`, so the whole family of "read
 * the wrong input / wrote the wrong field / exited the wrong code" is unrepresentable here.
 *
 * ── SPLIT FROM `paper-status-gates`, DELIBERATELY ───────────────────────────
 * This carries the STATIC checklist. The part that reads `<paper-dir>/PIPELINE-STATUS.md` and
 * surfaces unrun gates lives in `paper-status-gates.hook.mjs`, because it needs a tool run and
 * this one does not. Two hooks on one event is the honest line between a constant and an I/O,
 * not an accident of porting.
 *
 * ── DELIVERY, MEASURED (2026-09-12, vigiles 27.1.4) ─────────────────────────
 * `PostToolUse` is in the adapter's `injectableEvents`, so a `notice` on this event reaches the
 * model as `hookSpecificOutput.additionalContext` on STDOUT — 1 346 bytes on a paper edit, 0 on
 * anything else — with a copy on stderr for a human. That is NOT true of every event: `Stop` and
 * `PreToolUse` are absent from that list, and a `notice` there reaches only the debug log. Do not
 * move this hook to another event assuming its text still lands.
 *
 * ── WHY `.mjs` AND NOT A `.hook.ts` SPEC ────────────────────────────────────
 * Measured in `paper-edit-guard.hook.mjs` — a `.ts` hook reached through `node_modules` does not
 * load at all, and a consumer-side thin spec that imports this logic is refused by
 * `vigiles compile` and can therefore never be re-stamped. The full reasoning, with both
 * measurements, is in that file's header; the capability surface of this one is asserted by
 * `hooks.harness.mjs` running `checkHookImports` over the shipped artifact.
 */
import { experimental_defineReact, tools, provide, notice, nothing } from "vigiles/hook";

/** The key every carrier of this package reads its consumer-specific settings from. */
const CONFIG_KEY = "research-paper-pipeline";
/** The default. A consumer that declares nothing is assumed to keep papers in `papers/`. */
const DEFAULT_PAPERS_ROOT = "papers";

/**
 * The declared papers root, or `null` when it is unusable.
 *
 * ⚠️ NO TRAILING-SLASH NORMALISATION HERE, and that is measured rather than sloppy. The guard
 * hand-writes its own prefix tests (`startsWith(p + "/")`), where a slash the consumer typed
 * becomes `//` and matches nothing — a defect that shipped once. This hook instead uses
 * `e.path.under()`, and vigiles normalises the prefix itself (`normalizePrefix` →
 * `trimTrailingSeparators`), so `"docs/papers/"` and `"docs/papers"` are the same prefix to it.
 * A normalise here would be a line no test could kill, which is a line that documents a
 * defence that does not exist. Checked 2026-09-12 by mutation: removing it left the harness
 * green, which is the finding that produced this paragraph.
 *
 * ⚠️ A NUDGE FALLS SILENT WHERE THE GATE REFUSES, and the asymmetry is the decision, not an
 * inconsistency. `paper-edit-guard` denies on an unreadable declaration because a gate that
 * quietly reverts to the default would pass every write it exists to stop. This hook has no such
 * failure mode: with no root it prints nothing, which is what it already does on every
 * non-paper edit. Denying here would mean an advisory hook blocking work over a courtesy
 * message — and a `react` cannot deny at all: its type has no `deny`, so it always exits 0.
 *
 * 🔴 `declared === undefined`, NOT `declared ?? DEFAULT` — `"papers": null` is a keystroke, not
 * an absence. Same distinction as every other carrier in this package.
 */
const papersRoot = (rawPkg) => {
  let declared;
  try {
    declared = JSON.parse(rawPkg)?.[CONFIG_KEY]?.papers;
  } catch {
    return null;
  }
  const root = declared === undefined ? DEFAULT_PAPERS_ROOT : declared;
  if (typeof root !== "string" || root.length === 0) return null;
  return root;
};

/** A paper SOURCE — a `.tex`, or a markdown-drafted `paper.md` / `draft.md`. Not every note or README. */
const isPaperSource = (p) => p.endsWith(".tex") || /\/(paper|draft)\.md$/.test(p);

const CHECKLIST = `📄 Editing a paper — drive it with the \`paper-pipeline\` skill, don't wing the review.
  → Update <paper-dir>/PIPELINE-STATUS.md: mark the row for any stage you (re)ran, and read its
    verdict line to see what's still ☐/◐/⚠ before submit.
Pre-submit checklist (skills):
  • verify-citations — every \\cite real; nearest-neighbor delta explicit
  • study-accepted-papers — the venue's Accept→Strong levers
  • analyze-sibling-paper — deep-read each close competitor; SAVE colocated in <paper-dir>/siblings/
  • grade-paper-writing — BLIND ≥3-grader panel (absolute scale) + cold-read stall pass
  • pc-panel-review / paper-adversarial-review — multi-axis scorecard + the "reads-like-slop" halo
  • harden-paper — threat-model · ethics · page-fit · de-anon · ACTUALLY RUN the artifact clean
RULES earned the hard way:
  • After every aggressive rewrite/thinning pass → claim-preservation DIFF vs the pre-pass baseline
  • Numbers overwhelming the reader? secondary numbers live in the artifact, not the paper
  • bib inside \\begin{filecontents*}{refs.bib}? edit it THERE — refs.bib is overwritten on build
  • Done + claim-clean + page-legal ships. Further churn breaks about as much as it fixes.`;

export default experimental_defineReact({
  on: "PostToolUse",
  match: tools("Edit", "Write", "MultiEdit"),
  needs: [provide("pkg", "cat package.json")],
  react: (e) => {
    const root = papersRoot(e.ctx.pkg);
    if (root === null) return nothing();
    return e.path.under([root]) && isPaperSource(e.path.raw) ? notice(CHECKLIST) : nothing();
  },
});
