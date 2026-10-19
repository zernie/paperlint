/**
 * `repro/study-registered` — every study folder at the top of a paper's `repro/` has exactly one row in
 * `repro/studies.json`, every row names a folder that exists, a row's measurement and plan hold
 * together, and the index in `repro/README.md` is the one the registry generates. Beside it,
 * `repro/study-plan-name`, a warning: a plan still named `prereg.json`.
 *
 * What is judged, and why, is `src/domain/study-registry.ts` and docs/rules/repro/study-registered.md.
 * This file lists `repro/`, reads the registry, the README, the result files and the plans, and reports.
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
import { basename, dirname, join, posix } from "node:path";
import { filter, map, pipe } from "remeda";
import { callerPath } from "./caller-path.ts";
import {
  README,
  REPRO_BYPRODUCTS,
  REPRO_DIR,
  REPRO_DIRS,
} from "./domain/repro-layout.ts";
import {
  LEGACY_PLAN_FILE,
  PLAN_NAME_PROBLEMS,
  STUDIES_FILE,
  judgeStudies,
  planRefs,
  studiesOf,
  studyMessage,
  type PlanState,
  type RegistryState,
  type Study,
  type StudyFinding,
  type Located,
  type PlanRef,
} from "./domain/study-registry.ts";
import type { FolderLayoutDeps } from "./folder-layout-rule.ts";
import type {
  FolderRuleContext,
  FolderRuleModule,
} from "./folder-venue-rule.ts";
import type { Files } from "./ports/files.ts";
import type { ListEntries } from "./ports/list-entries.ts";
import type { StudyRegistryCodec } from "./ports/study-registry-codec.ts";
import { reproEntriesOf } from "./repro-layout-rule.ts";
import type { StudyFolder } from "./ports/study-folder.ts";
import { studyFolder } from "./study-folder.ts";
import { rulePageUrl } from "./venue-rules.ts";

const STATUS_FILE = "PIPELINE-STATUS.md";

/** What the rule reads with: the disk, its listings, and the registry's parser. */
export interface StudyRegistryDeps extends FolderLayoutDeps {
  readonly codec: StudyRegistryCodec;
  /** `repro/`'s entries, links not followed: a study folder that is a link is never read through. */
  readonly entries: ListEntries;
}

/** The text of the file at `p`; null when there is none, or a directory sits there. */
export const textAt = (files: Files, p: string): string | null => {
  const b = files.isFile(callerPath(p)) ? files.readBytes(callerPath(p)) : null;
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

/** What each `<folder>/<result_file>` of `r`'s rows is, as the study folder's reader finds it. */
const resultsOf = (
  r: RegistryState,
  folder: StudyFolder,
): ReadonlyMap<string, Located> =>
  pipe(
    studiesOf(r),
    filter(hasResultFile),
    map(
      (s) =>
        [
          `${s.folder}/${s.result_file}`,
          folder.locate(s.folder, s.result_file),
        ] as const,
    ),
    (entries) => new Map(entries),
  );

/** A row that names a result file. */
const hasResultFile = (
  s: Study,
): s is Study & { readonly result_file: string } => s.result_file !== undefined;

/**
 * The plan each row of `r` names, read and parsed, by `<folder>/<plan>`; a plan not there is left out.
 * A plan still named `prereg.json` is parsed by the loose schema of its old name.
 */
export const plansOf = (
  r: RegistryState,
  folder: StudyFolder,
  codec: StudyRegistryCodec,
): ReadonlyMap<string, PlanState> =>
  new Map(
    (r.kind === "read" ? planRefs(r.registry) : []).flatMap((ref) => {
      const state = planStateOf(ref, folder, codec);
      return state === null ? [] : [[ref.key, state] as const];
    }),
  );

/** The state of the plan `ref` names, read through `folder`; null when it is not there. */
const planStateOf = (
  { key, folder: of, plan, kind }: PlanRef,
  folder: StudyFolder,
  codec: StudyRegistryCodec,
): PlanState | null => {
  const read = folder.read(of, plan);
  switch (read.kind) {
    case "absent":
      return null;
    case "linked":
      return { kind: "linked", link: read.link };
    case "text":
      return posix.basename(key) === LEGACY_PLAN_FILE
        ? codec.parseLegacyPlan(read.text)
        : codec.parsePlan(read.text, kind);
  }
};

/** Every finding of the paper folder `dir`'s study registry — THE function behind both rules. */
export function studyFindings(
  dir: string,
  deps: StudyRegistryDeps,
): readonly StudyFinding[] {
  const registry = registryOf(dir, deps);
  const folder = studyFolder(dir, deps);
  return judgeStudies({
    folders: studyFolders(dir, deps),
    registry,
    readme: textAt(deps.files, join(dir, REPRO_DIR, README)),
    results: resultsOf(registry, folder),
    plans: plansOf(registry, folder, deps.codec),
  });
}

/** The problems `repro/study-registered` reports, each its own message id; the text is `studyMessage`. */
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
  "unknown-measurement",
  "empty-measurement",
  "unknown-requirement",
  "headline-approval",
  "bad-plan",
  "author-check",
];

