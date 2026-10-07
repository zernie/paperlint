/**
 * The reference rules — `paper/author-list`, `paper/cite-exists`, `paper/refs-checked`,
 * `paper/refs-fresh` — judge `_build/references.json` (`references.ts`), offline. `paperlint build`
 * does the online work; lint never touches the network.
 *
 *   entry whose authors are the preprint's   paper/author-list (error), on the entry
 *   entry whose identifier provably fails    paper/cite-exists (error), on the entry
 *   no record, or recorded "not checked"     paper/refs-checked (warn) — like pdf/measured
 *   the build's bibtex read what paperlint    paper/refs-checked (warn): those references were not
 *   did not (`unseenBy`)                      checked
 *   bibliography edited after the build      paper/refs-fresh (error) — like pdf/fresh
 *
 * While the record is stale, the per-entry rules are silent: they would judge a bibliography
 * that no longer exists, and refs-fresh already says so once. A paper with no bibliography gets
 * nothing.
 *
 * `paper/author-list` and `paper/cite-exists` judge the entries of the databases the last build's
 * bibtex opened (`_build/sources.json`, src/recorded-bibliography.ts), and say nothing for a paper with
 * no current record (`paper/sources-fresh` speaks). An entry of a `.bib` TeX wrote from a block of
 * `paper.tex` is reported on its line there; any other entry — a `.bib` file, which ESLint does not
 * lint — at the top of `paper.tex`, the file, line and column at the front of the message.
 *
 * `paper/author-list` used to live on PIPELINE-STATUS.md and ask whether the scorecard mentioned
 * a run. It lives here now because its subject is the bibliography, and the record of the run is
 * the run's own output.
 */
import { basename, dirname } from "node:path";
import { callerPath } from "./caller-path.ts";
import { MAIN_FILE, type FoundEntry } from "./domain/paper-sources.ts";
import type { EntryVerdict } from "./ports/check-references.ts";
import { paperSources, type SourcesDeps } from "./paper-sources.ts";
import {
  entriesOfDatabases,
  entryReports,
  recordedBibliography,
  type EntryReport,
  type RecordedBibliography,
  type RecordedDeps,
  type RecordedEntry,
} from "./recorded-bibliography.ts";
import {
  bibHash,
  checkedBibliography,
  NOTHING_READ,
  readReferences,
  REFERENCES_FILE,
  unseenBy,
  type Unseen,
} from "./references.ts";

interface Loc {
  readonly line: number;
  readonly column: number;
}
interface RuleContext {
  readonly filename: string;
  readonly cwd: string;
  readonly sourceCode: {
    /** The file as written (the `tex/latex` language's source code). */
    readonly raw: string;
    getLocFromIndex(i: number): Loc;
  };
  report(d: {
    loc: { start: Loc; end: Loc };
    messageId: string;
    data?: Record<string, string>;
  }): void;
}
export interface ReferenceRuleModule {
  readonly meta: {
    readonly type: "problem" | "suggestion";
    readonly docs: { readonly description: string };
    readonly schema: readonly object[];
    readonly messages: Readonly<Record<string, string>>;
  };
  create(context: RuleContext): { "root:exit"?: () => void };
}

type Name = "author-list" | "cite-exists" | "refs-checked" | "refs-fresh";

/** What one lint run knows about a paper's references. */
type Assessment =
  | { readonly kind: "no-bibliography" }
  | { readonly kind: "unrecorded" }
  | { readonly kind: "not-checked"; readonly why: string }
  | { readonly kind: "stale" }
  | { readonly kind: "ready"; readonly unseen: Unseen };

/**
 * Each entry checked with its verdict — when the record holds one verdict per entry, in its order, as
 * the build writes it. One that does not (written by hand) is not about this bibliography: null.
 */
function laid(
  verdicts: readonly EntryVerdict[],
  entries: readonly FoundEntry[],
): readonly (readonly [FoundEntry, EntryVerdict])[] | null {
  const pairs = entries.flatMap((f, i) => {
    const v = verdicts[i];
    return v?.key === f.entry.key ? [[f, v] as const] : [];
  });
  return pairs.length === entries.length && verdicts.length === entries.length
    ? pairs
    : null;
}

