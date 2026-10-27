/**
 * THE RULES OVER A PAPER'S FROZEN VERSIONS — the convention `versions/<cycle>/<stage>.{pdf,tex}` and
 * its lock (src/domain/versions.ts):
 *
 *   versions/layout              error  on PIPELINE-STATUS.md: every entry of versions/ is a cycle's
 *                                       folder or the lock, every file in a folder a stage's .pdf or
 *                                       .tex, every PDF with its source, nothing sent from a cycle still
 *                                       porting, every file as the lock recorded it
 *   cycle/submitted-frozen       error  on PIPELINE-STATUS.md: a cycle with a submission on the portal
 *                                       has `versions/<id>/submitted.pdf` (#308)
 *   cycle/draft-drift            warn   on paper.tex: the draft has moved on from the open cycle's
 *                                       frozen source, by so many lines
 *   cycle/camera-ready-source    error  on paper.tex: the last cycle is accepted, paper.tex has moved on
 *                                       from what was accepted, and no camera-ready is frozen yet
 *
 * ── WHY THE FOLDER IS LISTED AND NOT LINTED ─────────────────────────────────────────────────
 * A frozen PDF is never handed to ESLint, and a frozen `.tex` is kept out of the linted set on purpose
 * (src/paper-includes.ts): a rule fired per file could not see either. The folder is listed once per
 * paper, from the scorecard every paper has, as `paper/allowed-files-only` lists the paper's root.
 *
 * ── WHO SPEAKS WHEN THERE IS NOTHING TO JUDGE ───────────────────────────────────────────────
 * A paper that keeps no `cycles` (the flat form) has no attempt to name a folder after: all four are
 * silent, and `paper/stages` with `paper/source` judge its `stages:` list as before. A `cycles` record
 * that does not read is refused by `paperlint lint` before any rule runs.
 *
 * ── WHY THE DRIFT IS A WARNING, AND THE CAMERA-READY AN ERROR ───────────────────────────────
 * Between venues the draft is SUPPOSED to move on from what is under review: the warning says how far,
 * so an author answering a reviewer knows the line numbers point into the frozen file. Once the venue
 * accepts, the camera-ready has to be what was accepted plus the changes asked for — building it from
 * a draft that moved on sends the venue a paper its reviewers never read.
 */
import { basename, dirname } from "node:path";
import type { Current, Cycle } from "./domain/cycle.ts";
import {
  driftText,
  frozenKey,
  judgeVersions,
  unfrozenSubmissions,
  venueName,
  type VersionFinding,
} from "./domain/versions.ts";
import type {
  FolderRuleContext,
  FolderRuleModule,
} from "./folder-venue-rule.ts";
import type { TexRuleModule } from "./tex-venue-rules.ts";
import { readPaper, type ProseDeps } from "./tex-paper.ts";
import { rulePageUrl } from "./venue-rules.ts";
import {
  cyclesIn,
  draftDrift,
  entriesIn,
  factsOfFrozen,
  hasFrozen,
  readLock,
  versionsDir,
  type VersionsDeps,
} from "./versions.ts";

const STATUS_FILE = "PIPELINE-STATUS.md";

const LOCK_COMMAND = "`npx paperlint versions lock <paper>`";

