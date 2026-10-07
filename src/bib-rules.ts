/**
 * The `bib` rules — about the bibliography TeX reads, as `paperSources` decides it
 * (src/paper-sources.ts), on `paper.tex`:
 *
 *   bib/reachable-entry   an entry with no doi, url or arXiv id
 *
 * WHERE A FINDING ABOUT AN ENTRY GOES. An entry in a block of `paper.tex` is reported on its own
 * line, and a disable directive above it works as everywhere. An entry in a `.bib` file — which
 * ESLint does not lint — is reported at the `\bibliography` that declares it, with the file, line and
 * column at the front of the message (the way `reportInPaper` reports text from an included file);
 * there, the same directive written in the `.bib` on the line above the entry keeps the exception
 * where the entry is (`directiveAbove`).
 *
 * The main file is read from the editor's buffer (`sourcesOf`), so a finding in `paper.tex` points at
 * the text being edited; the `.bib` files and the includes are read from disk.
 */
import { basename, relative } from "node:path";
import { callerPath } from "./caller-path.ts";
import {
  entriesOf,
  MAIN_FILE,
  type BibEntry,
  type BibText,
  type FoundEntry,
  type PaperSources,
} from "./domain/paper-sources.ts";
import type { Span } from "./domain/tex-document.ts";
import { sourcesOf, type SourcesDeps } from "./paper-sources.ts";
import { lineColumn } from "./tex-paper.ts";

/** Where a finding about an entry is reported in paper.tex. */
export type EntryReport =
  | { readonly kind: "here"; readonly span: Span }
  /** The entry is in another file: reported at `span` (its declaration), `where` names the entry. */
  | { readonly kind: "elsewhere"; readonly span: Span; readonly where: string };

/** The first line of an entry: `@misc{key,` — what a finding underlines. */
const headOf = (bib: BibText, e: BibEntry): Span => {
  const first = bib.text
    .slice(e.span.start, e.span.end)
    .split("\n", 1)
    .join("");
  return { start: e.span.start, end: e.span.start + first.length };
};

/** Where a finding about `f` (at the entry's head) is reported in paper.tex. */
export function entryReport(s: PaperSources, f: FoundEntry): EntryReport {
  const at = headOf(f.bib, f.entry);
  if (f.bib.path === s.main.path) return { kind: "here", span: at };
  const declared = f.db.declared;
  return {
    kind: "elsewhere",
    span: declared.file === s.main.path ? declared.span : { start: 0, end: 0 },
    where: `${relative(s.dir, f.bib.path)}:${lineColumn(f.bib.text, at.start)}`,
  };
}

/** `% eslint-disable-next-line <rule>` (a reason after ` -- ` or not) on the line above `at` in `text`. */
export function directiveAbove(
  text: string,
  at: number,
  rule: string,
): boolean {
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

/** The paper whose main file is being linted, its text from the buffer. */
export const lintedSources = (
  filename: string,
  raw: string,
  deps: SourcesDeps,
): PaperSources => sourcesOf(callerPath(filename), raw, deps);

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
 * One finding about an entry, where `entryReport` puts it: on the entry, or at the declaration with
 * the `…In` message that names the entry's file, line and column first.
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

/** The paper being linted, or nothing for any file but its main one. */
const linted = (
  context: BibRuleContext,
  deps: SourcesDeps,
): PaperSources | null =>
  isMain(context.filename)
    ? lintedSources(context.filename, context.sourceCode.raw, deps)
    : null;

/** A rule that judges the entries of the paper's bibliography with `judge`. */
const entryRule = (
  meta: BibRuleModule["meta"],
  judge: (s: PaperSources) => readonly EntryFinding[],
  deps: SourcesDeps,
): BibRuleModule => ({
  meta,
  create: (context) => ({
    "root:exit": () => {
      const s = linted(context, deps);
      if (s !== null)
        judge(s).forEach((f) => {
          reportEntry(context, f);
        });
    },
  }),
});

/** An entry in a `.bib` file whose line above disables `rule` for it (in paper.tex ESLint does that). */
const excepted = (s: PaperSources, f: FoundEntry, rule: string): boolean =>
  f.bib.path !== s.main.path &&
  directiveAbove(f.bib.text, f.entry.span.start, rule);

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

/** Every entry with no doi, url or arXiv id. */
const unreachable = (s: PaperSources): readonly EntryFinding[] =>
  entriesOf(s.bibliography)
    .filter(({ entry }) => !reachable(entry))
    .filter((f) => !excepted(s, f, "bib/reachable-entry"))
    .map((f) => ({
      at: entryReport(s, f),
      messageId: "unreachable",
      key: keyOf(f),
    }));

const UNREACHABLE =
  "`{{key}}` has no doi, url or arXiv id — a reader has nothing to follow. If none exists, keep the exception with `% eslint-disable-next-line bib/reachable-entry -- <why>` above the entry";
/** An entry's key as a message names it: `?` for an entry written with none (`@misc{, …}`). */
const keyOf = (f: FoundEntry): string => f.entry.key || "?";

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

/** The `bib` plugin's rules, reading the paper through `deps`. They act on `paper.tex` only. */
export const bibRules = (
  deps: SourcesDeps,
): Readonly<Record<BibRuleName, BibRuleModule>> => ({
  "reachable-entry": entryRule(REACHABLE_META, unreachable, deps),
});

/** The level each is on at for every `paper.tex` in paperlint's own config. */
export const BIB_RULE_LEVELS = {
  "bib/reachable-entry": "warn",
} as const;
