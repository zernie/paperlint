/**
 * `cycle/stage` on a scorecard's frontmatter beside a settings file: a stage names its cycle, the
 * cycle exists, and no PDF was sent from a cycle still porting. Silent on the flat form.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import markdown from "@eslint/markdown";
import { Linter } from "eslint";
import { test } from "vitest";
import { useTempDir, writeTree } from "../test/support.ts";
import cycleStage from "./cycle-stage.ts";

const root = useTempDir("cycle-stage-");
const linter = new Linter({ cwd: root });

const SETTINGS = JSON.stringify({
  cycles: [
    {
      id: "alpha-2026",
      venue: { kind: "preset", extends: "paperlint:acm-sigconf" },
      opened: "2026-07-01",
      outcome: { kind: "rejected", date: "2026-09-08", evidence: "r.md" },
    },
    {
      id: "beta-2027",
      venue: { kind: "preset", extends: "paperlint:ieee-conference" },
      opened: "2026-09-09",
      phase: "porting",
    },
  ],
});

/** The messages of the rule on a PIPELINE-STATUS.md with `frontmatter`, beside `settings`. */
function lint(name, frontmatter, settings = SETTINGS) {
  const dir = writeTree(join(root, name), {
    ...(settings === null ? {} : { "paperlint.json": settings }),
  });
  const msgs = linter.verify(
    `---\n${frontmatter}\n---\n\n# Status\n`,
    [
      {
        files: ["**/*.md"],
        plugins: { markdown, cycle: cycleStage },
        language: "markdown/gfm",
        languageOptions: { frontmatter: "yaml" },
        rules: { "cycle/stage": "error" },
      },
    ],
    join(dir, "PIPELINE-STATUS.md"),
  );
  assert.deepEqual(
    msgs.filter((m) => m.fatal),
    [],
    `${name}: the rule threw`,
  );
  return msgs.map((m) => m.message);
}

const SUBMITTED = (cycle) =>
  `stages:\n  - stage: submitted\n    ${cycle}\n    date: 2026-08-06\n    pdf: versions/a.pdf\n    bytes: 1`;

test("a stage naming a declared cycle: silent", () => {
  assert.deepEqual(lint("ok", SUBMITTED("cycle: alpha-2026")), []);
});

test("the flat form (no `cycles`), no settings file, or no stages: silent", () => {
  const flat = JSON.stringify({ extends: "paperlint:aidc" });
  assert.deepEqual(lint("flat", SUBMITTED("venue: Somewhere"), flat), []);
  assert.deepEqual(lint("none", SUBMITTED("venue: Somewhere"), null), []);
  assert.deepEqual(lint("empty", "stages: []"), []);
});

test("a stage with no `cycle` names the declared ids; one naming an unknown id names it", () => {
  assert.deepEqual(lint("no-cycle", SUBMITTED("venue: Somewhere")), [
    "the «submitted» stage (2026-08-06) names no `cycle` — this paper declares `cycles` in paperlint.json, so each stage says which attempt it belongs to: `cycle: <id>`, one of alpha-2026 · beta-2027",
  ]);
  assert.deepEqual(lint("unknown", SUBMITTED("cycle: gamma-2028")), [
    "the «submitted» stage (2026-08-06) names the cycle «gamma-2028», which paperlint.json does not declare — the declared ids: alpha-2026 · beta-2027",
  ]);
});

test("a PDF sent from a cycle still porting is named; a stage that sends none is not", () => {
  assert.deepEqual(lint("porting", SUBMITTED("cycle: beta-2027")), [
    "the «submitted» stage (2026-08-06) belongs to the cycle «beta-2027», whose phase is still `porting`: a PDF was sent while the record says the source is in the previous venue's template. Finish the port and drop the phase, or the stage is wrong",
  ]);
  assert.deepEqual(
    lint(
      "arxiv-porting",
      SUBMITTED("cycle: beta-2027").replace("submitted", "arxiv"),
    ),
    [],
  );
});

test("a settings file that is not JSON, or frontmatter that is not YAML: silent — other rules report those", () => {
  assert.deepEqual(lint("not-json", SUBMITTED("venue: X"), "{ not json"), []);
  assert.deepEqual(lint("not-yaml", "stages: [unclosed"), []);
});

test("a YAML date without quotes is still a date in the message", () => {
  const [msg] = lint("yaml-date", SUBMITTED("venue: X"));
  assert.match(msg, /\(2026-08-06\)/);
});
