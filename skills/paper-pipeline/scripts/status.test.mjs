/**
 * status.mjs — the paper's status view, derived from the ledger. Every section it can print is
 * driven by rows written for the purpose: fresh and stale answers, open findings with and without
 * a report path, retired-vocabulary rows (an acquittal and a counted one), an orphan check, a check
 * that has run and never found anything, and the all-answered footer.
 */
import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test, vi } from "vitest";
import { runNode, useTempDir, writeTree } from "../../../test/support.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const root = useTempDir("status-");
const consumer = join(root, "consumer");
const LEDGER = join(root, "runs.jsonl");
const paper = join(consumer, "papers", "p");
writeTree(paper, { "paper.md": "# P\n\ntext\n" });
Object.assign(process.env, {
  CLAUDE_PROJECT_DIR: consumer,
  PIPELINE_LEDGER: LEDGER,
});
const { inputHash } = await import("./ledger.mjs");
const { EXPECTED_GATES, main, unlistedGates } = await import("./status.mjs");
afterEach(() => rmSync(LEDGER, { force: true }));

const NOW = inputHash(paper);
const TS = "2026-09-01T10:30:00.000Z";
/** A ledger row for `key` on paper p. No skill is installed here, so its current hash is null. */
const row = (key, fields) => {
  const [skill, check] = key.split("/");
  return {
    ts: TS,
    skill,
    check: check ?? skill,
    paper: "p",
    inputSha: NOW,
    skillSha: null,
    ...fields,
  };
};
const NO_WITNESS = { kind: "ABSTAINED", reason: "no-witness", findings: 0 };

function view(rows) {
  writeFileSync(LEDGER, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  const lines = [];
  const spy = vi
    .spyOn(console, "log")
    .mockImplementation((...a) => lines.push(a.join(" ")));
  let code;
  try {
    code = main(["node", "status.mjs", paper]);
  } finally {
    spy.mockRestore();
  }
  return { code, text: lines.join("\n") };
}
/** The table line for one check, with its padding collapsed. */
const tableLine = (text, key) =>
  text
    .split("\n")
    .find((l) => l.includes(` ${key} `))
    ?.trim()
    .replace(/\s{2,}/g, " | ");
/** A section: from the line that starts with `head` to the next blank line. */
const section = (text, head) => {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l.trim().startsWith(head));
  if (i < 0) return null;
  const end = lines.findIndex((l, j) => j > i && l.trim() === "");
  return lines.slice(i, end < 0 ? undefined : end).map((l) => l.trim());
};

const RAN = [
  "research-ideate",
  "find-venue",
  "map-prior-work",
  "sweep-design-space",
  "plan-paper-timeline",
  "build-benchmark",
  "draft-paper",
];

