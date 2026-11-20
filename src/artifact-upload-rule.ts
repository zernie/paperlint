/**
 * `artifact/upload-current` — the paper prints numbers the uploaded artifact was not built for.
 *
 * OPT-IN, configured the ESLint way: off unless turned on with its options,
 * `"artifact/upload-current": ["warn", { "numbers": "numbersdef.tex" }]` (`record` names another
 * record file). It reads two local files and never the network: the upload record
 * (`src/domain/artifact-upload.ts`), written by `paperlint artifact record|upload` or by anyone, and
 * the paper's numbers file of `\newcommand{\key}{value}` lines. It compares the values recorded at
 * upload with the values now, counting only the macros the paper's source uses (`paper.tex` and the
 * body files the last build's record lists), so a macro defined and never printed never fires.
 *
 * Reported once per paper, on the first line of `PIPELINE-STATUS.md`, like the other folder rules.
 * Turned on and missing what it needs (its `numbers` option, the numbers file, the record), it says
 * so once, naming what answers it, and judges nothing else.
 */
import { basename, dirname, join, resolve } from "node:path";
import { callerPath } from "./caller-path.ts";
import {
  DEFAULT_RECORD,
  drift,
  parseUploadRecord,
  type UploadRecord,
} from "./domain/artifact-upload.ts";
import { fieldOf } from "./domain/record.ts";
import { err, ok, type Result } from "./domain/result.ts";
import type { FolderRuleContext } from "./folder-venue-rule.ts";
import type { LatexReader } from "./ports/latex.ts";
import {
  paperRecord,
  recordedFiles,
  type RecordReadDeps,
} from "./paper-record.ts";
import { decoded } from "./tex-paper.ts";
import { rulePageUrl, type Finding } from "./venue-rules.ts";

/** The file the rule reports on: one per paper folder. */
const STATUS_FILE = "PIPELINE-STATUS.md";

export interface UploadRuleDeps extends RecordReadDeps {
  readonly latex: LatexReader;
}

/** The rule's options: the numbers file, and the record, each relative to the paper. */
export interface UploadOptions {
  readonly numbers: string | null;
  readonly record: string;
}

/** The options as ESLint hands them: a string `numbers` or none, `record` or the default. */
export const uploadOptions = (raw: unknown): UploadOptions => {
  const numbers = fieldOf(raw, "numbers");
  const record = fieldOf(raw, "record");
  return {
    numbers: typeof numbers === "string" ? numbers : null,
    record: typeof record === "string" ? record : DEFAULT_RECORD,
  };
};

/** What the paper prints now: the numbers file's values, and the macros its source uses. */
export interface Printed {
  readonly values: ReadonlyMap<string, string>;
  readonly used: ReadonlySet<string>;
}

/** Why there are no numbers to compare: the file is not there, or it defines no macro. */
export type NumbersProblem = "noNumbersFile" | "emptyNumbers";

/** The text of the file at `rel` in the paper folder, or null. */
const textAt = (
  dir: string,
  rel: string,
  deps: UploadRuleDeps,
): string | null =>
  decoded(deps.files.readBytes(callerPath(resolve(dir, rel))));

/** The files whose uses count: `paper.tex`, and the body files of a fresh build record. */
function sourcesOf(dir: string, deps: UploadRuleDeps): readonly string[] {
  const r = paperRecord(dir, deps);
  const body = r.kind === "fresh" ? recordedFiles(dir, r.record, "body") : [];
  return [join(dir, "paper.tex"), ...body];
}

/** The paper's numbers now, from the numbers file `numbers` (relative to the paper folder `dir`). */
export function printedNumbers(
  dir: string,
  numbers: string,
  deps: UploadRuleDeps,
): Result<Printed, NumbersProblem> {
  const text = textAt(dir, numbers, deps);
  if (text === null) return err("noNumbersFile");
  const defined = deps.latex.macroValues(text);
  if (defined.length === 0) return err("emptyNumbers");
  const used = sourcesOf(dir, deps).flatMap((f) => {
    const src = textAt(dir, f, deps);
    return src === null ? [] : deps.latex.macrosUsed(src);
  });
  return ok({
    values: new Map(defined.map((d) => [d.name, d.value])),
    used: new Set(used),
  });
}

