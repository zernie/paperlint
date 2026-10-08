/**
 * `paper/sources-fresh` (`src/sources-rules.ts`) on papers held in memory, the way ESLint runs the rule:
 * `create`, then `root:exit`. Both halves: a paper with no record, an unreadable one, or one the
 * paper has changed since is reported once, at the top of `paper.tex`, saying what to run; a paper
 * whose record is current is not, and neither is any file but `paper.tex`.
 */
import { describe, expect, it } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import { sha256Hex } from "./domain/sha256.ts";
import {
  serializeSourcesRecord,
  type SourcesRecord,
} from "./domain/sources-record.ts";
import { SOURCES_RULE_LEVELS, sourcesRules } from "./sources-rules.ts";
import { builtFixture } from "../test/recorded-fixture.ts";

const DIR = "/work/papers/p";
const bytes = (s: string) => new TextEncoder().encode(s);

const RECORD: SourcesRecord = {
  schema: 1,
  inputs: [
    { path: "paper.tex", role: "body" },
    { path: "sections/a.tex", role: "body" },
  ],
  written: [],
  bibdata: [],
  bibtex: { ran: false },
  sha256: {
    "paper.tex": sha256Hex(bytes("main")),
    "sections/a.tex": sha256Hex(bytes("a")),
  },
};
const FRESH = {
  [`${DIR}/paper.tex`]: "main",
  [`${DIR}/sections/a.tex`]: "a",
  [`${DIR}/_build/sources.json`]: serializeSourcesRecord(RECORD),
};

interface Reported {
  readonly messageId: string;
  readonly message: string;
  readonly line: number;
}

/** The rule over one file of the paper directory, the way ESLint runs it. */
function lint(
  tree: Record<string, string>,
  file = "paper.tex",
): readonly Reported[] {
  const rule = sourcesRules({
    files: memoryFiles(tree),
    codec: sourcesCodec,
  })["sources-fresh"];
  const out: Reported[] = [];
  const visitor = rule.create({
    filename: `${DIR}/${file}`,
    sourceCode: { getLocFromIndex: () => ({ line: 1, column: 0 }) },
    report: (d) => {
      const template = rule.meta.messages[d.messageId] ?? "";
      const message = Object.entries(d.data ?? {}).reduce(
        (m, [k, v]) => m.split(`{{${k}}}`).join(v),
        template,
      );
      out.push({ messageId: d.messageId, message, line: d.loc.start.line });
    },
  });
  visitor["root:exit"]?.();
  return out;
}

describe("paper/sources-fresh — reports", () => {
  it("a paper no build has recorded is reported 'not built', and what that leaves unlinted", () => {
    expect(
      lint({ [`${DIR}/paper.tex`]: "main" }).map((r) => [
        r.messageId,
        r.message,
        r.line,
      ]),
    ).toEqual([
      [
        "notBuilt",
        "the paper has not been built — run `npx paperlint build`, which records the files TeX reads. Until it has, the files `paper.tex` includes are not linted, and the rules that read the bibliography say nothing",
        1,
      ],
    ]);
  });

  it("a record this paperlint cannot read is reported, with why", () => {
    expect(
      lint({
        ...FRESH,
        [`${DIR}/_build/sources.json`]: '{"schema":2}',
      }).map((r) => [r.messageId, r.message]),
    ).toEqual([
      [
        "unreadable",
        "the last build's record cannot be used (sources.json is schema 2, this paperlint reads schema 1) — run `npx paperlint build`; until then the files `paper.tex` includes are not linted, and the rules that read the bibliography say nothing",
      ],
    ]);
  });

  it("a paper changed since the build is reported, naming what changed", () => {
    expect(
      lint({ ...FRESH, [`${DIR}/sections/a.tex`]: "edited" }).map((r) => [
        r.messageId,
        r.message,
      ]),
    ).toEqual([
      [
        "stale",
        "the paper changed since the last build (sections/a.tex edited) — run `npx paperlint build`; until then the files `paper.tex` includes are not linted, and the rules that read the bibliography say nothing",
      ],
    ]);
  });
});

describe("paper/sources-fresh — a .tex TeX wrote from a filecontents block", () => {
  it("🔴 is a file of the paper: current as the build left it, stale once it is gone or edited", () => {
    // v29-generated-input: the block in paper.tex wrote body.tex, and the body \input's it.
    const built = builtFixture("v29-generated-input", DIR);
    const cleaned = Object.fromEntries(
      Object.entries(built).filter(([p]) => p !== `${DIR}/body.tex`),
    );
    expect([
      lint(built),
      lint(cleaned).map((r) => r.message),
      lint({ ...built, [`${DIR}/body.tex`]: "edited\n" }).map(
        (r) => r.messageId,
      ),
    ]).toEqual([
      [],
      [expect.stringContaining("(body.tex deleted)")],
      ["stale"],
    ]);
  });
});

describe("paper/sources-fresh — silent", () => {
  it("a paper whose record is current is not reported", () => {
    expect(lint(FRESH)).toEqual([]);
  });

  it("only paper.tex is judged: a record that is missing is not reported on another file", () => {
    expect(lint({ [`${DIR}/other.tex`]: "x" }, "other.tex")).toEqual([]);
  });

  it("the rule is on, as a warning: lint often runs where nothing is built", () => {
    expect(SOURCES_RULE_LEVELS).toEqual({ "paper/sources-fresh": "warn" });
  });
});