/** A rule's meta: its page, and a message id per problem, the whole text being `studyMessage`. */
const metaOf = (
  name: string,
  description: string,
  problems: readonly StudyFinding["problem"][],
): FolderRuleModule["meta"] => ({
  type: "suggestion",
  docs: { description, url: rulePageUrl(name) },
  schema: [],
  messages: Object.fromEntries(problems.map((p) => [p, "{{text}}"])),
});

/** A rule that reports the findings of `problems`, reading the folder through `deps`. */
const ruleOf = (
  meta: FolderRuleModule["meta"],
  problems: readonly StudyFinding["problem"][],
  deps: StudyRegistryDeps,
): FolderRuleModule => ({
  meta,
  create(context: FolderRuleContext) {
    if (basename(context.filename) !== STATUS_FILE) return {};
    return {
      root() {
        const at = context.sourceCode.getLocFromIndex(0);
        studyFindings(dirname(context.filename), deps)
          .filter((f) => problems.includes(f.problem))
          .forEach((f) => {
            context.report({
              loc: { start: at, end: at },
              messageId: f.problem,
              data: { text: studyMessage(f) },
            });
          });
      },
    };
  },
});

/**
 * The two rules, reading the folder through `deps`: `study-registered`, the registry's errors, and
 * `study-plan-name`, a warning for a plan still named `prereg.json` — read as the plan, so a paper
 * that wrote one before `plan.json` existed is not broken, and told the name to move to.
 */
export function studyRegistryRules(
  deps: StudyRegistryDeps,
): Readonly<Record<"study-registered" | "study-plan-name", FolderRuleModule>> {
  return {
    "study-registered": ruleOf(
      metaOf(
        "repro/study-registered",
        "every study folder at the top of a paper's repro/ has exactly one row in repro/studies.json, every row names a folder that exists, its measurement and its plan hold together, and repro/README.md's index is the one the registry generates",
        PROBLEMS,
      ),
      PROBLEMS,
      deps,
    ),
    "study-plan-name": ruleOf(
      metaOf(
        "repro/study-plan-name",
        "a study's plan is named plan.json, not prereg.json",
        PLAN_NAME_PROBLEMS,
      ),
      PLAN_NAME_PROBLEMS,
      deps,
    ),
  };
}

/** The levels they are on at in paperlint's own config, for every paper's `PIPELINE-STATUS.md`. */
export const STUDY_REGISTRY_RULE_LEVELS: Readonly<{
  "repro/study-registered": "error";
  "repro/study-plan-name": "warn";
}> = { "repro/study-registered": "error", "repro/study-plan-name": "warn" };
