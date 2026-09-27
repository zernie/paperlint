/**
 * pipeline-check.mjs as a command — the banner every edit to a paper reprints (where the paper
 * stands and the next move), the finding list under it, the warning for a scorecard that does not
 * parse (a misspelled current template vs the retired single-table format), and the inputs from
 * OUTSIDE the scorecard: the text's date (git or mtime), `reviews/`, and credentials in the env.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { utimesSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { runNode, useTempDir, writeTree } from "../../../test/support.mjs";
import { check, parseStatus } from "./pipeline-check.mjs";
import { scorecard } from "./fixtures/scorecard.mjs";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "pipeline-check.mjs",
);
const root = useTempDir("pipeline-check-cli-");
const TODAY = "2026-09-01";
const at = (iso) => new Date(`${iso}T12:00:00Z`);
// The temp paper sits outside any git repository, so the text's date is its mtime: pinned before
// every date in the scorecard fixture, so a gate is stale only when a case makes it so.
const TEXT_DATE = "2026-08-01";

/** A paper directory: `files` go in as written, `mtimes` pin `{ path: iso }` after writing. */
const paper = (name, card, { files = {}, mtimes = {} } = {}) => {
  const dir = join(root, name);
  writeTree(dir, {
    ...(card === null ? {} : { "PIPELINE-STATUS.md": card }),
    "paper.md": "## 1. Heading\n\nProse.\n",
    ...files,
  });
  for (const [rel, iso] of Object.entries({
    "paper.md": TEXT_DATE,
    ...mtimes,
  }))
    utimesSync(join(dir, rel), at(iso), at(iso));
  return dir;
};
const clean = (r) => ({
  ...r,
  stdout: r.stdout.replaceAll(root, "<root>"),
  stderr: r.stderr.replaceAll(root, "<root>"),
});
const NO_TOKENS = { OSF_TOKEN: "", GITHUB_TOKEN: "" };
const run = (name, args = [], env = {}) =>
  clean(
    runNode(SCRIPT, [join(root, name), `--today=${TODAY}`, ...args], {
      env: { ...NO_TOKENS, ...env },
    }),
  );
const json = (name, env) => {
  const r = run(name, ["--json"], env);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};
const card = (over = {}) => scorecard(over, TODAY);
const NEXT_CLEAN =
  "   ➡️ NEXT: no mechanical blocker — run paper-status for the measured picture (build page count, stale gates, owner-split) before deciding it is done";
const PAGE_NOTE =
  "   (page count comes from repro/build-submission.sh, never from this line)";

test("no scorecard: nothing to say, exit 0", () => {
  paper("none", null);
  assert.deepEqual(run("none"), { status: 0, stdout: "", stderr: "" });
});

test("a clean scorecard: the banner, with the deadline counted down and no finding", () => {
  paper("clean", card({ deadline: "2026-09-11" }));
  assert.deepEqual(run("clean"), {
    status: 0,
    stderr: "",
    stdout: [
      "📊 clean — 2026-09-11 (T−10d) · 0 open finding(s)",
      "   verdict row: Submit-ready — every gate green, artifact reproduces clean, nothing blocking.",
      NEXT_CLEAN,
      PAGE_NOTE,
      "",
    ].join("\n"),
  });
});

test("findings: a passed deadline counts up, a missing verdict says so, every finding is listed", () => {
  paper(
    "late",
    card({
      deadline: "2026-08-20",
      access: { status: "☐" },
      cites: { date: "2026-07-15" },
    }).replace(/^\*\*Readiness verdict:\*\*.*$/m, ""),
  );
  const stale =
    "cites (skill) last ran 2026-07-15, the text changed 2026-08-01 — this ☑ is stale, not green";
  const access =
    "access (can you physically submit?) is ☐ with -12 day(s) to the deadline — profile moderation runs up to two weeks and there is no expedite route without an institutional email";
  assert.deepEqual(run("late"), {
    status: 0,
    stderr: "",
    stdout: [
      "📊 late — 2026-08-20 (T+12d) · 2 open finding(s)",
      "   verdict row: (none)",
      `   ➡️ NEXT: ${stale}`,
      PAGE_NOTE,
      "⚠️ pipeline-check — 2 finding(s) in <root>/late/PIPELINE-STATUS.md:",
      `   [stale-continuous] ${stale}`,
      `   [submit-access] ${access}`,
      "",
    ].join("\n"),
  });
});

test("no deadline in the header: the banner says so, and open access is flagged without a count", () => {
  paper(
    "undated",
    card({ access: { status: "" } }).replace(/ · Deadline: \S+/, ""),
  );
  const r = run("undated");
  assert.equal(r.status, 0);
  assert.match(
    r.stdout,
    /^📊 undated — deadline not in the header · 1 open finding\(s\)$/m,
  );
  assert.match(
    r.stdout,
    /\[submit-access\] access \(can you physically submit\?\) is blank — turn it green in the first week, not the last$/m,
  );
});

test("open access far from the deadline is not a finding yet", () => {
  paper("early", card({ access: { status: "◐" } }));
  assert.deepEqual(json("early"), []);
});

