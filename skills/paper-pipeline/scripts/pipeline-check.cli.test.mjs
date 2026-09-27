/**
 * pipeline-check.mjs's human mode — the banner every edit to a paper reprints (where the paper
 * stands and the next move), the finding list under it, and the warning for a scorecard that does
 * not parse (the current template misspelled vs the retired single-table format). The harness
 * beside it covers the checks through `--json`; this covers what a person reads.
 */
import assert from "node:assert/strict";
import { utimesSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { runNode, useTempDir, writeTree } from "../../../test/support.mjs";
import { scorecard } from "./fixtures/scorecard.mjs";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "pipeline-check.mjs",
);
const root = useTempDir("pipeline-check-cli-");
const TODAY = "2026-09-01";
// The temp paper sits outside any git repository, so the text's date is its mtime: pinned before
// every date in the scorecard fixture, so a gate is stale only when a case makes it so.
const TEXT_DATE = new Date("2026-08-01T12:00:00Z");
const paper = (name, card) => {
  const dir = join(root, name);
  writeTree(dir, {
    ...(card === null ? {} : { "PIPELINE-STATUS.md": card }),
    "paper.md": "## 1. Heading\n\nProse.\n",
  });
  utimesSync(join(dir, "paper.md"), TEXT_DATE, TEXT_DATE);
};
const run = (name, ...args) => {
  const r = runNode(SCRIPT, [join(root, name), `--today=${TODAY}`, ...args], {
    env: { OSF_TOKEN: "", GITHUB_TOKEN: "" },
  });
  return {
    ...r,
    stdout: r.stdout.replaceAll(root, "<root>"),
    stderr: r.stderr.replaceAll(root, "<root>"),
  };
};

test("no scorecard: nothing to say, exit 0", () => {
  paper("none", null);
  assert.deepEqual(run("none"), { status: 0, stdout: "", stderr: "" });
});

test("a clean scorecard: the banner, with the deadline counted down and no finding", () => {
  paper("clean", scorecard({ deadline: "2026-09-11" }, TODAY));
  const r = run("clean");
  assert.deepEqual(r, {
    status: 0,
    stderr: "",
    stdout: [
      "📊 clean — 2026-09-11 (T−10d) · 0 open finding(s)",
      "   verdict row: Submit-ready — every gate green, artifact reproduces clean, nothing blocking.",
      "   ➡️ NEXT: no mechanical blocker — run paper-status for the measured picture (build page count, stale gates, owner-split) before deciding it is done",
      "   (page count comes from repro/build-submission.sh, never from this line)",
      "",
    ].join("\n"),
  });
});
