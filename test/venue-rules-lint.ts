/**
 * The venue-conformance rules run over one `paper.tex` held in memory beside the SHIPPED presets,
 * the way ESLint runs them: `create`, then `root`. Shared by the tests of those rules
 * (`src/tex-venue-rules.test.ts`) and of `tex/venue-leftover`'s judge (`src/venue-leftover.test.ts`).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles } from "../src/adapters/memory/index.ts";
import { sourcesCodec } from "../src/adapters/sources-record/index.ts";
import { latexReader } from "../src/adapters/latex/index.ts";
import { presetsDir } from "../src/package-dirs.ts";
import {
  cyclePortRules,
  formatRules,
  texVenueRules,
  type TexRuleContext,
  type TexRuleModule,
} from "../src/tex-venue-rules.ts";

export const VENUES = presetsDir();
export const PAPER = "/work/papers/p";
/** What the rules read with besides the files: the presets, the LaTeX reader, the record's schema. */
export const READERS = {
  venuesDir: VENUES,
  latex: latexReader,
  codec: sourcesCodec,
};
export const shipped = Object.fromEntries(
  readdirSync(VENUES)
    .filter((f) => f.endsWith(".jsonc") || f.endsWith(".json"))
    .map((f) => [join(VENUES, f), readFileSync(join(VENUES, f))]),
);

export interface Finding {
  readonly rule: string;
  readonly messageId: string;
  readonly message: string;
  readonly line: number;
}

/** The line and 1-based column of an offset, as ESLint's text source code gives them. */
const locOf = (src: string) => (i: number) => {
  const before = src.slice(0, i).split("\n");
  return { line: before.length, column: (before.at(-1) ?? "").length + 1 };
};

/**
 * Every venue-conformance rule over one `paper.tex`, the way ESLint runs them: `create`, then
 * `root`. `settings` is the paper's paperlint.json (absent: no file); `extra` more files.
 */
export function lint(
  tex: string,
  settings: object | undefined,
  {
    filename = `${PAPER}/paper.tex`,
    extra = {},
    raw = true,
    options,
  }: {
    filename?: string;
    extra?: Record<string, string>;
    /** false: the source code carries no `raw` (not the `.tex` language's), only `text`. */
    raw?: boolean;
    /** The rule options every rule is given, as ESLint would pass them; absent: a context with none. */
    options?: readonly unknown[];
  } = {},
): Finding[] {
  const files = memoryFiles({
    ...shipped,
    ...(settings === undefined
      ? {}
      : { [`${PAPER}/paperlint.json`]: JSON.stringify(settings) }),
    ...extra,
  });
  const out: Finding[] = [];
  const deps = { files, ...READERS };
  for (const [id, rule] of [
    ...Object.entries(texVenueRules(deps)).map(
      ([n, r]) => [`tex/${n}`, r] as const,
    ),
    ...Object.entries(formatRules(deps)).map(
      ([n, r]) => [`format/${n}`, r] as const,
    ),
    ...Object.entries(cyclePortRules(deps)).map(
      ([n, r]) => [`cycle/${n}`, r] as const,
    ),
  ]) {
    const visitor = rule.create({
      filename,
      ...(options === undefined ? {} : { options }),
      sourceCode: {
        text: tex,
        ...(raw ? { raw: tex } : {}),
        getLocFromIndex: locOf(tex),
      },
      report: (d) => out.push(findingOf(id, rule, d)),
    });
    visitor.root?.();
  }
  return out;
}

/** One report as a finding: its message filled in from the rule's `meta.messages`. */
function findingOf(
  rule: string,
  module: TexRuleModule,
  d: Parameters<TexRuleContext["report"]>[0],
): Finding {
  return {
    rule,
    // A finding from an included file arrives as a whole message, its file at the front.
    messageId: "messageId" in d ? d.messageId : "(message)",
    message:
      "messageId" in d
        ? Object.entries(d.data ?? {}).reduce(
            (m, [k, v]) => m.replaceAll(`{{${k}}}`, String(v)),
            module.meta.messages[d.messageId] ?? `(no message ${d.messageId})`,
          )
        : d.message,
    line: d.loc.start.line,
  };
}
