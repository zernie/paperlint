/**
 * The real article, in both halves — and the halves need different things from it.
 *
 * 🔴 WHY A SINGLE CLEAN COPY WOULD BE HALF A TEST. A fixture that only passes proves that
 * nothing fired, which is also what a dead rule looks like. The owner put it plainly on
 * 2026-09-19: "все проверки зелёные — что странно для теста, мб вариации, с ошибками вариации".
 * Correct, with one refinement measured the same evening: the clean article is NOT green, and its
 * silence is the valuable half precisely because it is the only fixture big enough for a false
 * positive to show up. On its first run it flagged eighteen p-values as missing a leading zero
 * (rpp#44). They are real findings: the rule measures against IEEE / ISO 80000-1 style, and this
 * is a blog post written for a general audience, not for an IEEE venue. All eighteen sit in prose
 * and table cells, so counting from the parsed tree rather than the raw text keeps every one —
 * and deciding that is exactly what an eleven-line stub, where every line was written by someone
 * who knew which rule would read it, cannot do.
 *
 * So:
 *   SILENCE — the recorded baseline in `baseline.json`. A rule that starts saying something NEW
 *             about 225 lines of real prose has almost certainly gained a false positive, and the
 *             assertion names the rule. Growth fails; a drop never does.
 *   FIRING  — the variations below. One planted defect each, in realistic surroundings, and the
 *             assertion demands that THAT rule move and not merely that something did.
 *
 * ⚠️ NOT stored as N copies of the article. Four variations at 225 lines each is 900 lines of
 * duplication that drifts apart the first time the prose is touched; the article is copied to a
 * temp directory and patched there, the same way the mutation batteries treat source.
 *
 * ⚠️ And not a god object, though it reads across several rules: the subject is ONE document and
 * what the rule set says about it. It breaks when the article or the baseline changes — not when
 * any of five unrelated things do.
 */
import assert from "node:assert/strict";
import { PAPERS_DIR_FIELD } from "../../lib/paper-config.mjs";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  mkdirSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareToBaseline,
  countByRule,
  recordedFindings,
} from "./baseline.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(dirname(HERE));
const BIN = join(ROOT, "bin", "rpp.mjs");

let n = 0;
const check = (label, cond) => {
  n++;
  assert.ok(cond, label);
};

/**
 * Lint a copy of the fixture, optionally patched, and return {ruleId: count}.
 * Counting by rule rather than reading the rendered text on purpose: the message wording is
 * prose and changes with every edit, the rule id is the thing being asserted about.
 */
