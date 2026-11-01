/**
 * `repro/study-result` — a `done` study whose plan is v2 shows, in its `result.json`, what its plan
 * fixed before the run: the number its claim stands or falls by, each labelling step's kappa, its
 * self-test, its funnel and its extractor's recall audit. What is judged, and why, is `src/domain/study-result.ts` and
 * docs/rules/repro/study-result.md; this file finds those studies, reads their result through the
 * study folder's reader (no link followed), and reports.
 *
 * A plan that does not parse, is a draft, or is v1 is `repro/study-registered`'s to report; here it
 * asks nothing. Reported on `PIPELINE-STATUS.md`, first line, like the other `repro/` rules.
 */
import { basename, dirname } from "node:path";
import { filter, map, pipe } from "remeda";
import { RESULT_FILE } from "./domain/study-gates.ts";
import { studiesOf, type Study } from "./domain/study-registry.ts";
import {
  RESULT_PROBLEMS,
  gatesOf,
  judgeResult,
  resultMessage,
  type ResultState,
  type ResultStudy,
} from "./domain/study-result.ts";
import type {
  FolderRuleContext,
  FolderRuleModule,
} from "./folder-venue-rule.ts";
import type { StudyDeps } from "./ports/study-deps.ts";
import type { StudyFolder } from "./ports/study-folder.ts";
import type { StudyRegistryCodec } from "./ports/study-registry-codec.ts";
import { studyFolder } from "./study-folder.ts";
import { registryOf } from "./study-registry-rule.ts";
import { rulePageUrl } from "./venue-rules.ts";

const STATUS_FILE = "PIPELINE-STATUS.md";
const NAME = "repro/study-result";

/** What the folder holds of a study's `result.json`. */
const resultState = (
  folder: StudyFolder,
  of: string,
  codec: StudyRegistryCodec,
): ResultState => {
  const read = folder.read(of, RESULT_FILE);
  return read.kind === "text" ? codec.parseResult(read.text) : read;
};

/** The row `s` as a study to judge: `done`, its plan ready, every gate decided; else null. */
const resultStudy = (
  s: Study,
  folder: StudyFolder,
  codec: StudyRegistryCodec,
): ResultStudy | null => {
  if (s.status !== "done" || s.plan === undefined) return null;
  const read = folder.read(s.folder, s.plan);
  if (read.kind !== "text") return null;
  const parsed = codec.parsePlan(read.text, s.kind);
  const gates = parsed.kind === "ready" ? gatesOf(parsed.plan) : null;
  return gates === null
    ? null
    : {
        id: s.id,
        folder: s.folder,
        ...gates,
        state: resultState(folder, s.folder, codec),
      };
};

/** Every done study of a ready plan v2 in the paper folder `paper`. */
export const resultStudies = (
  paper: string,
  deps: StudyDeps,
): readonly ResultStudy[] => {
  const folder = studyFolder(paper, deps);
  return pipe(
    studiesOf(registryOf(paper, deps)),
    map((s) => resultStudy(s, folder, deps.codec)),
    filter((s): s is ResultStudy => s !== null),
  );
};

/** On `PIPELINE-STATUS.md`, every finding of every such study of its paper, at its first line. */
const reportOn = (context: FolderRuleContext, deps: StudyDeps) => {
  if (basename(context.filename) !== STATUS_FILE) return {};
  return {
    root() {
      const at = context.sourceCode.getLocFromIndex(0);
      resultStudies(dirname(context.filename), deps)
        .flatMap(judgeResult)
        .forEach((f) => {
          context.report({
            loc: { start: at, end: at },
            messageId: f.problem,
            data: { text: resultMessage(f) },
          });
        });
    },
  };
};

/** The rule, reading the folder through `deps`. */
export const studyResultRules = (
  deps: StudyDeps,
): Readonly<Record<"study-result", FolderRuleModule>> => ({
  "study-result": {
    meta: {
      type: "suggestion",
      docs: {
        description:
          "a done study whose plan is v2 shows in its result.json what its plan fixed before the run: the number its claim stands or falls by, each labelling step's kappa, its self-test, its funnel and its extractor's recall audit",
        url: rulePageUrl(NAME),
      },
      schema: [],
      messages: Object.fromEntries(RESULT_PROBLEMS.map((p) => [p, "{{text}}"])),
    },
    create: (context) => reportOn(context, deps),
  },
});

/** Its level in paperlint's own config: an error. */
export const RESULT_RULE_LEVELS: Readonly<{ "repro/study-result": "error" }> = {
  "repro/study-result": "error",
};