test("open access inside the moderation window is flagged even when the box is blank", () => {
  paper("blank-near", card({ deadline: "2026-09-11", access: { status: "" } }));
  assert.deepEqual(
    json("blank-near").map((f) => f.msg),
    [
      "access (can you physically submit?) is blank with 10 day(s) to the deadline — profile moderation runs up to two weeks and there is no expedite route without an institutional email",
    ],
  );
});

test("a continuous check that is not ☑, or ☑ without a date, is not called stale here", () => {
  // The undated ☑ is `pipeline/undated-continuous`'s finding, not this checker's.
  paper(
    "not-done",
    card({ cites: { date: "" }, render: { status: "◐", date: "2020-01-01" } }),
  );
  assert.deepEqual(json("not-done"), []);
});

test("check() on its own: no sections and no directory is no finding", () => {
  assert.deepEqual(check({ sections: {}, header: "" }, {}), []);
});

test("--json prints the findings and nothing else", () => {
  paper("js", card({ render: { date: "2026-07-20" } }));
  assert.deepEqual(json("js"), [
    {
      kind: "stale-continuous",
      msg: "render (skill) last ran 2026-07-20, the text changed 2026-08-01 — this ☑ is stale, not green",
    },
  ]);
});

test("without arguments it reads the current directory and today's date", () => {
  const dir = paper("cwd", card());
  const r = clean(runNode(SCRIPT, ["--json"], { cwd: dir, env: NO_TOKENS }));
  assert.deepEqual(r, { status: 0, stdout: "[]\n", stderr: "" });
});

test("a misspelled current template: the warning names the sections and headings it did find", () => {
  paper("typo", card().replace("### LOOP", "### LOPO"));
  const r = run("typo");
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
  assert.equal(
    r.stderr,
    [
      "⚠️ <root>/typo/PIPELINE-STATUS.md: expected the four sections SETUP/LOOP/CONTINUOUS/GATES, found [SETUP, CONTINUOUS, GATES].",
      '   Parsed 4 table(s), 4 of them with an id column; headings: "PIPELINE-STATUS — harness fixture", "SETUP", "LOPO", "CONTINUOUS", "GATES".',
      "   The template is a format contract — see paper-pipeline/references/pipeline-status-template.md.",
      "   Until it parses, these checks are silent, which is the failure mode they exist to prevent.",
      "",
    ].join("\n"),
  );
});

test("the retired single-table format is named as such, not as a typo", () => {
  paper(
    "legacy",
    "Deadline: 2026-08-06\n\n| # | Gate | Status |\n|---|------|--------|\n| 1 | cites | ☑ |\n",
  );
  const r = run("legacy");
  assert.equal(r.status, 0);
  assert.match(r.stderr, /found \[none\]\.\n/);
  assert.match(
    r.stderr,
    /Parsed 1 table\(s\), 0 of them with an id column; headings: none\.\n/,
  );
  assert.match(
    r.stderr,
    /this is the pre-2026-08 single-table format \(first column `#`, a row number\)/,
  );
});

test("a scorecard with no table at all is not called legacy", () => {
  paper("prose", "# Status\n\nNothing tabulated yet.\n");
  const r = run("prose");
  assert.match(
    r.stderr,
    /Parsed 0 table\(s\), 0 of them with an id column; headings: "Status"\.\n/,
  );
  assert.doesNotMatch(r.stderr, /single-table format/);
});

test("reviews/: a worst section named twice is a repeat finding; no cold read is a finding", () => {
  paper("reviews", card(), {
    files: {
      "reviews/2026-08-10-writing.md": "WORST-SECTION: Abstract\n",
      "reviews/2026-08-12-grade-paper-writing.md":
        "  WORST-SECTION: abstract \n",
      // Unmarked: skipped rather than guessed at, so it neither makes nor breaks the repeat.
      "reviews/2026-08-14-writing.md": "no marker here\n",
      "reviews/2026-08-15-writing.txt": "WORST-SECTION: intro\n",
    },
  });
  assert.deepEqual(
    json("reviews").map((f) => f.kind),
    ["repeat-finding", "no-cold-read"],
  );
});

test("reviews/: two different worst sections are not a repeat", () => {
  paper("mixed", card(), {
    files: {
      "reviews/a-writing.md": "WORST-SECTION: abstract\n",
      "reviews/b-writing.md": "WORST-SECTION: intro\n",
      "reviews/c-coldread.md": "read\n",
    },
    mtimes: { "reviews/c-coldread.md": "2026-08-20" },
  });
  assert.deepEqual(json("mixed"), []);
});

test("reviews/ as a file, and a report path that is a directory, are unreadable — not a crash", () => {
  paper("reviews-file", card(), { files: { reviews: "not a folder\n" } });
  assert.deepEqual(
    json("reviews-file").map((f) => f.kind),
    ["no-cold-read"],
  );
  paper("reviews-dir", card(), {
    files: {
      "reviews/a-writing.md/inner.txt": "x",
      "reviews/b-writing.md": "WORST-SECTION: abstract\n",
      "reviews/c-coldread.md": "read\n",
    },
    mtimes: { "reviews/c-coldread.md": "2026-08-20" },
  });
  assert.deepEqual(json("reviews-dir"), []);
});