const LAYOUT_META: FolderRuleModule["meta"] = {
  type: "suggestion",
  docs: {
    description:
      "versions/ holds a folder per cycle and a file per stage, every PDF with its source, each file as versions/lock.json recorded it",
    url: rulePageUrl("versions/layout"),
  },
  schema: [],
  messages: {
    stray: "`versions/{{path}}` is not part of the layout — {{hint}}",
    unknownCycle:
      "`versions/{{folder}}/` names no cycle in paperlint.json — a folder in versions/ is one attempt, named by its cycle's id ({{known}}): rename it to the attempt it holds, or move it to extra/",
    noSource: `\`versions/{{pdf}}\` is frozen without its source: freeze the .tex it was built from as \`versions/{{tex}}\` and run ${LOCK_COMMAND} — a reviewer's line numbers point into that source, and squash merges and \`git gc\` destroy the commit that held it`,
    porting:
      "`versions/{{file}}` was sent in the cycle «{{id}}», whose phase is still `porting`: a PDF went to the venue while the record says the source is in the previous venue's template — finish the port and drop the phase, or the file is in the wrong folder",
    noLock: `versions/ holds frozen files and no lock.json — ${LOCK_COMMAND} records their bytes and digests; paperlint writes the lock, nobody edits it`,
    badLock: `versions/lock.json: {{why}} — paperlint writes this file: restore it from git, or write it anew with ${LOCK_COMMAND}`,
    notLocked: `\`versions/{{file}}\` is not in versions/lock.json — ${LOCK_COMMAND} records it (a file \`submission … --save\` froze is locked already)`,
    changed: `\`versions/{{file}}\` is not the file the lock recorded on {{frozen}} ({{want}} bytes then, {{got}} now, and another digest) — a frozen file does not change: restore it from git; if it was replaced on purpose, ${LOCK_COMMAND} records it anew`,
    lockedGone: `versions/lock.json records \`{{file}}\`, and the file is not there — a frozen version was deleted: restore it from git; if it went on purpose, ${LOCK_COMMAND} drops the entry`,
  },
};

const FROZEN_META: FolderRuleModule["meta"] = {
  type: "suggestion",
  docs: {
    description:
      "a cycle with a submission on the venue's portal has the PDF it sent frozen as versions/<cycle>/submitted.pdf",
    url: rulePageUrl("cycle/submitted-frozen"),
  },
  schema: [],
  messages: {
    unfrozen: `cycle «{{id}}» has submission {{submission}} on the portal, and \`versions/{{pdf}}\` is not there: what the reviewers read is not frozen. \`npx paperlint submission update <paper> --save\` freezes what it sends; for an upload made before, put that PDF there (\`submission show\` gives its size and sha256) with the source it was built from beside it as submitted.tex, then run ${LOCK_COMMAND}`,
  },
};

/** What the rules on the scorecard read with: the disk and its listings. */
export type VersionStatusDeps = VersionsDeps;

/** The findings of one scorecard rule for the paper folder `dir`; none for a paper without cycles. */
function statusFindings(
  name: "layout" | "submitted-frozen",
  dir: string,
  deps: VersionStatusDeps,
): readonly VersionFinding[] {
  const cycles = cyclesIn(dir, deps.files);
  if (cycles === null) return [];
  const root = versionsDir(dir);
  return name === "layout"
    ? judgeVersions({
        cycles: cycles.list,
        root: entriesIn(root, deps),
        inFolder: (folder) => entriesIn(`${root}/${folder}`, deps),
        lock: readLock(dir, deps.files),
        factsOf: factsOfFrozen(dir, deps.files),
      })
    : unfrozenSubmissions(cycles.list, hasFrozen(dir, deps.files));
}

const statusRule = (
  meta: FolderRuleModule["meta"],
  name: "layout" | "submitted-frozen",
  deps: VersionStatusDeps,
): FolderRuleModule => ({
  meta,
  create(context: FolderRuleContext) {
    if (basename(context.filename) !== STATUS_FILE) return {};
    return {
      root() {
        const at = context.sourceCode.getLocFromIndex(0);
        statusFindings(name, dirname(context.filename), deps).forEach((f) => {
          context.report({ loc: { start: at, end: at }, ...f });
        });
      },
    };
  },
});

/** The `versions` plugin's rule, on every `PIPELINE-STATUS.md`. */
export const versionLayoutRules = (
  deps: VersionStatusDeps,
): Readonly<Record<"layout", FolderRuleModule>> => ({
  layout: statusRule(LAYOUT_META, "layout", deps),
});

/** The `cycle` plugin's rule over the frozen folder, on every `PIPELINE-STATUS.md`. */
export const submittedFrozenRules = (
  deps: VersionStatusDeps,
): Readonly<Record<"submitted-frozen", FolderRuleModule>> => ({
  "submitted-frozen": statusRule(FROZEN_META, "submitted-frozen", deps),
});

// ── on paper.tex: the draft against the frozen source ────────────────────────────────────