function assess(deps: SourcesDeps, paperDir: string): Assessment {
  const read = paperSources(paperDir, deps);
  if (!read.ok) return { kind: "no-bibliography" };
  const doc = readReferences(deps.files, paperDir);
  // The bibliography as the recorded build's bibtex observed it; before any build, every candidate.
  const bib = checkedBibliography(read.value, doc?.bibtex ?? NOTHING_READ);
  if (bib === null) return { kind: "no-bibliography" };
  if (doc === null) return { kind: "unrecorded" };
  if (doc.bib.sha256 !== bibHash(bib)) return { kind: "stale" };
  if (doc.status === "not-checked")
    return { kind: "not-checked", why: doc.why ?? "no reason recorded" };
  if (laid(doc.entries, bib.entries) === null) return { kind: "stale" };
  return { kind: "ready", unseen: unseenBy(read.value, doc.bibtex) };
}

const BUILD = "`npx paperlint build`";

const MISMATCH =
  "`{{key}}`: the authors are not those of the version cited — {{why}}. The citation resolves and the id resolves, and the list is the PREPRINT's under a published venue";
const MISSING = "`{{key}}` does not resolve to the work cited — {{why}}";

const META: Readonly<Record<Name, ReferenceRuleModule["meta"]>> = {
  "author-list": {
    type: "problem",
    docs: {
      description:
        "each entry's authors are those of the version it cites, not the preprint's (recorded by paperlint build)",
    },
    schema: [],
    messages: {
      mismatch: MISMATCH,
      mismatchIn: `{{where}}: ${MISMATCH}`,
    },
  },
  "cite-exists": {
    type: "problem",
    docs: {
      description:
        "each entry's identifier resolves to the work cited (recorded by paperlint build)",
    },
    schema: [],
    messages: {
      missing: MISSING,
      missingIn: `{{where}}: ${MISSING}`,
    },
  },
  "refs-checked": {
    type: "suggestion",
    docs: {
      description:
        "the build checked the references online (existence, title, authors); a warning when it could not",
    },
    schema: [],
    messages: {
      unrecorded: `the references have not been checked — ${BUILD} checks them online and records the result in _build/${REFERENCES_FILE}`,
      notChecked: `the last build could not check the references ({{why}}) — run ${BUILD} with network`,
      unseen:
        "the last build's bibtex read {{what}}, which paperlint did not read, so those references were not checked: a database the paper's bibliography does not name, or an entry behind `%` or inside `@comment{…}` — bibtex has no comment syntax and reads it, paperlint's reader skips it. Delete the entry, or remove its `@`",
    },
  },
  "refs-fresh": {
    type: "problem",
    docs: {
      description:
        "the recorded reference verdicts are about the bibliography on disk, not an earlier one",
    },
    schema: [],
    messages: {
      stale: `the references changed since the last build checked them — run ${BUILD}`,
    },
  },
};

type Report = {
  at: EntryReport;
  messageId: string;
  data?: Record<string, string>;
};

const AT_START: EntryReport = { kind: "here", span: { start: 0, end: 0 } };

/** One finding naming what the build's bibtex read and paperlint did not, or none. */
const unseenReports = (u: Unseen): readonly Report[] => {
  const what = [...u.databases, ...u.keys.map((k) => `\`${k}\``)];
  return what.length === 0
    ? []
    : [{ at: AT_START, messageId: "unseen", data: { what: what.join(", ") } }];
};

const JUDGES: Readonly<
  Record<"refs-checked" | "refs-fresh", (a: Assessment) => readonly Report[]>
> = {
  "refs-checked": (a) => {
    switch (a.kind) {
      case "unrecorded":
        return [{ at: AT_START, messageId: "unrecorded" }];
      case "not-checked":
        return [
          { at: AT_START, messageId: "notChecked", data: { why: a.why } },
        ];
      case "ready":
        return unseenReports(a.unseen);
      case "no-bibliography":
      case "stale":
        return [];
    }
  },
  "refs-fresh": (a) =>
    a.kind === "stale" ? [{ at: AT_START, messageId: "stale" }] : [],
};

/**
 * One finding, at its entry in paper.tex — or, for an entry in a `.bib`, at the declaration, with the
 * `…In` message that names the entry's file, line and column first.
 */
function report(context: RuleContext, r: Report): void {
  const loc = (i: number) => context.sourceCode.getLocFromIndex(i);
  const where = { start: loc(r.at.span.start), end: loc(r.at.span.end) };
  context.report({
    loc: where,
    ...(r.at.kind === "here"
      ? { messageId: r.messageId, ...(r.data ? { data: r.data } : {}) }
      : {
          messageId: `${r.messageId}In`,
          data: { ...r.data, where: r.at.where },
        }),
  });
}

