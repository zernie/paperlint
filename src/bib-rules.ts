/**
 * The `bib` rules — about the bibliography TeX read, as the last build recorded it
 * (`_build/sources.json`, src/recorded-bibliography.ts), on `paper.tex`:
 *
 *   bib/reachable-entry   an entry with no doi, url or arXiv id
 *
 * They judge the entries of the databases bibtex OPENED, and say nothing for a paper with no record or
 * one that changed since: `paper/sources-fresh` speaks once for it.
 *
 * WHERE A FINDING ABOUT AN ENTRY GOES (`entryReports`). An entry of a `.bib` TeX wrote from a block of
 * `paper.tex` is reported on its own line there, and a disable directive above it works as everywhere.
 * Any other entry — a `.bib` the author keeps, which ESLint does not lint, or a block that is in an
 * included file — is reported at the top of `paper.tex`, with the file, line and column at the front of
 * the message (the way `reportInPaper` reports text from an included file); there, the same directive
 * written in the `.bib` on the line above the entry keeps the exception where the entry is
 * (`directiveAbove`).
 *
 * The main file's blocks are read from the editor's buffer, so a finding in `paper.tex` points at the
 * text being edited; the `.bib` files and the includes are read from disk.
 */
import { basename, dirname } from "node:path";
import { callerPath } from "./caller-path.ts";
import { MAIN_FILE, type BibEntry } from "./domain/paper-sources.ts";
import {
  entriesOfDatabases,
  entryReports,
  recordedBibliography,
  type EntryReport,
  type RecordedDeps,
  type RecordedEntry,
} from "./recorded-bibliography.ts";

export type { EntryReport } from "./recorded-bibliography.ts";

/** `% eslint-disable-next-line <rule>` (a reason after ` -- ` or not) on the line above `at` in `text`. */
function directiveAbove(text: string, at: number, rule: string): boolean {
  const lineStart = text.lastIndexOf("\n", at - 1) + 1;
  const above = text.slice(
    text.lastIndexOf("\n", lineStart - 2) + 1,
    Math.max(lineStart - 1, 0),
  );
  const m = /^\s*%\s*eslint-disable-next-line\s+(.*?)(?:\s+--\s.*)?$/.exec(
    above,
  );
  return (m?.[1] ?? "")
    .split(",")
    .map((r) => r.trim())
    .includes(rule);
}

/** Whether a rule should judge this file: the paper's main file only. */
export const isMain = (filename: string): boolean =>
  basename(filename) === MAIN_FILE;

// ── the rules ───────────────────────────────────────────────────────────────────────────

interface Loc {
  readonly line: number;
  readonly column: number;
}

/** The slice of ESLint's rule API the `bib` rules use. */
export interface BibRuleContext {
  readonly filename: string;
  /** The `tex/latex` language's source code: `raw` is the file as written. */
  readonly sourceCode: {
    readonly raw: string;
    getLocFromIndex(index: number): Loc;
  };
  report(d: {
    readonly loc: { readonly start: Loc; readonly end: Loc };
    readonly messageId: string;
    readonly data?: Readonly<Record<string, string>>;
  }): void;
}

export interface BibRuleModule {
  readonly meta: {
    readonly type: "problem" | "suggestion";
    readonly docs: { readonly description: string; readonly url: string };
    readonly schema: readonly object[];
    readonly messages: Readonly<Record<string, string>>;
  };
  create(context: BibRuleContext): { "root:exit"?: () => void };
}

type BibRuleName = "reachable-entry";

const docsUrl = (name: BibRuleName): string =>
  `https://github.com/zernie/paperlint/blob/main/docs/rules/bib/${name}.md`;

/** One finding a `bib` rule makes about an entry. */
interface EntryFinding {
  readonly at: EntryReport;
  readonly messageId: string;
  readonly key: string;
}

/**
 * One finding about an entry, where `entryReports` puts it: on the entry, or at the top of paper.tex
 * with the `…In` message that names the entry's file, line and column first.
 */
function reportEntry(context: BibRuleContext, f: EntryFinding): void {
  const loc = (i: number) => context.sourceCode.getLocFromIndex(i);
  context.report({
    loc: { start: loc(f.at.span.start), end: loc(f.at.span.end) },
    ...(f.at.kind === "here"
      ? { messageId: f.messageId, data: { key: f.key } }
      : {
          messageId: `${f.messageId}In`,
          data: { key: f.key, where: f.at.where },
        }),
  });
}

