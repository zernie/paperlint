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
 * ESLint does not lint a `.bib`, so a finding about an entry is reported at the start of `paper.tex`,
 * with the entry's file, line and column at the front of the message (`refs.bib:12:1:`).
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
  bibHash,
  readBibliography,
  readReferences,
  REFERENCES_FILE,
  unseenKeys,
  type BibliographyDeps,
  type CheckedBibliography,
  type CheckedEntry,
  type ReferencesDocument,
} from "./references.ts";
import { lineColumn } from "./tex-paper.ts";

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
  /** No usable record of the build, or a build that ran no bibtex: nothing to judge. */
  | { readonly kind: "silent" }
  | { readonly kind: "unread"; readonly databases: readonly string[] }
  | { readonly kind: "unrecorded" }
  | { readonly kind: "not-checked"; readonly why: string }
  | { readonly kind: "stale" }
  | {
      readonly kind: "ready";
      /** Keys bibtex typeset that no entry the reader read has. */
      readonly unseen: readonly string[];
      readonly failing: readonly {
        /** The entry that failed: one key may name two (two databases may each define it). */
        readonly found: CheckedEntry;
        readonly key: string;
        readonly rule: "author-list" | "cite-exists";
        readonly why: string;
      }[];
    };

/**
 * Each entry checked with its verdict — when the record holds one verdict per entry, in its order, as
 * the build writes it. One that does not (written by hand) is not about these databases: null.
 */
function laid(
  verdicts: readonly EntryVerdict[],
  entries: readonly CheckedEntry[],
): readonly (readonly [CheckedEntry, EntryVerdict])[] | null {
  const pairs = entries.flatMap((f, i) => {
    const v = verdicts[i];
    return v?.key === f.entry.key ? [[f, v] as const] : [];
  });
  return pairs.length === entries.length && verdicts.length === entries.length
    ? pairs
    : null;
}

/** The findings the verdicts carry, each at the entry it is about. */
const failingOf = (
  verdicts: readonly (readonly [CheckedEntry, EntryVerdict])[],
): Extract<Assessment, { kind: "ready" }>["failing"] =>
  verdicts.flatMap(([found, e]) => [
    ...(e.authors === "mismatch"
      ? [{ found, key: e.key, rule: "author-list" as const, why: e.why ?? "" }]
      : []),
    ...(e.exists === "false"
      ? [{ found, key: e.key, rule: "cite-exists" as const, why: e.why ?? "" }]
      : []),
  ]);

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
    : { kind: "ready", unseen: unseenKeys(bib), failing: failingOf(verdicts) };
}

function assess(deps: BibliographyDeps, paperDir: string): Assessment {
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
  "{{where}}: `{{key}}`: the authors are not those of the version cited — {{why}}. The citation resolves and the id resolves, and the list is the PREPRINT's under a published venue";
const MISSING =
  "{{where}}: `{{key}}` does not resolve to the work cited — {{why}}";

const META: Readonly<Record<Name, ReferenceRuleModule["meta"]>> = {
  "author-list": {
    type: "problem",
    docs: {
      description:
        "each entry's authors are those of the version it cites, not the preprint's (recorded by paperlint build)",
    },
    schema: [],
    messages: { mismatch: MISMATCH },
  },
  "cite-exists": {
    type: "problem",
    docs: {
      description:
        "each entry's identifier resolves to the work cited (recorded by paperlint build)",
    },
    schema: [],
    messages: { missing: MISSING },
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
  readonly messageId: string;
  readonly data?: Record<string, string>;
}

/** An entry's file, line and column — where the text is, which ESLint does not lint. */
const whereIs = (e: CheckedEntry): string =>
  `${e.database.name}:${lineColumn(e.database.bib.text, e.entry.span.start)}`;

const reportOf = (
  f: Extract<Assessment, { kind: "ready" }>["failing"][number],
  messageId: string,
): Report => ({
  messageId,
  data: { where: whereIs(f.found), key: f.key, why: f.why },
});

const JUDGES: Readonly<Record<Name, (a: Assessment) => readonly Report[]>> = {
  "author-list": (a) =>
    a.kind === "ready"
      ? a.failing
          .filter((f) => f.rule === "author-list")
          .map((f) => reportOf(f, "mismatch"))
      : [],
  "cite-exists": (a) =>
    a.kind === "ready"
      ? a.failing
          .filter((f) => f.rule === "cite-exists")
          .map((f) => reportOf(f, "missing"))
      : [],
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
      case "ready":
        return a.unseen.length === 0
          ? []
          : [
              {
                messageId: "unseen",
                data: { what: a.unseen.map((k) => `\`${k}\``).join(", ") },
              },
            ];
      case "silent":
      case "stale":
        return [];
    }
  },
  "refs-fresh": (a) => (a.kind === "stale" ? [{ messageId: "stale" }] : []),
};

/** The four rules, reading the paper through `deps`. They act on `paper.tex` only. */
export function referenceRules(
  deps: BibliographyDeps,
): Record<Name, ReferenceRuleModule> {
  const make = (name: Name): ReferenceRuleModule => ({
    meta: META[name],
    create: (context) =>
      basename(context.filename) !== MAIN_FILE
        ? {}
        : {
            "root:exit": () => {
              const paperDir = dirname(callerPath(context.filename));
              const at = context.sourceCode.getLocFromIndex(0);
              for (const r of JUDGES[name](assess(deps, paperDir)))
                context.report({ loc: { start: at, end: at }, ...r });
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
