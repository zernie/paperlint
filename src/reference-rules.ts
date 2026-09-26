/**
 * The reference rules — `paper/author-list`, `paper/cite-exists`, `paper/refs-checked`,
 * `paper/refs-fresh` — judge `_build/references.json` (`references.ts`), offline. `paperlint build`
 * does the online work; lint never touches the network.
 *
 *   entry whose authors are the preprint's   paper/author-list (error), on the entry
 *   entry whose identifier provably fails    paper/cite-exists (error), on the entry
 *   no record, or recorded "not checked"     paper/refs-checked (warn) — like pdf/measured
 *   bibliography edited after the build      paper/refs-fresh (error) — like pdf/fresh
 *
 * While the record is stale, the per-entry rules are silent: they would judge a bibliography
 * that no longer exists, and refs-fresh already says so once. A paper with no bibliography gets
 * nothing.
 *
 * `paper/author-list` used to live on PIPELINE-STATUS.md and ask whether the scorecard mentioned
 * a run. It lives here now because its subject is the bibliography, and the record of the run is
 * the run's own output.
 */
import { basename, dirname } from "node:path";
import type { Files } from "./ports/files.ts";
import {
  bibHash,
  bibliographyOf,
  readReferences,
  REFERENCES_FILE,
  type Bibliography,
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
      readonly bib: Bibliography;
      readonly failing: readonly {
        readonly key: string;
        readonly rule: "author-list" | "cite-exists";
        readonly why: string;
      }[];
    };

function assess(files: Files, paperDir: string): Assessment {
  const bib = bibliographyOf(files, paperDir);
  if (bib === null) return { kind: "no-bibliography" };
  const doc = readReferences(files, paperDir);
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
  return { kind: "ready", bib, failing };
}

/** Where entry `key` starts in the source file: its `@type{key,` line, or the file's start. */
function entryOffset(bib: Bibliography, key: string): number {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`^@\\w+\\s*\\{\\s*${escaped}\\s*,`, "m").exec(bib.text);
  return m ? bib.offset + m.index : 0;
}

const BUILD = "`npx paperlint build`";

const META: Readonly<Record<Name, ReferenceRuleModule["meta"]>> = {
  "author-list": {
    type: "problem",
    docs: {
      description:
        "each entry's authors are those of the version it cites, not the preprint's (recorded by paperlint build)",
    },
    schema: [],
    messages: {
      mismatch:
        "`{{key}}`: the authors are not those of the version cited — {{why}}. The citation resolves and the id resolves, and the list is the PREPRINT's under a published venue",
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
      missing: "`{{key}}` does not resolve to the work cited — {{why}}",
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

type Report = { at: number; messageId: string; data?: Record<string, string> };

const JUDGES: Readonly<Record<Name, (a: Assessment) => Report[]>> = {
  "author-list": (a) =>
    a.kind === "ready"
      ? a.failing
          .filter((f) => f.rule === "author-list")
          .map((f) => ({
            at: entryOffset(a.bib, f.key),
            messageId: "mismatch",
            data: { key: f.key, why: f.why },
          }))
      : [],
  "cite-exists": (a) =>
    a.kind === "ready"
      ? a.failing
          .filter((f) => f.rule === "cite-exists")
          .map((f) => ({
            at: entryOffset(a.bib, f.key),
            messageId: "missing",
            data: { key: f.key, why: f.why },
          }))
      : [],
  "refs-checked": (a) =>
    a.kind === "unrecorded"
      ? [{ at: 0, messageId: "unrecorded" }]
      : a.kind === "not-checked"
        ? [{ at: 0, messageId: "notChecked", data: { why: a.why } }]
        : [],
  "refs-fresh": (a) =>
    a.kind === "stale" ? [{ at: 0, messageId: "stale" }] : [],
};

/** The four rules, reading through `files`. They act on `paper.tex` only. */
export function referenceRules({
  files,
}: {
  files: Files;
}): Record<Name, ReferenceRuleModule> {
  const make = (name: Name): ReferenceRuleModule => ({
    meta: META[name],
    create: (context) =>
      basename(context.filename) !== "paper.tex"
        ? {}
        : {
            "root:exit": () => {
              const paperDir = dirname(context.filename);
              const a = assess(files, paperDir);
              // An external refs.bib: the entry is not in this file, so the finding sits at its
              // start and names the key.
              const external =
                a.kind === "ready" && a.bib.source !== "paper.tex";
              for (const r of JUDGES[name](a)) {
                const loc = context.sourceCode.getLocFromIndex(
                  external ? 0 : r.at,
                );
                context.report({
                  loc: { start: loc, end: loc },
                  messageId: r.messageId,
                  ...(r.data ? { data: r.data } : {}),
                });
              }
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