test("reviews/: a cold read older than the text is stale, under either spelling", () => {
  paper("stale-cr", card(), {
    files: { "reviews/2026-07-01-cold-read.md": "read\n" },
    mtimes: { "reviews/2026-07-01-cold-read.md": "2026-07-01" },
  });
  assert.deepEqual(json("stale-cr"), [
    {
      kind: "stale-cold-read",
      msg: "the cold read ran 2026-07-01, the text changed 2026-08-01 — it describes prose that no longer exists",
    },
  ]);
});

test("a credential in the env un-parks the blocker it clears — unless the row already shows it done", () => {
  paper(
    "creds",
    card({
      harden: { status: "◐", result: "github release pending" },
      panel: { status: "◐", result: "artifact hosted at osf.io/abc12" },
    }),
  );
  assert.deepEqual(json("creds", { GITHUB_TOKEN: "t", OSF_TOKEN: "t" }), [
    {
      kind: "credential-available",
      msg: "harden (repository work) is parked as open, but GITHUB_TOKEN is set in this environment — do it over the API yourself. Do not report this as waiting on the human.",
    },
  ]);
  assert.deepEqual(json("creds"), []);
});

test("the text's date ignores dot-dirs, node_modules, repro, build outputs and anything past depth 3", () => {
  const late = "2026-09-20"; // after every row date: walked, any of these would make the gates stale
  const files = {
    ".cache/paper.md": "x",
    // eslint-disable-next-line port/js-install-path -- a fixture directory the walk must skip, not an install location
    "node_modules/pkg/paper.md": "x",
    "repro/main.tex": "x",
    "build/main.tex": "x",
    "a/b/c/d/deep.tex": "x",
  };
  paper("walk", card(), {
    files,
    mtimes: Object.fromEntries(Object.keys(files).map((f) => [f, late])),
  });
  assert.deepEqual(json("walk"), []);
});

test("a paper with no source text has no date, so nothing can be stale", () => {
  const dir = paper("nosrc", card({ cites: { date: "2020-01-01" } }));
  execFileSync("rm", [join(dir, "paper.md")]);
  assert.deepEqual(json("nosrc"), []);
});

test("inside git: a committed file is dated by its commit, a dirty or ignored one by its mtime", () => {
  // The paper is its own repository and the command runs from elsewhere (this package's repo):
  // git has to be asked from where the file lives, or every paper outside the cwd's repository
  // silently falls back to mtimes.
  const dir = paper("repo", card({ cites: { date: "2026-08-20" } }), {
    files: { "sec.tex": "a", "draft.md": "b", ".gitignore": "draft.md\n" },
    mtimes: { "sec.tex": "2026-08-25", "draft.md": "2026-08-22" },
  });
  const git = (...a) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], {
      cwd: dir,
      env: {
        ...process.env,
        GIT_COMMITTER_DATE: "2026-08-02T12:00:00Z",
        GIT_AUTHOR_DATE: "2026-08-02T12:00:00Z",
      },
      stdio: "ignore",
    });
  git("init", "-q");
  git("add", "paper.md", ".gitignore", "PIPELINE-STATUS.md");
  git("commit", "-qm", "init");
  // A checkout rewrites mtimes; the commit date is what the text's date is.
  utimesSync(join(dir, "paper.md"), at("2026-09-20"), at("2026-09-20"));
  const stale = (changed) => [
    `cites (skill) last ran 2026-08-20, the text changed ${changed} — this ☑ is stale, not green`,
  ];
  // sec.tex is untracked, i.e. dirty: its mtime (08-25) is the newest date.
  assert.deepEqual(
    json("repo").map((f) => f.msg),
    stale("2026-08-25"),
  );
  execFileSync("rm", [join(dir, "sec.tex")]);
  // paper.md by its commit (08-02, not its 09-20 mtime); draft.md is ignored — no status, no
  // log — so by its mtime (08-22), which is now the newest.
  assert.deepEqual(
    json("repo").map((f) => f.msg),
    stale("2026-08-22"),
  );
});

test("parseStatus: a heading with no Latin word is no section; a short or id-less row is skipped", () => {
  const parsed = parseStatus(
    [
      "## Итоги",
      "| id | Work | Skill | Status |",
      "|----|------|-------|--------|",
      "| x | only | three |",
      "| ** | a | b | ☑ |",
      "",
      "## SETUP",
      "| id | Work | Skill | Status |",
      "|----|------|-------|--------|",
      "| idea | w | s | nothing recognisable |",
    ].join("\n"),
  );
  assert.deepEqual(parsed.sections, {
    SETUP: [
      {
        id: "idea",
        name: "w",
        skill: "s",
        status: "",
        date: null,
        raw: "idea | w | s | nothing recognisable",
        section: "SETUP",
        heading: "SETUP",
      },
    ],
  });
  assert.deepEqual(parsed.shape, {
    tables: 2,
    scorecardTables: 2,
    headings: ["Итоги", "SETUP"],
  });
});