const DRIFT_META: TexRuleModule["meta"] = {
  type: "suggestion",
  docs: {
    description:
      "paper.tex has moved on from the source frozen when the open cycle's PDF was sent — said with how many lines",
    url: rulePageUrl("cycle/draft-drift"),
  },
  schema: [],
  messages: {
    drift:
      "paper.tex has moved on from `versions/{{key}}`, the version under review at {{venue}}: {{drift}} — expected while the draft heads for its next venue; a reviewer's line numbers point into the frozen file, not this one",
  },
};

const CAMERA_META: TexRuleModule["meta"] = {
  type: "problem",
  docs: {
    description:
      "once the last cycle is accepted, the camera-ready starts from the frozen source that was accepted, not from a draft that moved on",
    url: rulePageUrl("cycle/camera-ready-source"),
  },
  schema: [],
  messages: {
    base: "cycle «{{id}}» is accepted, and paper.tex has moved on from what was accepted, `versions/{{key}}`: {{drift}}. The camera-ready starts from that frozen source — copy it over paper.tex and carry over only the changes the reviewers asked for. Sending the camera-ready with `npx paperlint submission update <paper> --save` freezes it as versions/{{id}}/camera-ready.pdf, which ends this check",
  },
};

/** The cycle a draft rule judges: the open one for the drift, the accepted one still without a camera-ready. */
function judgedCycle(
  name: "draft-drift" | "camera-ready-source",
  current: Current,
  has: (key: string) => boolean,
): Cycle | null {
  if (name === "draft-drift")
    return current.kind === "cycle" ? current.cycle : null;
  if (current.kind !== "accepted") return null;
  const id = current.cycle.id;
  const cameraReady =
    has(frozenKey(id, "camera-ready", "pdf")) ||
    has(frozenKey(id, "camera-ready", "tex"));
  return cameraReady ? null : current.cycle;
}

/** The finding of one draft rule, or none. */
function draftFinding(
  name: "draft-drift" | "camera-ready-source",
  dir: string,
  draft: string,
  deps: ProseDeps,
): VersionFinding | null {
  const cycles = cyclesIn(dir, deps.files);
  if (cycles === null) return null;
  const c = judgedCycle(name, cycles.current, hasFrozen(dir, deps.files));
  if (c === null) return null;
  const d = draftDrift(dir, cycles, draft, deps.files);
  if (d.kind !== "drift") return null;
  return {
    messageId: name === "draft-drift" ? "drift" : "base",
    data: {
      id: c.id,
      key: d.key,
      venue: venueName(c),
      drift: driftText(d.drift),
    },
  };
}

const draftRule = (
  meta: TexRuleModule["meta"],
  name: "draft-drift" | "camera-ready-source",
  deps: ProseDeps,
): TexRuleModule => ({
  meta,
  create(context) {
    if (basename(context.filename) !== "paper.tex") return {};
    return {
      root() {
        const sc = context.sourceCode;
        const draft = readPaper(context.filename, sc.raw ?? sc.text, deps).text;
        const f = draftFinding(name, dirname(context.filename), draft, deps);
        if (f === null) return;
        const at = sc.getLocFromIndex(0);
        context.report({ loc: { start: at, end: at }, ...f });
      },
    };
  },
});

/** The `cycle` plugin's rules over the draft, for every `paper.tex`. */
export const draftRules = (
  deps: ProseDeps,
): Readonly<Record<"draft-drift" | "camera-ready-source", TexRuleModule>> => ({
  "draft-drift": draftRule(DRIFT_META, "draft-drift", deps),
  "camera-ready-source": draftRule(CAMERA_META, "camera-ready-source", deps),
});

/** The levels they are on at in paperlint's own config. */
export const VERSION_STATUS_RULE_LEVELS: Readonly<
  Record<"versions/layout" | "cycle/submitted-frozen", "error">
> = { "versions/layout": "error", "cycle/submitted-frozen": "error" };

export const DRAFT_RULE_LEVELS: Readonly<
  Record<"cycle/draft-drift" | "cycle/camera-ready-source", "warn" | "error">
> = { "cycle/draft-drift": "warn", "cycle/camera-ready-source": "error" };
