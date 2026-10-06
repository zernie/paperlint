/**
 * The `bib` rules — about the bibliography TeX reads, as `paperSources` decides it
 * (src/paper-sources.ts), on `paper.tex`:
 *
 *   bib/filecontents-overwrite  a `filecontents` block writing a `.bib` has no `[overwrite]`   fix
 *   bib/reachable-entry         an entry with no doi, url or arXiv id                          —
 *   bib/commented-entry         an entry behind `%`, which bibtex reads anyway                  —
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
  databasesOf,
  MAIN_FILE,
  texReads,
  type BibEntry,
  type BibText,
  type Database,
  type PaperSources,
} from "./domain/paper-sources.ts";
import type { Span } from "./domain/tex-document.ts";
import { sourcesOf, type SourcesDeps } from "./paper-sources.ts";
import { lineColumn } from "./tex-paper.ts";

/** An entry TeX reads, the text that holds it, and the database it belongs to. */
export interface FoundEntry {
  readonly db: Database;
  readonly bib: BibText;
  readonly entry: BibEntry;
}

/** Where a finding about an entry is reported in paper.tex. */
export type EntryReport =
  | { readonly kind: "here"; readonly span: Span }
  /** The entry is in another file: reported at `span` (its declaration), `where` names the entry. */
  | { readonly kind: "elsewhere"; readonly span: Span; readonly where: string };

/** Every entry TeX reads (for `undecided`, may read), with its database. */
export const entriesOf = (s: PaperSources): readonly FoundEntry[] =>
  databasesOf(s.bibliography).flatMap((db) => {
    const bib = texReads(db);
    return bib === null ? [] : bib.entries.map((entry) => ({ db, bib, entry }));
  });

/** The first entry TeX reads under `key`, or null. */
export const findEntry = (s: PaperSources, key: string): FoundEntry | null =>
  entriesOf(s).find((f) => f.entry.key === key) ?? null;

/** The first line of an entry: `@misc{key,` — what a finding underlines. */
const headOf = (bib: BibText, e: BibEntry): Span => {
  const first = bib.text
    .slice(e.span.start, e.span.end)
    .split("\n", 1)
    .join("");
  return { start: e.span.start, end: e.span.start + first.length };
};

/** Where a finding about `f` (at `at`, the entry's head by default) is reported in paper.tex. */
export function entryReport(
  s: PaperSources,
  f: FoundEntry,
  at: Span = headOf(f.bib, f.entry),
): EntryReport {
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
    readonly fix?: (fixer: {
      replaceTextRange(range: readonly [number, number], text: string): unknown;
    }) => unknown;
  }): void;
}

export interface BibRuleModule {
  readonly meta: {
    readonly type: "problem" | "suggestion";
    readonly fixable?: "code";
    readonly docs: { readonly description: string; readonly url: string };
    readonly schema: readonly object[];
    readonly messages: Readonly<Record<string, string>>;
  };
  create(context: BibRuleContext): { "root:exit"?: () => void };
}

type BibRuleName =
  "filecontents-overwrite" | "reachable-entry" | "commented-entry";

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

