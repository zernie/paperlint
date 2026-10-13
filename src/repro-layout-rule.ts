/**
 * `repro/allowed-files-only` — the top of a paper's `repro/` holds an index, the shared `tools/` and
 * `data/`, and one dated folder per study, each with a `README.md`.
 *
 * What may stand there, and why, is `src/domain/repro-layout.ts` and docs/rules/repro/allowed-files-only.md.
 * This file lists the folder and reports.
 *
 * ── WHY A RULE OF ITS OWN, NOT MORE OF `paper/allowed-files-only` ─────────────────────
 * Each entry is judged by exactly one rule: `paper/allowed-files-only` judges the paper folder's root,
 * where `repro/` is allowed, and this rule judges what is inside `repro/`. Neither reports an entry
 * the other does, so a stray entry gets one message. A rule of its own also has its own page and its
 * own switch: a paper whose `repro/` predates the layout can turn this one off and keep its root
 * judged.
 *
 * ── WHICH FILE IT REPORTS ON ─────────────────────────────────────────────────────
 * `PIPELINE-STATUS.md`, first line, like `paper/allowed-files-only`: every paper has it, and `repro/` may
 * have no file ESLint lints at all.
 */
import { basename, dirname, join } from "node:path";
import { callerPath } from "./caller-path.ts";
import {
  README,
  REPRO_DIR,
  judgeRepro,
  reproMessage,
  type ReproEntry,
} from "./domain/repro-layout.ts";
import type {
  FolderRuleContext,
  FolderRuleModule,
} from "./folder-venue-rule.ts";
import type { FolderLayoutDeps } from "./folder-layout-rule.ts";
import type { Files } from "./ports/files.ts";
import type { LayoutEntry } from "./domain/paper-layout.ts";
import { rulePageUrl } from "./venue-rules.ts";

const STATUS_FILE = "PIPELINE-STATUS.md";

/** `entries` of `<dir>/repro/`, each folder with whether it holds a README.md. */
const withReadme = (
  dir: string,
  entries: readonly LayoutEntry[],
  files: Files,
): readonly ReproEntry[] =>
  entries.map((e) => ({
    ...e,
    hasReadme:
      e.kind === "dir" &&
      files.isFile(callerPath(join(dir, REPRO_DIR, e.name, README))),
  }));

/**
 * The text of each finding among `entries` at the top of the paper folder `dir`'s `repro/` — THE one
 * function behind both the rule and the `paper-folder-layout` hook, so the two cannot disagree.
 */
export const reproTexts = (
  dir: string,
  entries: readonly LayoutEntry[],
  files: Files,
): readonly string[] =>
  judgeRepro(withReadme(dir, entries, files)).map(reproMessage);

/** The entries at the top of `<dir>/repro/`, each a file or a folder; none without a `repro/`. */
export const reproEntriesOf = (
  dir: string,
  deps: FolderLayoutDeps,
): readonly LayoutEntry[] =>
  [...deps.listDir(callerPath(join(dir, REPRO_DIR)))].sort().map((name) => ({
    name,
    kind: deps.files.isFile(callerPath(join(dir, REPRO_DIR, name)))
      ? "file"
      : "dir",
  }));

const META: FolderRuleModule["meta"] = {
  type: "suggestion",
  docs: {
    description:
      "the top of a paper's repro/ holds README.md, .gitignore, tools/, data/ and one <slug>-YYYY-MM-DD folder per study, each with a README.md",
    url: rulePageUrl("repro/allowed-files-only"),
  },
  schema: [],
  messages: {
    // The whole text is `reproMessage` (src/domain/repro-layout.ts), the one the hook sends too.
    misplaced: "{{text}}",
  },
};

/** The rule, reading the folder through `deps`. */
export function reproLayoutRules(
  deps: FolderLayoutDeps,
): Readonly<Record<"allowed-files-only", FolderRuleModule>> {
  return {
    "allowed-files-only": {
      meta: META,
      create(context: FolderRuleContext) {
        if (basename(context.filename) !== STATUS_FILE) return {};
        return {
          root() {
            const dir = dirname(context.filename);
            const at = context.sourceCode.getLocFromIndex(0);
            reproTexts(dir, reproEntriesOf(dir, deps), deps.files).forEach(
              (text) => {
                context.report({
                  loc: { start: at, end: at },
                  messageId: "misplaced",
                  data: { text },
                });
              },
            );
          },
        };
      },
    },
  };
}

/** The level it is on at in paperlint's own config, for every paper's `PIPELINE-STATUS.md`. */
export const REPRO_LAYOUT_RULE_LEVELS: Readonly<
  Record<"repro/allowed-files-only", "error">
> = { "repro/allowed-files-only": "error" };
