/**
 * `paper/stages` and `paper/source` on the malformed declarations the fixture papers do not carry:
 * YAML that does not parse, `stages` that is not a list, an unknown or missing stage, a missing
 * field, a date that is not a date — and, in `versions/`, the files the rule must NOT count.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import markdown from "@eslint/markdown";
import { Linter } from "eslint";
import { test } from "vitest";
import { useTempDir, writeTree } from "../test/support.ts";
import stages from "./paper-stages.ts";

const root = useTempDir("paper-stages-");
// Flat config matches `files` against paths under the linter's cwd; the temp papers live outside
// the repository, so the cwd is the temp root (otherwise: "No matching configuration found").
const linter = new Linter({ cwd: root });

/** The messages of `rule` on a PIPELINE-STATUS.md with `frontmatter`, in a paper holding `files`. */
function lint(name, frontmatter, { rule = "stages", files = {} } = {}) {
  const dir = writeTree(join(root, name), files);
  const file = join(dir, "PIPELINE-STATUS.md");
  const msgs = linter.verify(
    `---\n${frontmatter}\n---\n\n# Status\n`,
    [
      {
        files: ["**/*.md"],
        plugins: { markdown, paper: stages },
        language: "markdown/gfm",
        languageOptions: { frontmatter: "yaml" },
        rules: { [`paper/${rule}`]: "error" },
      },
    ],
    file,
  );
  assert.deepEqual(
    msgs.filter((m) => m.fatal),
    [],
    `${name}: the rule threw`,
  );
  return msgs.map((m) => m.message);
}

test("YAML that does not parse is named; paper/source leaves it to paper/stages", () => {
  const [msg] = lint("bad-yaml", "stages: [");
  assert.match(msg, /^the frontmatter does not parse as YAML: /);
  assert.deepEqual(lint("bad-yaml-src", "stages: [", { rule: "source" }), []);
});

test("`stages` must be a list: empty and a scalar are each named", () => {
  assert.deepEqual(lint("empty", "stages:"), [
    "`stages` must be a LIST of entries, not empty — a paper can reach the same stage twice",
  ]);
  assert.deepEqual(lint("scalar", "stages: submitted"), [
    "`stages` must be a LIST of entries, not string — a paper can reach the same stage twice",
  ]);
});

test("each entry: an unknown or missing stage, missing fields, a date that is not a date", () => {
  assert.deepEqual(
    lint(
      "entries",
      [
        "stages:",
        "  - stage: reviewed",
        "  - date: 2026-08-01",
        "  - stage: submitted",
        "    date: 2026-08-01",
        "  - stage: arxiv",
        "    date: soon",
        "    pdf: versions/x.pdf",
        "    bytes: 1",
        "  - stage: camera-ready",
        "    date: 20260801",
        "    pdf: versions/x.pdf",
        "    bytes: 1",
        "  - stage: arxiv",
        '    date: "2026-08-03"',
        "    pdf: versions/x.pdf",
        "    bytes: 1",
      ].join("\n"),
    ),
    [
      "unknown stage «reviewed» — the vocabulary is: submitted · camera-ready · arxiv",
      "unknown stage «» — the vocabulary is: submitted · camera-ready · arxiv",
      "the «submitted» entry has no `pdf` field",
      "the «submitted» entry has no `bytes` field",
      "the date «soon» in the «arxiv» entry is not YYYY-MM-DD",
      "the date «20260801» in the «camera-ready» entry is not YYYY-MM-DD",
      // A quoted date stays a string and is read the same as an unquoted one.
      "stage «arxiv» (2026-08-03) is declared, but `versions/x.pdf` is not on disk",
    ],
  );
});

test("a stage written as a mapping is named as written, not as [object Object]", () => {
  assert.deepEqual(lint("mapping", "stages:\n  - stage: {name: submitted}"), [
    'unknown stage «{"name":"submitted"}» — the vocabulary is: submitted · camera-ready · arxiv',
  ]);
});

