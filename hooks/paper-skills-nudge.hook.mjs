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
 * `hooks.harness.ts` running `checkHookImports` over the shipped artifact.
 */
import {
  experimental_defineReact,
  tools,
  provide,
  notice,
  nothing,
  record,
  state,
} from "vigiles/hook";

/** The tool's name — the package this hook resolves its scripts through. */
export const CONFIG_KEY = "paperlint";
/** The settings file at the project root. Optional: absent means every default. */
export const CONFIG_FILE = "paperlint.json";
/** The default. A consumer that declares nothing is assumed to keep papers in `papers/`. */
export const DEFAULT_PAPERS_ROOT = "papers";
/**
 * The field of the root `paperlint.json` that names the papers directory. These are copies of the
 * constants in `lib/paper-config.mjs` (a hook may import nothing but `vigiles/hook`);
 * `lib/paper-config.harness.mjs` checks that the copies match.
 */
export const PAPERS_DIR_FIELD = "papersDir";

/**
 * The provider: the root `paperlint.json`, or `{}` when the project has none — so an ABSENT file
 * (every default) and an UNREADABLE one (the empty string the runtime gives a failed provider)
 * stay two different inputs.
 *
 * 🔴 THE PATH IS ANCHORED TO THE PROJECT ROOT. vigiles runs a provider "via execSync in the hook's
 * cwd", which is the consumer's wiring — a string this hook cannot see. A bare relative path reads
 * from whatever directory the Bash tool last moved to.
 */
const READ_CONFIG = `f="\${CLAUDE_PROJECT_DIR:-.}/${CONFIG_FILE}"; if [ -e "$f" ]; then cat "$f"; else echo '{}'; fi`;

/**
 * The declared papers root, or `null` when it is unusable.
 *
 * ⚠️ NO TRAILING-SLASH NORMALISATION HERE, and that is measured rather than sloppy. The guard
 * hand-writes its own prefix tests (`startsWith(p + "/")`), where a slash the consumer typed
 * becomes `//` and matches nothing — a defect that shipped once. This hook instead uses
 * `e.path.under()`, and vigiles normalises the prefix itself (`normalizePrefix` →
 * `trimTrailingSeparators`), so `"docs/papers/"` and `"docs/papers"` are the same prefix to it.
 * A normalise here would be a line no test could kill, which is a line that documents a
 * defence that does not exist. Confirmed 2026-09-12: removing it left the harness green, which
 * is the finding that produced this paragraph.
 *
 * ⚠️ A NUDGE FALLS SILENT WHERE THE GATE REFUSES, and the asymmetry is the decision, not an
 * inconsistency. `paper-edit-guard` denies on an unreadable declaration because a gate that
 * quietly reverts to the default would pass every write it exists to stop. This hook has no such
 * failure mode: with no root it prints nothing, which is what it already does on every
 * non-paper edit. Denying here would mean an advisory hook blocking work over a courtesy
 * message — and a `react` cannot deny at all: its type has no `deny`, so it always exits 0.
 *
 * 🔴 `declared === undefined`, NOT `declared ?? DEFAULT` — `"papersDir": null` is a keystroke, not
 * an absence. Same distinction as every other carrier in this package.
 */
const papersRoot = (rawConfig) => {
  let declared;
  try {
    declared = JSON.parse(rawConfig)?.[PAPERS_DIR_FIELD];
  } catch {
    return null;
  }
  const root = declared === undefined ? DEFAULT_PAPERS_ROOT : declared;
  if (typeof root !== "string" || root.length === 0) return null;
  return root;
};

/**
 * The shipped skills, one per line as name, a tab, and the description, read from the package's own
 * skills folder (the consumer's node_modules copy; in this repository, its own folder). The list used
 * to be typed into this file and drifted: a skill added to the package never reached the nudge.
 * An empty result (no folder, no skills) leaves the list out and keeps the rest of the message.
 */
