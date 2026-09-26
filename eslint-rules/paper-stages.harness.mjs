/**
 * Both halves for `paper/stages`, and the halves are not symmetric — which is the point.
 *
 * The rule has TWO directions and each has its own way of being silently useless:
 *   declared -> bytes   passes trivially if nobody declares anything
 *   bytes -> declared   passes trivially if the versions folder is never read
 * So every fixture below exists to kill one specific way of being green and wrong, and the
 * two that matter most are `noheader` (no frontmatter at all, bytes on disk — the rule must
 * NOT be switchable off by deleting a line) and `nothing` (no frontmatter, no bytes — it must
 * stay silent, because a draft owes nothing).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Linter } from "eslint";
import markdown from "@eslint/markdown";
import stages from "./paper-stages.mjs";

const FIX = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "paper-stages",
);
const linter = new Linter();

let n = 0;
const check = (label, cond) => {
  assert.ok(cond, label);
  n++;
};

// 🔴 The `n` counter is RUNNING TOTAL across the whole file, so printing it under one rule's
// heading would credit that rule with someone else's asserts. That's exactly what happened: the
// line about `paper/source` reported seventeen, of which ten were actually checking
// `paper/stages`. `since()` hands back the delta for its own block, so the number describes what
// stands next to it again.
let mark = 0;
const since = () => {
  const d = n - mark;
  mark = n;
  return d;
};

assert.deepEqual(
  Object.keys(stages.rules).sort(),
  ["author-list", "source", "stages"],
  "rule set changed",
);

/** Findings for one fixture paper, as plain message strings. */
function lint(name) {
  const file = join(FIX, name, "PIPELINE-STATUS.md");
  const msgs = linter.verify(
    readFileSync(file, "utf-8"),
    [
      {
        // `files` is required here rather than cosmetic: without it flat config falls back to the
        // JS extensions and every fixture comes back as "No matching configuration found" — a
        // message that reads exactly like a clean run.
        files: ["**/*.md"],
        plugins: { markdown, paper: stages },
        language: "markdown/gfm",
        languageOptions: { frontmatter: "yaml" },
        rules: { "paper/stages": "error" },
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

// ── silent where it must be silent ──────────────────────────────────────────────────────
check("declared and frozen correctly — silent", lint("ok").length === 0);
check(
  "nothing shipped, nothing declared — silent, a draft owes nothing",
  lint("nothing").length === 0,
);
// A withdrawn version is a deliberate RECORD of a mistake; demanding a declaration for it
// would turn that record into a finding.
check("a STALE version needs no declaration", lint("stale").length === 0);

// ── direction one: a claim owes its bytes ───────────────────────────────────────────────
const wrong = lint("wrongsize");
check("wrong byte count is reported", wrong.length === 1);
check(
  "and it names BOTH numbers, not just 'mismatch'",
  /352357/.test(wrong[0]) && /100/.test(wrong[0]),
);

const missing = lint("nofile");
check(
  "a declared stage with no file on disk is reported",
  missing.length === 1 && /not on disk/.test(missing[0]),
);

// ── direction two: bytes owe their declaration ──────────────────────────────────────────
// 🔴 The live case this rule was written for: a camera-ready pdf sat frozen for 16 days while
// the predecessor's pattern for that stage matched zero times anywhere in the file.
const undeclared = lint("undeclared");
check("a frozen version nobody declared is reported", undeclared.length === 1);
check(
  "and it names the file and the stage",
  /2026-08-29-camera-ready\.pdf/.test(undeclared[0]) &&
    /camera-ready/.test(undeclared[0]),
);

// 🔴 THE ESCAPE HATCH. Without this half the whole rule is switched off by deleting the
// frontmatter — which is the cheapest edit in the file.
const noheader = lint("noheader");
check(
  "deleting the frontmatter does NOT silence the rule when bytes exist",
  noheader.length === 1 && /ran ahead of the declaration/.test(noheader[0]),
);

// ── a LIST, not a map: the same stage twice ─────────────────────────────────────────────
// One paper in the source corpus was submitted to one venue, rejected, and resubmitted to
// another. A map keyed by stage name holds one of those; the filenames already hold both.
check(
  "the same stage declared twice with different dates is accepted",
  lint("twice").length === 0,
);

console.log(
  `✓ ${String(since())} assertions passed — paper/stages, both directions`,
);

// ── `paper/source`: the SOURCE is frozen on disk, and the bytes are compared ────────────
// 🔴 This block replaced a git-based one on 2026-09-16, and the reason is a measurement, not
// a preference. The old rule checked that a recorded `commit <sha>` RESOLVED. Two such shas
// stopped resolving inside ninety minutes of one session — squash-merge destroyed the branch
// commits, `gc` collected them — and three of the four declared stages in the live corpus had
// lost their source entirely. A sha is a pointer to a pointer; the outer one evaporates.
{
  const { mkdtempSync, writeFileSync, mkdirSync, rmSync } =
    await import("node:fs");
  const root = mkdtempSync(join(FIX, "..", ".tmp-stages-src-"));
  // 🔴 try/finally, NOT cleanup at the end of the block. Observed 09-16: under every mutation
  // the assert throws — that is, precisely when the harness is doing its job — and cleanup on
  // the happy path never runs. One run of the battery left EIGHT `.tmp-stages-src-*` directories
  // in the repository, one for each mutation deliberately killed. The litter here is not
  // cosmetic: the mutation driver refuses to run on a dirty tree, so the harness would break
  // the next run.
  try {
    const paper = join(root, "one");
    mkdirSync(join(paper, "versions"), { recursive: true });
    writeFileSync(
      join(paper, "versions", "2026-07-22-submitted.tex"),
      "x".repeat(120),
    );

    const lintIn = (body) => {
      const file = join(paper, "PIPELINE-STATUS.md");
      writeFileSync(file, body);
      const msgs = linter.verify(
        body,
        [
          {
            files: ["**/*.md"],
            plugins: { markdown, paper: stages },
            language: "markdown/gfm",
            languageOptions: { frontmatter: "yaml" },
            rules: { "paper/source": "error" },
          },
        ],
        file,
      );
      assert.deepEqual(
        msgs.filter((m) => m.fatal),
        [],
        "the rule threw",
      );
      return msgs.map((m) => m.message);
    };
    const rec = (extra) =>
      `---\nstages:\n  - stage: submitted\n    date: 2026-07-22\n    pdf: versions/x.pdf\n    bytes: 1\n${extra}---\n# S\n`;

    check(
      "a frozen source with matching bytes is accepted",
      lintIn(
        rec(
          "    source: versions/2026-07-22-submitted.tex\n    sourceBytes: 120\n",
        ),
      ).length === 0,
    );

    const wrong = lintIn(
      rec(
        "    source: versions/2026-07-22-submitted.tex\n    sourceBytes: 999\n",
      ),
    );
    check("a byte mismatch on the source is reported", wrong.length === 1);
    check(
      "and it names both numbers",
      /999/.test(wrong[0]) && /120/.test(wrong[0]),
    );

    const gone = lintIn(
      rec("    source: versions/nope.tex\n    sourceBytes: 1\n"),
    );
    check(
      "a declared source that is not on disk is reported",
      gone.length === 1 && /not on disk/.test(gone[0]),
    );

    const none = lintIn(rec(""));
    check(
      "a stage with no frozen source at all is reported",
      none.length === 1,
    );
    // 🔴 The message must say WHY a commit reference is not an acceptable substitute — otherwise
    // the next author reaches for the thing that already failed here.
    check(
      "and it says a commit reference will not do",
      /squash and gc/.test(none[0]),
    );

    // Acknowledging the loss is a RECORD, not an exemption: the rule keeps speaking, because the
    // state is still defective — merely unfixable today.
    const lost = lintIn(rec("    sourceLost: true\n"));
    check(
      "an acknowledged loss is still reported, not silenced",
      lost.length === 1 && /declared LOST/.test(lost[0]),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log(
  `✓ ${String(since())} assertions passed — paper/source, frozen bytes instead of a sha`,
);

// ── `paper/author-list`: a shipped paper owes itself a run of the author-list cross-check ────
//
// This rule's subject is DIFFERENT from its two neighbors above: those check the declaration
// against the bytes, this one checks the declaration against a record of a run. What they share
// is exactly one input, the `stages` field, and that's why the rule lives in this module.
{
  const lintAuthors = (name) => {
    const file = join(FIX, name, "PIPELINE-STATUS.md");
    const msgs = linter.verify(
      readFileSync(file, "utf-8"),
      [
        {
          files: ["**/*.md"],
          plugins: { markdown, paper: stages },
          language: "markdown/gfm",
          languageOptions: { frontmatter: "yaml" },
          rules: { "paper/author-list": "error" },
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
  };

  // ── stays silent where it must ──
  check(
    "a run is recorded in the frontmatter (`authorsVerified`) — silent",
    lintAuthors("authors-ran").length === 0,
  );
  // A draft never asked anyone to read it, so it owes nothing. This is not a carve-out: the
  // rule's subject is the DEBT of a shipped paper, and an unshipped one has no debt.
  check(
    "no stage declared at all — silent, a draft owes nothing",
    lintAuthors("nothing").length === 0,
  );
  // An empty list is not "a stage exists": the record `stages: []` shows up on a paper that was
  // set up but never submitted anywhere.
  check(
    "an empty stage list — silent",
    linter.verify(
      "---\nstages: []\n---\n# S\n",
      [
        {
          files: ["**/*.md"],
          plugins: { markdown, paper: stages },
          language: "markdown/gfm",
          languageOptions: { frontmatter: "yaml" },
          rules: { "paper/author-list": "error" },
        },
      ],
      join(FIX, "x", "PIPELINE-STATUS.md"),
    ).length === 0,
  );

  // ── fires on a planted defect ──
  const owed = lintAuthors("ok");
  check("a stage is declared, no run — a finding", owed.length === 1);
  // 🔴 The message must name the CLASS, not just the fact of a miss: otherwise the reader takes
  // it for a duplicate of the citation-existence check and closes it as noise. The class is
  // preprint authors under a declared conference, and it is invisible to a check that a
  // citation merely resolves.
  check(
    "and it names the class the cross-check catches, not just the miss",
    /PREPRINT/.test(owed[0]),
  );

  // ── the whole reason the move was made ──
  // The predecessor derived the stage with a REGEX OVER THE SCORECARD'S PROSE. Remeasured
  // 09-17: for `agenticdev-2026` the prose reads `submitted`, while the frontmatter reads
  // `submitted, camera-ready`. Here the list comes from the field, so both stages land in the
  // finding's text.
  const two = lintAuthors("twice");
  check(
    "the stage list in the message comes from the FIELD and carries all of them",
    two.length === 1 && /submitted\/submitted/.test(two[0]),
  );

  // ── the run is a RECORD in the frontmatter, not a word in the scorecard (3.0.0) ──
  check(
    "the message names paperlint's own command, with the paper",
    /npx paperlint authors \S+/.test(owed[0]),
  );
  // 🔴 The old convention no longer counts: "bib-authors" in a cell or in prose is text, not a
  // record. Only the `authorsVerified` field is.
  check(
    "`bib-authors` in the prose or a table cell is not a record of a run",
    lintAuthors("marker-in-prose").length === 1,
  );
  const badDate = linter.verify(
    "---\nstages:\n  - stage: submitted\nauthorsVerified: last week\n---\n# S\n",
    [
      {
        files: ["**/*.md"],
        plugins: { markdown, paper: stages },
        language: "markdown/gfm",
        languageOptions: { frontmatter: "yaml" },
        rules: { "paper/author-list": "error" },
      },
    ],
    join(FIX, "x", "PIPELINE-STATUS.md"),
  );
  check(
    "a value that is not a YYYY-MM-DD date is a finding of its own",
    badDate.length === 1 && /not a date/.test(badDate[0].message),
  );
}
console.log(
  `✓ ${String(since())} assertions passed — paper/author-list, the debt of a shipped paper`,
);

console.log(`✓ ${String(n)} assertions passed in total`);