function findings(patch) {
  const work = realpathSync(mkdtempSync(join(tmpdir(), "rpp-realpaper-")));
  try {
    mkdirSync(join(work, "papers"), { recursive: true });
    // verbatimSymlinks is not decoration: node's default rewrites a relative symlink to an
    // absolute one resolved against the SOURCE, so an "isolated" copy can write back into the
    // original. Nothing here is a symlink today; the flag keeps that from mattering later.
    cpSync(HERE, join(work, "papers", "article"), {
      recursive: true,
      verbatimSymlinks: true,
    });
    writeFileSync(
      join(work, "package.json"),
      JSON.stringify(
        {
          name: "c",
          version: "1.0.0",
          private: true,
          paperlint: { [PAPERS_DIR_FIELD]: "papers" },
        },
        null,
        2,
      ),
    );
    if (patch) patch(join(work, "papers", "article"));

    const r = spawnSync(process.execPath, [BIN, "lint", "--json"], {
      cwd: work,
      encoding: "utf8",
    });
    // Throws on output that does not parse — see baseline.mjs.
    return countByRule(r.stdout);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const edit = (dir, file, from, to) => {
  const p = join(dir, file);
  const s = readFileSync(p, "utf8");
  // The planted defect must actually land. A patch that silently misses turns a variation into a
  // second copy of the baseline, and it would pass while proving nothing.
  assert.ok(
    s.includes(from),
    `the planted edit found no anchor in ${file}: ${from.slice(0, 40)}`,
  );
  writeFileSync(p, s.replace(from, to));
};

// ── HALF ONE: the baseline, as data ────────────────────────────────────────────────────────
const base = findings(null);
const recorded = recordedFindings();
const { grew, vanished } = compareToBaseline(base, recorded);

check(
  "the article produces findings at all — a silent corpus would make every assertion vacuous",
  Object.keys(base).length > 0,
);

for (const g of grew)
  check(
    `«${g.rule}» says no MORE about the real article than recorded (${g.now} now, ${g.recorded} recorded) — ` +
      `growth on real prose is a false positive until proven otherwise; fix the rule or re-record ` +
      `with a reason in baseline.json`,
    false,
  );
check(
  `no rule that was recorded has vanished entirely without the baseline being updated — ` +
    `a rule going quiet is how a check dies unnoticed (vanished: ${vanished.join(", ") || "none"})`,
  vanished.length === 0,
);

// ── HALF TWO: variations, one planted defect each ──────────────────────────────────────────

// The question is declared AND present → the rule goes quiet. The silence half of the rule that
// replaced a regex earlier today: without this, "it never fires" and "it fires correctly" are
// indistinguishable on this fixture.
{
  const f = findings((dir) =>
    edit(
      dir,
      "PIPELINE-STATUS.md",
      "    date: 2026-07-07\n",
      '    date: 2026-07-07\nresearchQuestion: "My bill didn\'t budge."\n',
    ),
  );
  check(
    "a research question that is declared AND present in the article silences the rule",
    (f["paper/research-question"] ?? 0) === 0,
  );
}

// Declared but ABSENT → still a finding, and for the other reason. Same count as the baseline,
// so the count alone cannot tell them apart — this is why the message is asserted here and only
// here.
{
  const work = realpathSync(mkdtempSync(join(tmpdir(), "rpp-realpaper-msg-")));
  try {
    mkdirSync(join(work, "papers"), { recursive: true });
    cpSync(HERE, join(work, "papers", "article"), {
      recursive: true,
      verbatimSymlinks: true,
    });
    writeFileSync(
      join(work, "package.json"),
      JSON.stringify(
        {
          name: "c",
          version: "1.0.0",
          private: true,
          paperlint: { [PAPERS_DIR_FIELD]: "papers" },
        },
        null,
        2,
      ),
    );
    edit(
      join(work, "papers", "article"),
      "PIPELINE-STATUS.md",
      "    date: 2026-07-07\n",
      '    date: 2026-07-07\nresearchQuestion: "Does pruning the state space reduce review cost?"\n',
    );
    const r = spawnSync(process.execPath, [BIN, "lint"], {
      cwd: work,
      encoding: "utf8",
    });
    check(
      "a question declared but ABSENT from the article is reported as absent, quoting what was sought",
      /does pruning the state space reduce review cost\?/i.test(r.stdout),
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// A section sign appears in real prose → typography grows, and NOTHING ELSE does. The second half
// of that sentence is the one that matters: a rule that reacts to an unrelated edit is reacting
// to something other than what it claims.
{
  const f = findings((dir) =>
    edit(
      dir,
      "paper.md",
      "## Not all tokens cost the same",
      "## Not all tokens cost the same\n\nSee § 3 for the model.",
    ),
  );
  check(
    "a planted `§` grows paper/typography",
    (f["paper/typography"] ?? 0) > (base["paper/typography"] ?? 0),
  );
  const others = Object.keys({ ...base, ...f }).filter(
    (k) => k !== "paper/typography",
  );
  check(
    "and moves no other rule — a rule that reacts to an unrelated edit is not reading what it claims",
    others.every((k) => (f[k] ?? 0) === (base[k] ?? 0)),
  );
}

// The author-list marker is recorded → that rule goes quiet, and only that one.
{
  const f = findings((dir) =>
    edit(
      dir,
      "PIPELINE-STATUS.md",
      "| cites | — |",
      "| cites | bib-authors run 2026-07-07 |",
    ),
  );
  check(
    "recording the author-list run silences paper/author-list",
    (f["paper/author-list"] ?? 0) === 0,
  );
  check(
    "and leaves the stage findings exactly where they were",
    (f["paper/stages"] ?? 0) === (base["paper/stages"] ?? 0),
  );
}

console.log(
  `✓ ${String(n)} assertions passed — the real article: baseline of ` +
    `${Object.keys(base).length} rule(s) held, 4 variations each moved its own rule`,
);