const HAS_LINK = /\b(doi|url)\s*=/i;
const HAS_ARXIV = /arxiv[:\s]*\d{4}\.\d{4,5}/i;
/** `\url{…}` or `\href{…}` in any field: a link the bibliography style typesets (`howpublished`). */
const HAS_URL_MACRO = /\\(url|href)\s*\{/;

/** Every entry with no doi, url or arXiv id. */
const unreachable = (s: PaperSources): readonly EntryFinding[] =>
  entriesOf(s)
    .filter(({ bib, entry }) => {
      const text = bib.text.slice(entry.span.start, entry.span.end);
      return ![HAS_LINK, HAS_ARXIV, HAS_URL_MACRO].some((re) => re.test(text));
    })
    .filter((f) => !excepted(s, f, "bib/reachable-entry"))
    .map((f) => ({
      at: entryReport(s, f),
      messageId: "unreachable",
      key: keyOf(f),
    }));

const UNREACHABLE =
  "`{{key}}` has no doi, url or arXiv id — a reader has nothing to follow. If none exists, keep the exception with `% eslint-disable-next-line bib/reachable-entry -- <why>` above the entry";
const COMMENTED =
  "`{{key}}` is behind `%`, and bibtex has no comment character: it reads this entry anyway, and a `%` inside an entry corrupts its fields. Delete the entry, or remove its `@` so bibtex skips it as text";

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

/** Every entry behind `%`, reported from the `%`. */
const commented = (s: PaperSources): readonly EntryFinding[] =>
  entriesOf(s).flatMap((f) => {
    const { percent } = f.entry;
    if (percent === null || excepted(s, f, "bib/commented-entry")) return [];
    const span = { start: percent.start, end: headOf(f.bib, f.entry).end };
    return [
      {
        at: entryReport(s, f, span),
        messageId: "commented",
        key: keyOf(f),
      },
    ];
  });

/** `bib/commented-entry`: an entry behind `%` is one bibtex reads. */
const COMMENTED_META: BibRuleModule["meta"] = {
  type: "problem",
  docs: {
    description:
      "no bibliography entry is written behind `%` — bibtex has no comment character and reads it anyway",
    url: docsUrl("commented-entry"),
  },
  schema: [],
  messages: { commented: COMMENTED, commentedIn: `{{where}}: ${COMMENTED}` },
};

/** `bib/filecontents-overwrite`: a block writing a `.bib` overwrites it, so it is what TeX reads. */
const OVERWRITE_META: BibRuleModule["meta"] = {
  type: "problem",
  fixable: "code",
  docs: {
    description:
      "a filecontents block that writes a .bib has [overwrite], so the block is what TeX reads on every machine",
    url: docsUrl("filecontents-overwrite"),
  },
  schema: [],
  messages: {
    noOverwrite:
      "`{{begin}}` has no `[overwrite]`: TeX writes {{file}} only when no file of that name exists, so once one does — from an earlier build, or committed — edits to this block stop reaching the PDF. `--fix` adds `[overwrite]`",
    shadowed:
      "TeX reads the committed {{file}}, not this block: the two hold different entries, and without `[overwrite]` TeX never writes the block over the file. `--fix` adds `[overwrite]`, which makes the block what TeX reads",
  },
};

/** Where `[overwrite]` goes in a block's `\\begin{…}`: into its option list, or as one. */
function overwriteFix(
  raw: string,
  begin: number,
): { readonly at: number; readonly text: string } {
  const at = raw.indexOf("}", begin) + 1;
  const options = /^\s*\[/.exec(raw.slice(at));
  return options === null
    ? { at, text: "[overwrite]" }
    : { at: at + options[0].length, text: "overwrite," };
}

/** Whether the paper's committed `.bib` of that name holds other entries than the block at `start`. */
const shadowedAt = (s: PaperSources, start: number): boolean =>
  databasesOf(s.bibliography).some(
    (d) =>
      d.kind === "conflict" &&
      d.block.bib.path === s.main.path &&
      d.block.span.start === start,
  );

/** One block without `[overwrite]`: its `\\begin` line, which message, and the fix. */
interface OpenBlock {
  readonly head: Span;
  readonly messageId: "noOverwrite" | "shadowed";
  readonly data: Readonly<Record<string, string>>;
  readonly fix: { readonly at: number; readonly text: string };
}

/** The blocks of the linted `raw` that write a `.bib` without `[overwrite]`. */
function openBlocks(
  filename: string,
  raw: string,
  deps: SourcesDeps,
): readonly OpenBlock[] {
  const open = deps.latex
    .filecontents(raw)
    .filter((b) => b.writes.endsWith(".bib") && !b.overwrite);
  // The paper's sources are read only when there is a block to judge: they ask git.
  if (open.length === 0) return [];
  const s = lintedSources(filename, raw, deps);
  return open.map((b) => {
    const first = raw.slice(b.span.start, b.span.end).split("\n", 1).join("");
    const head = { start: b.span.start, end: b.span.start + first.length };
    return {
      head,
      messageId: shadowedAt(s, b.span.start) ? "shadowed" : "noOverwrite",
      data: { begin: raw.slice(head.start, head.end).trim(), file: b.writes },
      fix: overwriteFix(raw, b.span.start),
    };
  });
}

const filecontentsOverwrite = (deps: SourcesDeps): BibRuleModule => ({
  meta: OVERWRITE_META,
  create: (context) => ({
    "root:exit": () => {
      if (!isMain(context.filename)) return;
      const raw = context.sourceCode.raw;
      const loc = (i: number) => context.sourceCode.getLocFromIndex(i);
      openBlocks(context.filename, raw, deps).forEach((b) => {
        context.report({
          loc: { start: loc(b.head.start), end: loc(b.head.end) },
          messageId: b.messageId,
          data: b.data,
          fix: (fixer) =>
            fixer.replaceTextRange([b.fix.at, b.fix.at], b.fix.text),
        });
      });
    },
  }),
});

/** The `bib` plugin's rules, reading the paper through `deps`. They act on `paper.tex` only. */
export const bibRules = (
  deps: SourcesDeps,
): Readonly<Record<BibRuleName, BibRuleModule>> => ({
  "filecontents-overwrite": filecontentsOverwrite(deps),
  "reachable-entry": entryRule(REACHABLE_META, unreachable, deps),
  "commented-entry": entryRule(COMMENTED_META, commented, deps),
});

/** The level each is on at for every `paper.tex` in paperlint's own config. */
export const BIB_RULE_LEVELS = {
  "bib/filecontents-overwrite": "error",
  "bib/reachable-entry": "warn",
  "bib/commented-entry": "warn",
} as const;
