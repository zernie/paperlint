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
 * The bibliography is the one TeX reads (`paperSources`, src/paper-sources.ts). An entry in a block
 * of `paper.tex` is reported on its line; an entry in a `.bib` file — which ESLint does not lint — at
 * the `\bibliography` that declares it, the file, line and column at the front of the message.
 *
 * `paper/author-list` used to live on PIPELINE-STATUS.md and ask whether the scorecard mentioned
 * a run. It lives here now because its subject is the bibliography, and the record of the run is
 * the run's own output.
 */
import { basename, dirname } from "node:path";
import { entryReport, findEntry, type EntryReport } from "./bib-rules.ts";
import { callerPath } from "./caller-path.ts";
import { MAIN_FILE, type PaperSources } from "./domain/paper-sources.ts";
import { paperSources, type SourcesDeps } from "./paper-sources.ts";
import {
  bibHash,
  checkedBibliography,
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
  | {
      readonly kind: "ready";
      readonly sources: PaperSources;
      readonly unseen: Unseen;
      readonly failing: readonly {
        readonly key: string;
        readonly rule: "author-list" | "cite-exists";
        readonly why: string;
      }[];
    };

function assess(deps: SourcesDeps, paperDir: string): Assessment {
  const read = paperSources(paperDir, deps);
  const bib = read.ok ? checkedBibliography(read.value.bibliography) : null;
  if (!read.ok || bib === null) return { kind: "no-bibliography" };
  const doc = readReferences(deps.files, paperDir);
  if (doc === null) return { kind: "unrecorded" };
  if (doc.bib.sha256 !== bibHash(bib)) return { kind: "stale" };
  if (doc.status === "not-checked")
    return { kind: "not-checked", why: doc.why ?? "no reason recorded" };
  const failing = doc.entries.flatMap((e) => [
    ...(e.authors === "mismatch"
      ? [{ key: e.key, rule: "author-list" as const, why: e.why ?? "" }]
      : []),
    ...(e.exists === "false"
      ? [{ key: e.key, rule: "cite-exists" as const, why: e.why ?? "" }]
      : []),
  ]);
  return {
    kind: "ready",
    sources: read.value,
    unseen: unseenBy(read.value, doc.bibtex),
    failing,
  };
}

/** Where a finding about entry `key` is reported in paper.tex (the file's start when no entry has it). */
const keyReport = (sources: PaperSources, key: string): EntryReport => {
  const found = findEntry(sources, key);
  return found === null
    ? { kind: "here", span: { start: 0, end: 0 } }
    : entryReport(sources, found);
};

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

const JUDGES: Readonly<Record<Name, (a: Assessment) => readonly Report[]>> = {
  "author-list": (a) =>
    a.kind === "ready"
      ? a.failing
          .filter((f) => f.rule === "author-list")
          .map((f) => ({
            at: keyReport(a.sources, f.key),
            messageId: "mismatch",
            data: { key: f.key, why: f.why },
          }))
      : [],
  "cite-exists": (a) =>
    a.kind === "ready"
      ? a.failing
          .filter((f) => f.rule === "cite-exists")
          .map((f) => ({
            at: keyReport(a.sources, f.key),
            messageId: "missing",
            data: { key: f.key, why: f.why },
          }))
      : [],
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

/** The four rules, reading the paper through `deps`. They act on `paper.tex` only. */
export function referenceRules(
  deps: SourcesDeps,
): Record<Name, ReferenceRuleModule> {
  const make = (name: Name): ReferenceRuleModule => ({
    meta: META[name],
    create: (context) =>
      basename(context.filename) !== MAIN_FILE
        ? {}
        : {
            "root:exit": () => {
              const paperDir = dirname(callerPath(context.filename));
              const a = assess(deps, paperDir);
              for (const r of JUDGES[name](a)) report(context, r);
            },
          },
  });
  return {
    "author-list": make("author-list"),
    "cite-exists": make("cite-exists"),
    "refs-checked": make("refs-checked"),
    "refs-fresh": make("refs-fresh"),
  };
}

/** The level each is on at for every `paper.tex` in paperlint's own config. */
export const REFERENCE_RULE_LEVELS = {
  "paper/author-list": "error",
  "paper/cite-exists": "error",
  "paper/refs-checked": "warn",
  "paper/refs-fresh": "error",
} as const;
