/**
 * `artifact/upload-current` (`src/artifact-upload-rule.ts`) over files in memory: every state it can
 * be in, as the finding it makes. Through real ESLint and the CLI, in `src/rule-cases.test.ts`.
 */
import { expect, test } from "vitest";
import { latexReader } from "./adapters/latex/index.ts";
import { memoryFiles } from "./adapters/memory/index.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import {
  artifactUploadRules,
  uploadFindings,
  uploadOptions,
} from "./artifact-upload-rule.ts";
import { uploadRecordText } from "./domain/artifact-upload.ts";
import { recordText } from "../test/recorded-fixture.ts";

const DIR = "/work/papers/p";
const NUMBERS =
  "\\newcommand{\\nRepos}{64}\n\\newcommand{\\nRuns}{7}\n\\newcommand{\\pct}{41.2\\%}\n\\newcommand{\\nA}{1}\n\\newcommand{\\nB}{2}\n\\newcommand{\\nC}{3}\n\\newcommand{\\unused}{9}\n";
const PAPER =
  "\\documentclass{article}\n\\input{numbersdef}\n\\begin{document}\n\\nRepos{} repos, \\nRuns{} runs, \\pct.\n\\input{sections/more}\n\\end{document}\n";
const MORE = "\\nA, \\nB, \\nC.\n";
const AT_UPLOAD = { nRepos: "63", nRuns: "7", pct: "41.2\\%" };

const record = (numbers: Readonly<Record<string, string>>): string =>
  uploadRecordText({
    version: 1,
    host: "osf",
    url: "https://osf.io/abcde/",
    file: "artifact.zip",
    uploadedAt: "2026-11-01T10:00:00Z",
    numbers,
  });

/** The paper's files under `DIR`, with the build's record of its body file. */
const tree = (
  extra: Readonly<Record<string, string>>,
): Record<string, string> => {
  const own = {
    "paper.tex": PAPER,
    "numbersdef.tex": NUMBERS,
    "sections/more.tex": MORE,
  };
  const built = recordText(own, {
    inputs: [
      ["paper.tex", "body"],
      ["numbersdef.tex", "preamble"],
      ["sections/more.tex", "body"],
    ],
  });
  return Object.fromEntries(
    Object.entries({ ...own, "_build/sources.json": built, ...extra }).map(
      ([p, t]) => [`${DIR}/${p}`, t],
    ),
  );
};

const findings = (
  files: Readonly<Record<string, string>>,
  options: unknown = { numbers: "numbersdef.tex" },
) =>
  uploadFindings(DIR, uploadOptions(options), {
    files: memoryFiles(files),
    codec: sourcesCodec,
    latex: latexReader,
  });

const RECORD = "submission/artifact-upload.json";

test("🔴 stale: names the new and the changed keys the paper prints, a few of each", () => {
  // Guards: nRepos changed, nA–nC new (from the body file the build record lists), \unused not counted.
  expect(findings(tree({ [RECORD]: record(AT_UPLOAD) }))).toEqual([
    {
      messageId: "stale",
      data: {
        count: 4,
        date: "2026-11-01",
        url: "https://osf.io/abcde/",
        detail: "3 new (nA, nB, nC), 1 changed (nRepos)",
      },
    },
  ]);
});

test("more than three keys of a kind: the rest is counted, not listed", () => {
  // Guards: five new keys show three and "2 more".
  expect(findings(tree({ [RECORD]: record({ pct: "1" }) }))).toEqual([
    {
      messageId: "stale",
      data: {
        count: 6,
        date: "2026-11-01",
        url: "https://osf.io/abcde/",
        detail: "5 new (nRepos, nRuns, nA, 2 more), 1 changed (pct)",
      },
    },
  ]);
  const four = tree({
    "sections/more.tex": "\\nA, \\nB, \\nC, \\unused.\n",
    [RECORD]: record({ pct: "1" }),
  });
  // Without a fresh build record the body file is not read: paper.tex alone counts.
  // Guards: a stale build record narrows the uses to paper.tex.
  expect(findings(four)).toEqual([
    {
      messageId: "stale",
      data: {
        count: 3,
        date: "2026-11-01",
        url: "https://osf.io/abcde/",
        detail: "2 new (nRepos, nRuns), 1 changed (pct)",
      },
    },
  ]);
});

