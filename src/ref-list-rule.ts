/**
 * `tex/ref-list-same-number` — a list of cross-references whose different labels print one number:
 * `Sections~\ref{sec:check}, \ref{sec:rq2} and~\ref{sec:rq3}` typeset as "Sections V-A, V-A and V-B"
 * when `sec:rq2` is a label inside the subsection `sec:check` names. TeX defines every label once and
 * says nothing; the judge is `sameNumberClashes` (src/domain/cross-references.ts).
 *
 * WHAT IT READS: the body's prose through the `LatexReader` port, its includes spliced (`readPaper`),
 * and the labels of the last build's `paper.aux` through the `TexOutput` port. Only a FRESH build is
 * read: with no record of the build, or one the paper has changed since, the numbers in the `.aux`
 * belong to other text, and the rule says nothing — `paper/sources-fresh` already says the paper is
 * not built, or built from other text. No `.aux` beside a fresh record is silent too.
 */
import { dirname, join } from "node:path";
import { callerPath } from "./caller-path.ts";
import { sameNumberClashes, type Clash } from "./domain/cross-references.ts";
import { JOBNAME } from "./domain/sources-record.ts";
import { paperRecord } from "./paper-record.ts";
import type { TexOutput } from "./ports/tex-output.ts";
import {
  decoded,
  readPaper,
  reportInPaper,
  type ProseDeps,
} from "./tex-paper.ts";
import {
  ruleDocsUrl,
  type Located,
  type TexRuleModule,
} from "./tex-venue-rules.ts";

/** What the rule reads with: the paper, its build's record, and the reader of the `.aux`. */
export interface RefListDeps extends ProseDeps {
  readonly texOutput: Pick<TexOutput, "labels">;
}

const MESSAGES = {
  same: "«{{second}}» prints {{number}}, as «{{first}}» earlier in the same list does: the reader sees one place where two are meant. Point the label at the place it names (a \\label before a figure's \\caption takes the section's number), or name the place once",
};

/** A clash as a finding, at the later reference. */
const located = (c: Clash): Located => ({
  messageId: "same",
  data: {
    first: c.first.key,
    second: c.second.key,
    number: c.number,
  },
  at: c.second.span,
});

export const refListSameNumberRule = (deps: RefListDeps): TexRuleModule => ({
  meta: {
    type: "problem",
    docs: {
      description:
        "two different labels in one list of references print the same number (`Sections V-A, V-A and V-B`), read from the last build's .aux",
      url: ruleDocsUrl("ref-list-same-number"),
    },
    schema: [],
    messages: MESSAGES,
  },
  create(context) {
    return {
      root() {
        const dir = dirname(context.filename);
        if (paperRecord(dir, deps).kind !== "fresh") return;
        const read = (name: string): string | null =>
          decoded(deps.files.readBytes(callerPath(join(dir, name))));
        const aux = read(`${JOBNAME}.aux`);
        if (aux === null) return;
        const labels = deps.texOutput.labels(aux, read);
        const sc = context.sourceCode;
        const paper = readPaper(context.filename, sc.raw ?? sc.text, deps);
        const clashes = sameNumberClashes(
          deps.latex.bodyProse(paper.text),
          labels,
        );
        reportInPaper(context, MESSAGES, paper, clashes.map(located));
      },
    };
  },
});
