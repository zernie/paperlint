/**
 * `repro/study-registered` — every study folder at the top of a paper's `repro/` has exactly one row in
 * `repro/studies.json`, every row names a folder that exists, and the index in `repro/README.md` is the
 * one the registry generates.
 *
 * What is judged, and why, is `src/domain/study-registry.ts` and docs/rules/repro/study-registered.md.
 * This file lists `repro/`, reads the registry, the README and the result files, and reports.
 *
 * ── WHY A RULE OF ITS OWN, NOT MORE OF `repro/allowed-files-only` ─────────────────────
 * `repro/allowed-files-only` judges what may stand at the top of `repro/`, by name, and accepts the
 * dated `<slug>-YYYY-MM-DD` folders of a paper that predates the registry. This rule judges the
 * registry against the folders. A paper that keeps its dated folders turns this one off and keeps
 * its layout judged.
 *
 * ── WHICH FILE IT REPORTS ON ─────────────────────────────────────────────────────
 * `PIPELINE-STATUS.md`, first line, like the layout rules: every paper has it, and ESLint lints no
 * file in `repro/`.
 */
import { basename, dirname, join } from "node:path";
import { callerPath } from "./caller-path.ts";
import {
  README,
  REPRO_BYPRODUCTS,
  REPRO_DIR,
  REPRO_DIRS,
} from "./domain/repro-layout.ts";
import {
  STUDIES_FILE,
  judgeStudies,
  studyMessage,
  type RegistryState,
  type StudyFinding,
} from "./domain/study-registry.ts";
import type { FolderLayoutDeps } from "./folder-layout-rule.ts";
import type {
  FolderRuleContext,
  FolderRuleModule,
} from "./folder-venue-rule.ts";
import type { Files } from "./ports/files.ts";
import type { StudyRegistryCodec } from "./ports/study-registry-codec.ts";
import { reproEntriesOf } from "./repro-layout-rule.ts";
import { rulePageUrl } from "./venue-rules.ts";

const STATUS_FILE = "PIPELINE-STATUS.md";

/** What the rule reads with: the disk, its listings, and the registry's parser. */
export interface StudyRegistryDeps extends FolderLayoutDeps {
  readonly codec: StudyRegistryCodec;
}

/** The text of the file at `p`; null when there is none. */
const textAt = (files: Files, p: string): string | null => {
  const b = files.readBytes(callerPath(p));
  return b === null ? null : new TextDecoder().decode(b);
};

/** The registry of the paper folder `dir`: absent, unreadable with why, or read. */
export function registryOf(
  dir: string,
  deps: Pick<StudyRegistryDeps, "files" | "codec">,
): RegistryState {
  const text = textAt(deps.files, join(dir, REPRO_DIR, STUDIES_FILE));
  if (text === null) return { kind: "absent" };
  const parsed = deps.codec.parse(text);
  return parsed.ok
    ? { kind: "read", registry: parsed.registry }
    : { kind: "unreadable", why: parsed.why };
}

/** The study folders at the top of `<dir>/repro/`: every folder but the shared ones and the byproducts. */
const studyFolders = (dir: string, deps: FolderLayoutDeps): readonly string[] =>
  reproEntriesOf(dir, deps)
    .filter(
      (e) =>
        e.kind === "dir" &&
        !REPRO_DIRS.includes(e.name) &&
        !REPRO_BYPRODUCTS.includes(e.name),
    )
    .map((e) => e.name);

/** Each `<folder>/<result_file>` of `r` that is a file. */
const existingResults = (
  dir: string,
  r: RegistryState,
  files: Files,
): ReadonlySet<string> =>
  new Set(
    (r.kind === "read" ? r.registry.studies : [])
      .flatMap((s) =>
        s.result_file === undefined ? [] : [`${s.folder}/${s.result_file}`],
      )
      .filter((p) => files.isFile(callerPath(join(dir, REPRO_DIR, p)))),
  );

/** Every finding of the paper folder `dir`'s study registry — THE function behind the rule. */
export function studyFindings(
  dir: string,
  deps: StudyRegistryDeps,
): readonly StudyFinding[] {
  const registry = registryOf(dir, deps);
  return judgeStudies({
    folders: studyFolders(dir, deps),
    registry,
    readme: textAt(deps.files, join(dir, REPRO_DIR, README)),
    existingResults: existingResults(dir, registry, deps.files),
  });
}

/** The problems a finding can be, each its own message id; the text is `studyMessage`. */
const PROBLEMS: readonly StudyFinding["problem"][] = [
  "no-registry",
  "unreadable",
  "unregistered",
  "no-folder",
  "two-rows",
  "bad-id",
  "duplicate-id",
  "folder-name",
  "long-title",
  "no-result",
  "result-file",
  "no-successor",
  "stale-index",
];

const META: FolderRuleModule["meta"] = {
  type: "suggestion",
  docs: {
    description:
      "every study folder at the top of a paper's repro/ has exactly one row in repro/studies.json, every row names a folder that exists, and repro/README.md's index is the one the registry generates",
    url: rulePageUrl("repro/study-registered"),
  },
  schema: [],
  // The whole text is `studyMessage` (src/domain/study-registry.ts).
  messages: Object.fromEntries(PROBLEMS.map((p) => [p, "{{text}}"])),
};

/** The rule, reading the folder through `deps`. */
export function studyRegistryRules(
  deps: StudyRegistryDeps,
): Readonly<Record<"study-registered", FolderRuleModule>> {
  return {
    "study-registered": {
      meta: META,
      create(context: FolderRuleContext) {
        if (basename(context.filename) !== STATUS_FILE) return {};
        return {
          root() {
            const at = context.sourceCode.getLocFromIndex(0);
            studyFindings(dirname(context.filename), deps).forEach((f) => {
              context.report({
                loc: { start: at, end: at },
                messageId: f.problem,
                data: { text: studyMessage(f) },
              });
            });
          },
        };
      },
    },
  };
}

/** The level it is on at in paperlint's own config, for every paper's `PIPELINE-STATUS.md`. */
export const STUDY_REGISTRY_RULE_LEVELS: Readonly<
  Record<"repro/study-registered", "error">
> = { "repro/study-registered": "error" };