/** How many keys a message names before it says how many more there are. */
const SHOWN = 3;
const someOf = (keys: readonly string[]): string =>
  [
    ...keys.slice(0, SHOWN),
    ...(keys.length > SHOWN ? [`${String(keys.length - SHOWN)} more`] : []),
  ].join(", ");

/** The finding of a record against the paper's numbers now; none when they agree. */
function staleFindings(r: UploadRecord, p: Printed): readonly Finding[] {
  const d = drift(r.numbers, p.values, p.used);
  const detail = [
    ...(d.added.length > 0
      ? [`${String(d.added.length)} new (${someOf(d.added)})`]
      : []),
    ...(d.changed.length > 0
      ? [`${String(d.changed.length)} changed (${someOf(d.changed)})`]
      : []),
  ];
  if (detail.length === 0) return [];
  const count = d.added.length + d.changed.length;
  return [
    {
      messageId: "stale",
      data: {
        count,
        date: r.uploadedAt.slice(0, 10),
        url: r.url,
        detail: detail.join(", "),
      },
    },
  ];
}

/** The rule's findings for the paper folder `dir`: at most one. Reads through `deps`; never throws. */
export function uploadFindings(
  dir: string,
  o: UploadOptions,
  deps: UploadRuleDeps,
): readonly Finding[] {
  if (o.numbers === null) return [{ messageId: "noOption", data: {} }];
  const printed = printedNumbers(dir, o.numbers, deps);
  if (!printed.ok)
    return [{ messageId: printed.error, data: { path: o.numbers } }];
  const text = textAt(dir, o.record, deps);
  if (text === null)
    return [{ messageId: "noRecord", data: { path: o.record } }];
  const record = parseUploadRecord(text);
  return record.ok
    ? staleFindings(record.value, printed.value)
    : [{ messageId: "badRecord", data: { path: o.record, why: record.error } }];
}

const META = {
  type: "problem",
  docs: {
    description:
      "opt-in: the paper prints numbers the uploaded artifact, as its upload record says, was not built for",
    url: rulePageUrl("artifact/upload-current"),
  },
  schema: [
    {
      type: "object",
      properties: { numbers: { type: "string" }, record: { type: "string" } },
      additionalProperties: false,
    },
  ],
  messages: {
    stale:
      "the paper prints {{count}} numbers the upload of {{date}} ({{url}}) was not built for: {{detail}} — rebuild and upload the artifact, then record it again (`paperlint artifact record <zip> --url <url>`)",
    noOption:
      'artifact/upload-current is on without its numbers file: give it as an option, ["warn", { "numbers": "numbersdef.tex" }], relative to the paper',
    noNumbersFile:
      'the numbers file {{path}} (the rule\'s "numbers" option, relative to the paper) does not exist, so the upload cannot be compared with what the paper prints',
    emptyNumbers:
      "the numbers file {{path}} defines no macro without arguments (\\newcommand{\\key}{value}), so the upload cannot be compared with what the paper prints",
    noRecord:
      "no upload record {{path}}: after uploading the artifact, write one with `paperlint artifact record <zip> --url <url>` (or by hand, docs/artifact-upload.md)",
    badRecord: "the upload record {{path}} cannot be read: {{why}}",
  },
} as const;

/** The rule, as a rule of the `artifact` plugin. On for no paper until its options turn it on. */
export function artifactUploadRules(deps: UploadRuleDeps): {
  readonly "upload-current": {
    readonly meta: typeof META;
    create(c: FolderRuleContext & { readonly options: readonly unknown[] }): {
      root?: () => void;
    };
  };
} {
  return {
    "upload-current": {
      meta: META,
      create(context) {
        if (basename(context.filename) !== STATUS_FILE) return {};
        return {
          root() {
            const at = context.sourceCode.getLocFromIndex(0);
            const o = uploadOptions(context.options[0]);
            uploadFindings(dirname(context.filename), o, deps).forEach((f) => {
              context.report({ loc: { start: at, end: at }, ...f });
            });
          },
        };
      },
    },
  };
}
