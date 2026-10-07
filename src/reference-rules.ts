/**
 * The reference rules — `paper/author-list`, `paper/cite-exists`, `paper/refs-checked`,
 * `paper/refs-fresh` — judge `_build/references.json` (`references.ts`), offline. `paperlint build`
 * does the online work; lint never touches the network.
 *
 *   entry whose authors are the preprint's   paper/author-list (error), on the entry
 *   entry whose identifier provably fails    paper/cite-exists (error), on the entry
 *   no verdicts, or recorded "not checked"   paper/refs-checked (warn) — like pdf/measured
 *   a key bibtex typeset that no entry the  paper/refs-checked (warn): that reference was not
 *   reader read has (`unseenKeys`)           checked
 *   a database bibtex opened is not on disk  paper/refs-checked (warn): its references were not checked
 *   databases edited after the build         paper/refs-fresh (error) — like pdf/fresh
 *
 * The databases are the ones the last build's bibtex opened (`_build/sources.json`,
 * docs/design/paper-sources.md §1) — `readBibliography` answers only from a record the paper has not
 * changed since. With no record, or a stale one, every rule here is silent: `paper/sources-fresh`
 * speaks once. While the verdicts are stale, the per-entry rules are silent too: they would judge
 * databases that no longer exist, and refs-fresh already says so once. A paper whose build ran no
 * bibtex gets nothing.
 *
 * `paper/author-list` and `paper/cite-exists` lay the verdicts on the entries of those databases. ESLint
 * does not lint a `.bib`, so a finding is a place in `paper.tex`: an entry of a `.bib` TeX wrote from a
 * block of `paper.tex` is reported on its line there (`entryReports`); any other entry at the top of
 * `paper.tex`, with the entry's file, line and column at the front of the message (`refs.bib:12:1:`).
 *
 * `paper/author-list` used to live on PIPELINE-STATUS.md and ask whether the scorecard mentioned
 * a run. It lives here now because its subject is the bibliography, and the record of the run is
 * the run's own output.
 */
import { basename, dirname } from "node:path";
import { callerPath } from "./caller-path.ts";
import { MAIN_FILE } from "./domain/paper-sources.ts";
import type { EntryVerdict } from "./ports/check-references.ts";
import {
  entryReports,
  type EntryReport,
  type RecordedDeps,
  type RecordedEntry,
} from "./recorded-bibliography.ts";
import {
  bibHash,
  readBibliography,
  readReferences,
  REFERENCES_FILE,
  unseenKeys,
  type CheckedBibliography,
  type ReferencesDocument,
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

/** The checked entries of the databases, each with the verdict the build recorded for it. */
interface Judged {
  readonly bib: CheckedBibliography;
  readonly verdicts: readonly (readonly [RecordedEntry, EntryVerdict])[];
}

/** What one lint run knows about a paper's references. */
type Assessment =
  /** No usable record of the build, or a build that ran no bibtex: nothing to judge. */
  | { readonly kind: "silent" }
  | { readonly kind: "unread"; readonly databases: readonly string[] }
  | { readonly kind: "unrecorded" }
  | { readonly kind: "not-checked"; readonly why: string }
  | { readonly kind: "stale" }
  | { readonly kind: "ready"; readonly judged: Judged };

/**
 * Each entry checked with its verdict — when the record holds one verdict per entry, in its order, as
 * the build writes it. One that does not (written by hand) is not about these databases: null.
 */
function laid(
  verdicts: readonly EntryVerdict[],
  entries: readonly RecordedEntry[],
): Judged["verdicts"] | null {
  const pairs = entries.flatMap((f, i) => {
    const v = verdicts[i];
    return v?.key === f.entry.key ? [[f, v] as const] : [];
  });
  return pairs.length === entries.length && verdicts.length === entries.length
    ? pairs
    : null;
}

/** What the verdicts on disk say about the databases of `bib`. */
function judgedVerdicts(
  bib: CheckedBibliography,
  doc: ReferencesDocument | null,
): Assessment {
  if (doc === null) return { kind: "unrecorded" };
  if (doc.bib.sha256 !== bibHash(bib)) return { kind: "stale" };
  if (doc.status === "not-checked")
    return { kind: "not-checked", why: doc.why ?? "no reason recorded" };
  const verdicts = laid(doc.entries, bib.entries);
  return verdicts === null
    ? { kind: "stale" }
    : { kind: "ready", judged: { bib, verdicts } };
}

function assess(deps: RecordedDeps, paperDir: string): Assessment {
  const read = readBibliography(paperDir, deps);
  switch (read.kind) {
    case "no-record":
    case "nothing":
    case "not-wired":
      return { kind: "silent" };
    case "unread":
      return { kind: "unread", databases: read.databases };
    case "read":
      return judgedVerdicts(
        read.bibliography,
        readReferences(deps.files, paperDir),
      );
  }
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
    messages: { mismatch: MISMATCH, mismatchIn: `{{where}}: ${MISMATCH}` },
  },
  "cite-exists": {
    type: "problem",
    docs: {
      description:
        "each entry's identifier resolves to the work cited (recorded by paperlint build)",
    },
    schema: [],
    messages: { missing: MISSING, missingIn: `{{where}}: ${MISSING}` },
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
        "the last build's bibtex typeset {{what}}, which paperlint's reader did not read from the databases bibtex opened, so those references were not checked: an entry behind `%` or inside `@comment{…}` — bibtex has no comment syntax and reads it, the reader skips it. Delete the entry, or remove its `@`",
      unread: `{{what}}, which the last build's bibtex opened, is not on disk (a file TeX wrote, and something removed it) — run ${BUILD}, which writes it again and checks its references`,
    },
  },
  "refs-fresh": {
    type: "problem",
    docs: {
      description:
        "the recorded reference verdicts are about the databases on disk, not an earlier set",
    },
    schema: [],
    messages: {
      stale: `the references changed since the last build checked them — run ${BUILD}`,
    },
  },
};