test("a number the paper prints through another macro counts: a change under an alias is found, at any depth", () => {
  const numbers =
    "\\newcommand{\\nRepos}{64}\n\\newcommand{\\repoCount}{\\nRepos}\n\\newcommand{\\shown}{\\repoCount{} repos}\n\\newcommand{\\loopA}{\\loopB}\n\\newcommand{\\loopB}{\\loopA}\n";
  const paper =
    "\\documentclass{article}\n\\begin{document}\n\\shown, \\loopA.\n\\end{document}\n";
  const atUpload = {
    nRepos: "63",
    repoCount: "\\nRepos",
    shown: "\\repoCount{} repos",
    loopA: "\\loopB",
    loopB: "\\loopA",
  };
  const files = {
    [`${DIR}/paper.tex`]: paper,
    [`${DIR}/numbersdef.tex`]: numbers,
    [`${DIR}/${RECORD}`]: record(atUpload),
  };
  // Guards: only \shown is printed; \nRepos, two definitions down, changed; a cycle ends.
  expect(findings(files)).toEqual([
    {
      messageId: "stale",
      data: {
        count: 1,
        date: "2026-11-01",
        url: "https://osf.io/abcde/",
        detail: "1 changed (nRepos)",
      },
    },
  ]);
});

test("silent when the record holds every value the paper prints", () => {
  const now = { ...AT_UPLOAD, nRepos: "64", nA: "1", nB: "2", nC: "3" };
  // Guards: a current record makes no finding, whatever unused macros differ.
  expect(findings(tree({ [RECORD]: record(now) }))).toEqual([]);
  const elsewhere = "extra/upload.json";
  // Guards: the `record` option is where the record is read.
  expect(
    findings(tree({ [elsewhere]: record(now) }), {
      numbers: "numbersdef.tex",
      record: elsewhere,
    }),
  ).toEqual([]);
});

test("turned on without what it needs: one finding, naming what answers it", () => {
  // Guards: no record → the command that writes one.
  expect(findings(tree({}))).toEqual([
    { messageId: "noRecord", data: { path: RECORD } },
  ]);
  // Guards: a record that is not one says why.
  expect(findings(tree({ [RECORD]: "[]" }))).toEqual([
    {
      messageId: "badRecord",
      data: {
        path: RECORD,
        why: "the record: Invalid input: expected object, received array",
      },
    },
  ]);
  // Guards: no numbers file, and one defining nothing, before the record is looked at.
  expect(findings(tree({}), { numbers: "gone.tex" })).toEqual([
    { messageId: "noNumbersFile", data: { path: "gone.tex" } },
  ]);
  expect(findings(tree({ "numbersdef.tex": "% nothing\n" }))).toEqual([
    { messageId: "emptyNumbers", data: { path: "numbersdef.tex" } },
  ]);
  // Guards: turned on with no options at all.
  expect(findings(tree({}), null)).toEqual([
    { messageId: "noOption", data: {} },
  ]);
});

test("reports on PIPELINE-STATUS.md's first line only", () => {
  const rule = artifactUploadRules({
    files: memoryFiles(tree({})),
    codec: sourcesCodec,
    latex: latexReader,
  })["upload-current"];
  const seen = (file: string): readonly string[] => {
    const out: string[] = [];
    rule
      .create({
        filename: `${DIR}/${file}`,
        options: [{ numbers: "numbersdef.tex" }],
        sourceCode: { getLocFromIndex: () => ({ line: 1, column: 0 }) },
        report: (d) => {
          out.push(`${String(d.loc.start.line)} ${d.messageId}`);
        },
      })
      .root?.();
    return out;
  };
  // Guards: one finding on the scorecard; nothing on any other file.
  expect(seen("PIPELINE-STATUS.md")).toEqual(["1 noRecord"]);
  expect(seen("paper.tex")).toEqual([]);
});