/** What a rule judges: the rule's name, the entries it flags, and the message each flagged entry gets. */
interface Judge {
  readonly rule: string;
  readonly flags: (e: BibEntry) => boolean;
  readonly messageId: string;
}

/** A rule that judges the entries of the databases bibtex opened. */
const entryRule = (
  meta: BibRuleModule["meta"],
  judge: Judge,
  deps: RecordedDeps,
): BibRuleModule => ({
  meta,
  create: (context) => ({
    "root:exit": () => {
      findings(context, judge, deps).forEach((f) => {
        reportEntry(context, f);
      });
    },
  }),
});

/** An entry reported outside paper.tex whose line above disables `rule` for it (in paper.tex ESLint does that). */
const excepted = (f: RecordedEntry, at: EntryReport, rule: string): boolean =>
  at.kind === "elsewhere" &&
  directiveAbove(f.database.bib.text, f.entry.span.start, rule);

/** The findings for the paper being linted: none for any file but its main one, none without a current record. */
function findings(
  context: BibRuleContext,
  judge: Judge,
  deps: RecordedDeps,
): readonly EntryFinding[] {
  if (!isMain(context.filename)) return [];
  const main = callerPath(context.filename);
  const dir = dirname(main);
  const r = recordedBibliography(dir, deps);
  if (r.kind === "unrecorded") return [];
  const flagged = entriesOfDatabases(r.databases).filter((f) =>
    judge.flags(f.entry),
  );
  const at = entryReports(
    {
      dir,
      record: r.record,
      main: { path: main, text: context.sourceCode.raw },
    },
    flagged,
    deps,
  );
  return flagged.flatMap((f, i): readonly EntryFinding[] => {
    const place = at[i];
    return place === undefined || excepted(f, place, judge.rule)
      ? []
      : [{ at: place, messageId: judge.messageId, key: f.entry.key || "?" }];
  });
}

/** An arXiv identifier in a field's text: `arXiv:2401.00001`, `arXiv preprint arXiv:2401.00001`. */
const ARXIV_ID = /arxiv[:\s]*\d{4}\.\d{4,5}/i;
/** A link the reader parsed out of `\url{…}` or `\href{…}`, in any field (`howpublished`, `note`). */
const PARSED_LINK = '<a href="';

const has = (e: BibEntry, field: string): boolean =>
  (e.fields[field] ?? "").trim() !== "";

/** A doi, a url, an arXiv eprint, or a link or arXiv id in any field: something a reader can follow. */
const reachable = (e: BibEntry): boolean =>
  has(e, "doi") ||
  has(e, "url") ||
  (has(e, "eprint") &&
    /arxiv/i.test(e.fields["archiveprefix"] ?? e.fields["eprinttype"] ?? "")) ||
  Object.values(e.fields).some(
    (v) => ARXIV_ID.test(v) || v.includes(PARSED_LINK),
  );

const UNREACHABLE =
  "`{{key}}` has no doi, url or arXiv id — a reader has nothing to follow. If none exists, keep the exception with `% eslint-disable-next-line bib/reachable-entry -- <why>` above the entry";
/** `bib/reachable-entry`: every entry TeX reads carries something a reader can follow. */
const REACHABLE_META: BibRuleModule["meta"] = {
  type: "suggestion",
  docs: {
    description:
      "a bibliography entry carries a doi, a url or an arXiv id — something a reader can follow",
    url: docsUrl("reachable-entry"),
  },
  schema: [],
  messages: {
    unreachable: UNREACHABLE,
    unreachableIn: `{{where}}: ${UNREACHABLE}`,
  },
};

/** The `bib` plugin's rules, reading the paper's record through `deps`. They act on `paper.tex` only. */
export const bibRules = (
  deps: RecordedDeps,
): Readonly<Record<BibRuleName, BibRuleModule>> => ({
  "reachable-entry": entryRule(
    REACHABLE_META,
    {
      rule: "bib/reachable-entry",
      flags: (e) => !reachable(e),
      messageId: "unreachable",
    },
    deps,
  ),
});

/** The level each is on at for every `paper.tex` in paperlint's own config. */
export const BIB_RULE_LEVELS = {
  "bib/reachable-entry": "warn",
} as const;
