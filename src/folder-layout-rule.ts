/**
 * `paper/folder-layout` — the root of a paper folder holds only paperlint's own files and folders.
 *
 * What may stand there, and why each entry, is `src/domain/paper-layout.ts` (the one list) and
 * docs/rules/paper/folder-layout.md. This file reads the folder and the paper's settings, and reports.
 *
 * ── WHY A RULE THAT LISTS A DIRECTORY ───────────────────────────────────────────
 * A structure linter over file NAMES (ls-lint, ESLint's `project-structure`) judges the files handed
 * to it, and ESLint is handed only the files paperlint lints: a stray `.pdf`, `.py` or `.md` is never
 * one of them, so a rule fired per file cannot see it. Listing the folder is one `readdir`; a rule is
 * plain JS and may do it (root CLAUDE.md, "Measure before calling it impossible").
 *
 * ── WHICH FILE IT REPORTS ON ─────────────────────────────────────────────────────
 * The folder is not a file ESLint lints; `PIPELINE-STATUS.md` is, in every paper (`paperlint lint`
 * requires it, `paperlint new` writes it). Each stray entry is one finding on its first line, the
 * place `paper/folder-venue-leftover` reports for the same reason.
 *
 * ── WHAT THE SETTINGS ADD ────────────────────────────────────────────────────────
 * `pdf`, `talk.dir`, and a preset file of the paper's own (`extends`, or any cycle's) may name an
 * entry at the root; each such entry is allowed while the settings name it. Settings that do not parse
 * add nothing: `paperlint lint` refuses them before ESLint runs, and `pdf/profile` names the problem.
 */
import { basename, dirname, join, posix, relative, resolve } from "node:path";
import { callerPath } from "./caller-path.ts";
import {
  judgeLayout,
  strayMessage,
  type LayoutEntry,
} from "./domain/paper-layout.ts";
import type {
  FolderRuleContext,
  FolderRuleModule,
} from "./folder-venue-rule.ts";
import { readPaperSettings, type PaperSettings } from "./paper-settings.ts";
import type { Files } from "./ports/files.ts";
import type { ListDir } from "./ports/talk-media.ts";
import { rulePageUrl } from "./venue-rules.ts";

const STATUS_FILE = "PIPELINE-STATUS.md";

/** What the rule reads with: the disk, and the names in a directory. */
export interface FolderLayoutDeps {
  readonly files: Files;
  readonly listDir: ListDir;
}

/** The first segment of `p`, relative to the paper folder `dir`; null when it is not inside it. */
function rootOf(dir: string, p: string): string | null {
  const first = relative(dir, resolve(dir, p)).split(/[\\/]/, 1).join("");
  return first === "" || first === ".." ? null : first;
}

/** A preset spec that names a file (`./venue.jsonc`), not a shipped preset (`paperlint:aidc`). */
const isPresetFile = (spec: string): boolean =>
  spec.startsWith("./") || spec.startsWith("../");

/** Every path the settings name relative to the paper: the PDF, the talk folder, its preset files. */
const pathsOf = (s: PaperSettings): readonly string[] => [
  ...(s.pdf === null ? [] : [s.pdf]),
  ...(s.talk === null ? [] : [s.talk.dir]),
  ...[
    s.extends,
    ...(s.cycles?.list ?? []).map((c) =>
      c.venue.kind === "preset" ? c.venue.extends : null,
    ),
  ].filter((spec): spec is string => spec !== null && isPresetFile(spec)),
];

/** What the paper's settings name at the root of `dir`, each once; none without readable settings. */
export function declaredRoots(dir: string, files: Files): readonly string[] {
  const read = readPaperSettings(files, dir);
  if (!read.ok || read.value === null) return [];
  return [
    ...new Set(
      pathsOf(read.value)
        .map((p) => rootOf(dir, posix.normalize(p)))
        .filter((r): r is string => r !== null),
    ),
  ];
}

/** The folder's root entries, each a file or a folder. */
const entriesOf = (
  dir: string,
  deps: FolderLayoutDeps,
): readonly LayoutEntry[] =>
  [...deps.listDir(callerPath(dir))].sort().map((name) => ({
    name,
    kind: deps.files.isFile(callerPath(join(dir, name))) ? "file" : "dir",
  }));

/**
 * The text of each stray entry among `entries` of the paper folder `dir` — THE one function behind
 * both the rule and the `paper-folder-layout` hook (`src/folder-layout-hook.ts`), so the two cannot
 * disagree about what is allowed or what to say.
 */
export const strayTexts = (
  dir: string,
  entries: readonly LayoutEntry[],
  files: Files,
): readonly string[] =>
  judgeLayout(entries, { roots: declaredRoots(dir, files) }).map(strayMessage);

const META: FolderRuleModule["meta"] = {
  type: "suggestion",
  docs: {
    description:
      "the paper folder's root holds only paperlint's own files and folders; anything else goes into the folder for its kind, or extra/",
    url: rulePageUrl("paper/folder-layout"),
  },
  schema: [],
  messages: {
    // The whole text is `strayMessage` (src/domain/paper-layout.ts), the one the hook that fires on
    // writing such an entry sends too.
    stray: "{{text}}",
  },
};

/** The rule, reading the folder and the paper's settings through `deps`. */
export function folderLayoutRules(
  deps: FolderLayoutDeps,
): Readonly<Record<"folder-layout", FolderRuleModule>> {
  return {
    "folder-layout": {
      meta: META,
      create(context: FolderRuleContext) {
        if (basename(context.filename) !== STATUS_FILE) return {};
        return {
          root() {
            const dir = dirname(context.filename);
            const at = context.sourceCode.getLocFromIndex(0);
            strayTexts(dir, entriesOf(dir, deps), deps.files).forEach(
              (text) => {
                context.report({
                  loc: { start: at, end: at },
                  messageId: "stray",
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
export const FOLDER_LAYOUT_RULE_LEVELS: Readonly<
  Record<"paper/folder-layout", "error">
> = { "paper/folder-layout": "error" };