test("every kind of row, and every section it triggers", () => {
  const { code, text } = view([
    row("research-ideate", NO_WITNESS),
    row("find-venue", {
      kind: "FINDING",
      findings: 3,
      blocking: true,
      report: "r.md",
    }),
    row("map-prior-work", { kind: "FINDING", findings: 2, inputSha: "older" }),
    row("sweep-design-space", { ...NO_WITNESS, skillSha: "a-different-skill" }),
    row("plan-paper-timeline", { verdict: "PASS" }),
    row("build-benchmark", { verdict: "FINDINGS", findings: 2 }),
    row("draft-paper", { kind: "FINDING", findings: 0 }),
    row("mystery-check", NO_WITNESS),
    row("paper-status", NO_WITNESS),
  ]);
  assert.deepEqual(
    {
      code,
      rows: [
        "research-ideate",
        "find-venue",
        "map-prior-work",
        "sweep-design-space",
        "plan-paper-timeline",
        "build-benchmark",
        "draft-paper",
        "camera-ready",
      ].map((k) => tableLine(text, k)),
      stale: text
        .split("\n")
        .filter((l) => /^\s+(🟠|🟡) [\w/-]+: /.test(l))
        .map((l) => l.trim()),
      never: section(text, "⬜ never run:"),
      mute: section(text, "🔇"),
      legacy: section(text, "🏷️"),
      orphans: section(text, "❗"),
      open: section(text, "📌"),
      quiet: section(text, "🤍"),
      footer: text.trim().split("\n").pop().trim(),
    },
    {
      code: 0,
      rows: [
        "🟢 research-ideate | FRESH | abstained:no-witness | 1 | 2026-09-01 10:30",
        "🟢 find-venue | FRESH | 🔴 3 found | 1 | 2026-09-01 10:30",
        "🟠 map-prior-work | STALE-PAPER | • 2 found | 1 | 2026-09-01 10:30",
        "🟡 sweep-design-space | STALE-SKILL | abstained:no-witness | 1 | 2026-09-01 10:30",
        "🟢 plan-paper-timeline | FRESH | legacy:PASS | 1 | 2026-09-01 10:30",
        "🟢 build-benchmark | FRESH | • 2 found | 1 | 2026-09-01 10:30",
        "🟢 draft-paper | FRESH | no row | 1 | 2026-09-01 10:30",
        "⬜ camera-ready | NEVER-RUN | — | 0 | —",
      ],
      stale: [
        // In EXPECTED_GATES order.
        "🟡 sweep-design-space: the check itself changed since it ran — that answer came from a different tool",
        "🟠 map-prior-work: the paper changed since it ran — its answer is about a document that is gone",
      ],
      never: [
        `⬜ never run: ${EXPECTED_GATES.filter((k) => !RAN.includes(k)).join(", ")}`,
        "nobody has asked this question about this paper — an unasked question reads exactly like a clean one in prose.",
      ],
      mute: [
        "🔇 has run and has NEVER recorded a finding: research-ideate, sweep-design-space, plan-paper-timeline",
        "Borrowed from mutation testing: a test that kills no mutant is not a test. This is",
        "not proof the check is broken — it is the reason to go plant a defect and watch.",
        "Precedent here: a tightening pass returned KEEP on 80 of 81 sections and a",
        'justification pass never once recommended a deletion. Both "ran".',
      ],
      legacy: [
        "🏷️  answered in the RETIRED vocabulary: plan-paper-timeline=PASS, build-benchmark=FINDINGS",
        "Rows written before 2026-08-10 are kept verbatim and are NOT translated into the",
        "current constructors — a silent reinterpretation is the class of defect this",
        "pipeline removed. A retired FINDINGS/FAIL row still shows its count above, because",
        "it carries evidence and discarding evidence is the destructive direction.",
        "plan-paper-timeline=PASS carry NOTHING forward:",
        "they recorded that nothing was wrong, with no evidence attached, which is exactly",
        "the value that was deleted. Re-run those checks for an answer in a live vocabulary.",
      ],
      // `paper-status` records too, but is the view itself, so it is never an orphan.
      orphans: [
        "❗ recording but NOT IN THE TABLE: mystery-check",
        "These ran and said something, and this view showed you nothing. Add them to",
        "EXPECTED_GATES — an invisible row is the failure this directory exists to end.",
      ],
      open: [
        "📌 open findings: 7 across 3 check(s)",
        "• map-prior-work: 2 (no report path recorded — the count is all there is)  [STALE-PAPER: this count describes an older text]",
        "🔴 find-venue: 3 → r.md",
        "• build-benchmark: 2 (no report path recorded — the count is all there is)",
        "Nothing here proves anyone acted on these. The ledger records what a check SAID,",
        "never what was done about it — that lives in the session, not in a file.",
      ],
      quiet: [
        "🤍 ran against the current bytes and recorded nothing: 1 check(s)",
        "research-ideate (no-witness)",
        "Read this as the ABSENCE of a finding, which is what it is. `no-witness` means the",
        "check ran and has no witness for the negative answer — unlike a certifying",
        "algorithm (McConnell et al. 2011), which ships one for both answers. Our discipline",
        "is strictly weaker than theirs and this line is where that shows.",
        "no-witness: ran to completion, produced no finding — NOT a claim that nothing is wrong",
      ],
      footer: "🔴 29 check(s) not answering for the current text",
    },
  );
});

test("every expected check answered on the current bytes: the green footer, and nothing to flag", () => {
  const { code, text } = view(
    EXPECTED_GATES.map((k) =>
      row(k, { kind: "FINDING", findings: 1, report: "r.md" }),
    ),
  );
  assert.deepEqual(
    {
      code,
      sections: ["🟠", "🟡", "⬜ never", "🔇", "🏷️", "❗", "🤍"].map((h) =>
        section(text, h),
      ),
      footer: text.trim().split("\n").pop().trim(),
    },
    {
      code: 0,
      sections: [null, null, null, null, null, null, null],
      footer: "🟢 every expected check answered for the current text",
    },
  );
});

test("unlistedGates names checks the table does not list, except the view's own rows", () => {
  assert.deepEqual(
    unlistedGates([
      { skill: "find-venue", check: "find-venue" },
      { skill: "x", check: "y" },
      { skill: "paper-status", check: "paper-status" },
    ]),
    ["x/y"],
  );
});

test("as a process, with no argument, it reads the current directory and exits 0", () => {
  const r = runNode(join(HERE, "status.mjs"), [], {
    cwd: paper,
    env: { CLAUDE_PROJECT_DIR: consumer, PIPELINE_LEDGER: LEDGER },
  });
  assert.deepEqual([r.status, r.stdout.split("\n")[1]], [0, "  p"]);
});