test("paper/source skips a `stages` that is not a list, and entries whose stage is unknown or missing", () => {
  assert.deepEqual(
    lint("src-scalar", "stages: submitted", { rule: "source" }),
    [],
  );
  assert.deepEqual(
    lint("src-skip", "stages:\n  - stage: reviewed\n  - date: 2026-08-01", {
      rule: "source",
    }),
    [],
  );
});

test("versions/: only dated stage pdfs count — not other files, STALE ones, odd names or other stages", () => {
  assert.deepEqual(
    lint("versions", "title: x", {
      files: {
        "versions/README.md": "x",
        "versions/2026-08-01-submitted.STALE-wrong.pdf": "x",
        "versions/draft.pdf": "x",
        "versions/2026-08-01-review.pdf": "x",
        "versions/2026-08-02-arxiv.pdf": "x",
      },
    }),
    [
      "`versions/2026-08-02-arxiv.pdf` is frozen, but no «arxiv» stage on 2026-08-02 is declared in `stages` — the artefact ran ahead of the declaration",
    ],
  );
});

test("a frontmatter node without a value (another markdown language) reads as empty YAML", () => {
  const reports = [];
  const context = {
    filename: join(root, "valueless", "PIPELINE-STATUS.md"),
    report: (r) => reports.push(r),
  };
  for (const rule of ["stages", "source"])
    stages.rules[rule].create(context).yaml({ type: "yaml" });
  assert.deepEqual(reports, []);
});

const CYCLES = { "paperlint.json": JSON.stringify({ cycles: [] }) };
const RETIRED = (paper) =>
  `\`stages\` is retired for a paper that keeps \`cycles\` in paperlint.json: its frozen versions are versions/<cycle>/<stage>.{pdf,tex}, recorded in versions/lock.json — \`npx paperlint versions migrate ${paper}\` moves the files there and takes the list out`;

test("under `cycles`: a `stages` list is one finding naming the migration, and dated files owe it nothing", () => {
  const files = {
    ...CYCLES,
    "versions/2026-08-02-submitted.pdf": "x",
  };
  assert.deepEqual(
    lint(
      "retired",
      "stages:\n  - stage: submitted\n    date: 2026-08-02\n    pdf: versions/2026-08-02-submitted.pdf\n    bytes: 9",
      { files },
    ),
    [RETIRED("retired")],
  );
  assert.deepEqual(
    lint("retired-src", "stages:\n  - stage: submitted\n    date: 2026-08-02", {
      rule: "source",
      files,
    }),
    [],
  );
});

test("under `cycles`: no list, an empty one, or no frontmatter is silent; YAML that does not parse is still named", () => {
  assert.deepEqual(lint("retired-none", "title: x", { files: CYCLES }), []);
  assert.deepEqual(lint("retired-empty", "stages: []", { files: CYCLES }), []);
  const [msg] = lint("retired-yaml", "stages: [", { files: CYCLES });
  assert.match(msg, /^the frontmatter does not parse as YAML: /);
  // A paperlint.json that does not parse keeps the flat form's checks: `paperlint lint` refuses it before any rule runs.
  assert.deepEqual(
    lint("retired-broken", "stages:", {
      files: { "paperlint.json": "{" },
    }),
    [
      "`stages` must be a LIST of entries, not empty — a paper can reach the same stage twice",
    ],
  );
});

test("under `cycles`: a frontmatter node without a value reads as empty YAML", () => {
  const dir = writeTree(join(root, "retired-valueless"), CYCLES);
  const reports = [];
  const context = {
    filename: join(dir, "PIPELINE-STATUS.md"),
    cwd: dir,
    report: (r) => reports.push(r),
  };
  stages.rules.stages.create(context).yaml({ type: "yaml" });
  assert.deepEqual(reports, []);
  // Linted from the paper itself, the command names it as `.`.
  stages.rules.stages
    .create(context)
    .yaml({ type: "yaml", value: "stages:\n  - stage: submitted" });
  assert.deepEqual(
    reports.map((r) => r.data),
    [{ paper: "." }],
  );
});