/** The verdicts a rule reports, and the message and data each makes. */
const VERDICT_RULES = {
  "author-list": {
    failed: (v: EntryVerdict) => v.authors === "mismatch",
    messageId: "mismatch",
  },
  "cite-exists": {
    failed: (v: EntryVerdict) => v.exists === "false",
    messageId: "missing",
  },
} as const;

/** What `references.json` judged, laid on the entries of the databases the last build's bibtex opened. */
interface Judged {
  readonly r: Extract<RecordedBibliography, { readonly kind: "recorded" }>;
  readonly entries: readonly RecordedEntry[];
  readonly verdicts: readonly EntryVerdict[];
}

/**
 * The verdicts of a checked `references.json` laid on the entries of the databases the last build's
 * bibtex opened — or none: without a current record of the paper, without a checked `references.json`,
 * or when that is not one verdict per entry of these databases, in order, about the bytes they hold
 * now. Its verdicts would be about another bibliography, and `paper/refs-fresh` says so.
 */
function judgedIn(dir: string, deps: RecordedDeps): Judged | null {
  const r = recordedBibliography(dir, deps);
  if (r.kind === "unrecorded") return null;
  const doc = readReferences(deps.files, dir);
  const [first, ...rest] = r.databases.map((d) => d.bib);
  if (doc === null || doc.status !== "checked" || first === undefined)
    return null;
  const entries = entriesOfDatabases(r.databases);
  const aligned =
    doc.bib.sha256 === bibHash({ texts: [first, ...rest], entries: [] }) &&
    doc.entries.length === entries.length &&
    entries.every((f, i) => doc.entries[i]?.key === f.entry.key);
  return aligned ? { r, entries, verdicts: doc.entries } : null;
}

/**
 * The entries `references.json` judged failing for `rule`, each where it is reported (`entryReports`).
 */
function verdictReports(
  rule: keyof typeof VERDICT_RULES,
  context: RuleContext,
  deps: RecordedDeps,
): readonly Report[] {
  const main = callerPath(context.filename);
  const dir = dirname(main);
  const judged = judgedIn(dir, deps);
  if (judged === null) return [];
  const { failed, messageId } = VERDICT_RULES[rule];
  const flagged = judged.entries.flatMap((f, i) => {
    const v = judged.verdicts[i];
    return v !== undefined && failed(v) ? [{ f, v }] : [];
  });
  const at = entryReports(
    {
      dir,
      record: judged.r.record,
      main: { path: main, text: context.sourceCode.raw },
    },
    flagged.map(({ f }) => f),
    deps,
  );
  return flagged.flatMap(({ v }, i): readonly Report[] => {
    const place = at[i];
    return place === undefined
      ? []
      : [{ at: place, messageId, data: { key: v.key, why: v.why ?? "" } }];
  });
}

/** The four rules, reading the paper through `deps`. They act on `paper.tex` only. */
export function referenceRules(
  deps: SourcesDeps & RecordedDeps,
): Record<Name, ReferenceRuleModule> {
  const make = (
    name: Name,
    judge: (context: RuleContext) => readonly Report[],
  ): ReferenceRuleModule => ({
    meta: META[name],
    create: (context) =>
      basename(context.filename) !== MAIN_FILE
        ? {}
        : {
            "root:exit": () => {
              for (const r of judge(context)) report(context, r);
            },
          },
  });
  const assessed =
    (name: "refs-checked" | "refs-fresh") =>
    (context: RuleContext): readonly Report[] =>
      JUDGES[name](assess(deps, dirname(callerPath(context.filename))));
  return {
    "author-list": make("author-list", (c) =>
      verdictReports("author-list", c, deps),
    ),
    "cite-exists": make("cite-exists", (c) =>
      verdictReports("cite-exists", c, deps),
    ),
    "refs-checked": make("refs-checked", assessed("refs-checked")),
    "refs-fresh": make("refs-fresh", assessed("refs-fresh")),
  };
}

/** The level each is on at for every `paper.tex` in paperlint's own config. */
export const REFERENCE_RULE_LEVELS = {
  "paper/author-list": "error",
  "paper/cite-exists": "error",
  "paper/refs-checked": "warn",
  "paper/refs-fresh": "error",
} as const;