interface Report {
  /** Where in paper.tex; the start of the file when absent. */
  readonly at?: EntryReport | undefined;
  readonly messageId: string;
  readonly data?: Record<string, string>;
}

const AT_START: EntryReport = { kind: "here", span: { start: 0, end: 0 } };

const JUDGES: Readonly<
  Record<"refs-checked" | "refs-fresh", (a: Assessment) => readonly Report[]>
> = {
  "refs-checked": (a) => {
    switch (a.kind) {
      case "unrecorded":
        return [{ messageId: "unrecorded" }];
      case "not-checked":
        return [{ messageId: "notChecked", data: { why: a.why } }];
      case "unread":
        return [
          { messageId: "unread", data: { what: a.databases.join(", ") } },
        ];
      case "ready": {
        const unseen = unseenKeys(a.judged.bib);
        return unseen.length === 0
          ? []
          : [
              {
                messageId: "unseen",
                data: { what: unseen.map((k) => `\`${k}\``).join(", ") },
              },
            ];
      }
      case "silent":
      case "stale":
        return [];
    }
  },
  "refs-fresh": (a) => (a.kind === "stale" ? [{ messageId: "stale" }] : []),
};

/**
 * One finding, at its entry in paper.tex — or, for an entry in a `.bib`, at the top, with the `…In`
 * message that names the entry's file, line and column first.
 */
function report(context: RuleContext, r: Report): void {
  const loc = (i: number) => context.sourceCode.getLocFromIndex(i);
  const at = r.at ?? AT_START;
  context.report({
    loc: { start: loc(at.span.start), end: loc(at.span.end) },
    ...(at.kind === "here"
      ? { messageId: r.messageId, ...(r.data ? { data: r.data } : {}) }
      : {
          messageId: `${r.messageId}In`,
          data: { ...r.data, where: at.where },
        }),
  });
}

/** The verdicts a rule reports, and the message each makes. */
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

/**
 * The entries the verdicts judged failing for `rule`, each where it is reported (`entryReports`): the
 * line of its `filecontents` block in the paper's text when TeX wrote its `.bib` from one, else the
 * top of `paper.tex`.
 */
function verdictReports(
  rule: keyof typeof VERDICT_RULES,
  context: RuleContext,
  deps: RecordedDeps,
): readonly Report[] {
  const main = callerPath(context.filename);
  const dir = dirname(main);
  const a = assess(deps, dir);
  if (a.kind !== "ready") return [];
  const { failed, messageId } = VERDICT_RULES[rule];
  const flagged = a.judged.verdicts.filter(([, v]) => failed(v));
  const at = entryReports(
    {
      dir,
      record: a.judged.bib.record,
      main: { path: main, text: context.sourceCode.raw },
    },
    flagged.map(([f]) => f),
    deps,
  );
  return flagged.map(([, v], i) => ({
    at: at[i],
    messageId,
    data: { key: v.key, why: v.why ?? "" },
  }));
}

/** The four rules, reading the paper through `deps`. They act on `paper.tex` only. */
export function referenceRules(
  deps: RecordedDeps,
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