const READ_SKILLS =
  `d="\${CLAUDE_PROJECT_DIR:-.}/node_modules/paperlint/skills"; [ -d "$d" ] || d="\${CLAUDE_PROJECT_DIR:-.}/skills"; ` +
  `for f in "$d"/*/SKILL.md; do [ -f "$f" ] || continue; ` +
  `awk 'NR==1 && $0!="---" {exit} NR>1 && $0=="---" {exit} ` +
  `/^name: / {n=substr($0, 7)} /^description: / {d=substr($0, 14)} END {if (n!="") print n "\t" d}' "$f"; done`;

/** One line per skill: its name and the description's first clause, at most 110 characters. */
export const skillLines = (raw) =>
  String(raw ?? "")
    .split("\n")
    .map((l) => l.split("\t"))
    .filter(([name]) => /^[a-z0-9-]+$/.test(name))
    .map(([name, desc = ""]) => {
      const clause = desc
        .replace(/^["']|["']$/g, "")
        .replace(/\\"/g, '"')
        .split(/ — |\. /)[0];
      return `  • ${name} — ${clause.length > 110 ? `${clause.slice(0, 107)}...` : clause}`;
    });

/**
 * The paper a path belongs to: the first folder under the papers root, when the file sits inside one.
 * A file directly in the root (its README) belongs to no paper and stays silent.
 */
export const paperOf = (rel, root) => {
  if (typeof rel !== "string") return null;
  const prefix = `${root.replace(/\/+$/, "")}/`;
  if (!rel.startsWith(prefix)) return null;
  const parts = rel.slice(prefix.length).split("/");
  return parts.length >= 2 && parts[0] !== "" ? parts[0] : null;
};

/** How long one paper stays nudged. Touching a different paper speaks again at once. */
const QUIET_FOR = "3h";

export const message = (paper, lines) =>
  `📄 Working on paper "${paper}". Before deciding a step yourself, check whether a skill owns it ` +
  "(Skill tool) — a hand-written brief or a winged review is how pipeline stages get skipped.\n" +
  "  → Update <paper-dir>/PIPELINE-STATUS.md: mark the row for any stage you (re)ran, and read its\n" +
  "    verdict line to see what's still ☐/◐/⚠ before submit.\n" +
  (lines.length
    ? `The paper skills shipped with this package:\n${lines.join("\n")}\n`
    : "") +
  "RULES earned the hard way:\n" +
  "  • After every aggressive rewrite/thinning pass → claim-preservation DIFF vs the pre-pass baseline\n" +
  "  • Numbers overwhelming the reader? secondary numbers live in the artifact, not the paper\n" +
  "  • bib inside \\begin{filecontents*}{refs.bib}? edit it THERE — refs.bib is overwritten on build\n" +
  "  • Done + claim-clean + page-legal ships. Further churn breaks about as much as it fixes.";

export default experimental_defineReact({
  on: "PostToolUse",
  // Read too: the moment a paper is opened is when its skills are worth knowing, before anything is
  // decided — an edit-only trigger fires after the decision.
  match: tools("Read", "Edit", "Write", "MultiEdit"),
  // The provider is anchored to the project root (`READ_CONFIG`, above).
  //
  // ⚠️ THE FAILURE HERE IS SILENT, which makes it more dangerous than its neighbor's.
  // `paper-edit-guard` on PreToolUse DENIES loudly and visibly when the declaration is
  // unreadable. This hook on PostToolUse just returns `nothing()`, i.e. simply stops firing:
  // the `cat` fails → empty string → `JSON.parse("")` throws → `papersRoot` returns null
  // → silence. And silence is exactly what a nudge's success state looks like, so a dead hook
  // is indistinguishable from a working one.
  needs: [
    provide("config", READ_CONFIG),
    provide("skills", READ_SKILLS),
    state("paper-skills.shown"),
  ],
  react: (e) => {
    const root = papersRoot(e.ctx.config);
    if (root === null || !e.path.under([root])) return nothing();
    const paper = paperOf(e.path.rel, root);
    if (paper === null) return nothing();
    const shown = e.ctx["paper-skills.shown"];
    // Once per paper: the same paper again within QUIET_FOR stays silent; another paper speaks.
    if (shown.value === paper && shown.fresherThan(QUIET_FOR)) return nothing();
    return notice(
      message(paper, skillLines(e.ctx.skills)),
      record("paper-skills.shown", paper),
    );
  },
});
