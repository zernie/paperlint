/**
 * Colocated test for `eslint-rules/tex-build.mjs` (`tex/future-promise`).
 * Run: `npx vigiles test eslint-rules/tex-build.harness.mjs`
 *
 * FIVE PARTS, AND THE ORDER IS LOAD-BEARING:
 *   I.   FIXTURES ON DISK — `fixtures/tex-build/clean.tex` must be silent, `defect.tex` must
 *        fire, and both are checked through the real `eslint.config.mjs`, not through a
 *        config invented here. A frozen finding set, positions and captured text included.
 *   II.  QUIET ON A CORRECT INPUT, and EACH reason for the silence is checked separately.
 *        It comes before "fires on a planted defect" deliberately: a rule that fails a correct
 *        input is more dangerous than no rule at all — it gets switched off the same day.
 *   III. FIRES ON A PLANTED DEFECT — on the very one the check was added for on 2026-08-24,
 *        plus one input per branch of the promise vocabulary.
 *   IV.  PROPERTIES NOBODY "SEES", WITHOUT WHICH THE RULE LIES.
 *   V.   CONFIG: the rule is declared on `.tex`, its severity is the measured one, and the
 *        glob it is declared on is NOT EMPTY.
 *   VI.  THE SECOND RULE OF THIS MODULE — `tex/acm-frontmatter-override` — with the same five
 *        parts in the same order, kept in one self-contained block rather than interleaved.
 *        The two rules share a file and share nothing else: one reads the PROSE of a shipped
 *        build, the other reads the PREAMBLE of any acmart build, and a test that mixed them
 *        would make each rule's silence depend on the other's input.
 *
 * 🔴 ZERO ON A CLEAN FIXTURE IS NOT "CHECKED". Part I on its own cannot tell a clean input
 * from a dead rule: for an advisory check, silence IS its success state. Part III is what
 * distinguishes them — the planted defect. Both halves are mandatory, and separately neither
 * proves anything.
 *
 * ── PARITY WITH THE PREVIOUS IMPLEMENTATION (measured 2026-09-07, BEFORE its removal) ──
 * There is deliberately NO copy of the old script's `checkFuturePromises` here: vendoring it
 * for the sake of a test would re-create the second source of truth the move was meant to
 * remove. What lives here instead is the RESULT of the comparison, taken by a differential run
 * over 15 inputs (10 real `.tex` files of the source corpus + 5 synthetic mutations on top of
 * a real paper):
 *   the finding sets agreed on ALL FIFTEEN, positions and captured text included
 *   (`284:will be released`, `284:Upon acceptance` + `285:will be made publicly available`).
 *
 * 🔴 AND ONE DISAGREEMENT, WHICH IS NOT IN THE LOGIC BUT IN THE INPUT — and it is the whole
 * gain. The old implementation picked its file by looking for `paper.md` / `draft.md` and
 * otherwise taking the FIRST `.tex` in `readdirSync` order. Measured 2026-09-07:
 *   paper A → a 536-BYTE file of nine `\def`s with venue numbers. The check, added
 *             specifically BECAUSE of paper A, was not reading paper A;
 *   paper B → a four-month-old draft, one of seven `.tex` files in that directory;
 *   paper C → `paper.tex`, the only `.tex` there; it matched.
 * The finding sets agreed anyway (all empty), but they agreed BY ACCIDENT, not by
 * construction. A config glob removes the dependency of the address on directory order.
 *
 * ⚠️ WHAT WAS LOST WHEN THIS TEST LEFT THE PRIVATE CORPUS BEHIND, stated rather than glossed:
 * part I used to freeze the finding set of three REAL papers, and one assertion used a real
 * paper as a LIVE SUBJECT for the commented-out-`review` case. Fixtures cannot reproduce "this
 * is what the corpus actually looks like today"; they reproduce the mechanism only. The
 * measurements from those runs are kept in the comments, the papers are not.
 *
 * 🔴 Assertions live at MODULE TOP LEVEL: `vigiles test` imports the file and treats "it did
 * not throw" as success; an exported `tests` object is run by nothing.
 */
import { ESLint } from "eslint";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, ".."); // eslint-rules → repository root
const RULES = join(HERE, "tex-build.mjs");
assert.ok(existsSync(RULES), `no entry point for the test: ${RULES}`);

const TMP = realpathSync(mkdtempSync(join(tmpdir(), "tex-build-")));
// Cleanup is registered IMMEDIATELY, not at the end of the file: assertions throw, and an
// `rmSync` at the bottom never runs in exactly the runs that are red.
process.on("exit", () => rmSync(TMP, { recursive: true, force: true }));

const { texLanguage } = await import(join(HERE, "latex-language.mjs"));
const texBuild = (await import(RULES)).default;

// A new rule with no declared severity must not slip through unnoticed.
assert.deepEqual(
  Object.keys(texBuild).sort(),
  ["acm-frontmatter-override", "future-promise"],
  "the module's rule set changed — update the config and this harness",
);

const makeEslint = (cwd) =>
  new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.tex"],
        plugins: {
          tex: { languages: { latex: texLanguage }, rules: texBuild },
        },
        language: "tex/latex",
        rules: { "tex/future-promise": "warn" },
      },
    ],
  });

/** Findings for one file as `{line, column, text}` — and not one of them fatal. */
async function lintTex(eslint, file) {
  const [res] = await eslint.lintFiles([file]);
  assert.deepEqual(
    res.messages.filter((m) => m.fatal || !m.ruleId),
    [],
    `${file}: the language failed to parse or the rule threw — that is a linter crash, not a finding`,
  );
  return res.messages.map((m) => ({
    rule: m.ruleId,
    line: m.line,
    column: m.column,
    // The captured promise, taken out of the message itself. What matters is WHAT was caught,
    // not only how much: a rule catching the wrong substring yields the same count.
    text: /«([^»]+)»/.exec(m.message)?.[1] ?? null,
  }));
}

let fixtureN = 0;
/** Writes a `.tex` into a temp directory and returns the findings. */
async function findings(name, text) {
  const dir = join(TMP, `f${fixtureN++}-${name.replace(/[^a-z0-9-]/gi, "_")}`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "paper.tex");
  writeFileSync(file, text);
  return lintTex(makeEslint(TMP), file);
}

/** A minimal build: NOT review mode, with somewhere to put prose. */
const build = (
  body,
  { cls = "\\documentclass[sigconf,screen]{acmart}" } = {},
) =>
  [
    cls,
    "\\begin{document}",
    "\\begin{abstract}",
    body,
    "\\end{abstract}",
    "\\end{document}",
    "",
  ].join("\n");

// ═════════════════════════════════════════════════════════════════════════════
// I. FIXTURES ON DISK, THROUGH THE REPOSITORY'S OWN CONFIG
// ═════════════════════════════════════════════════════════════════════════════
// 🔴 Deliberately NOT `makeEslint` here. Everywhere else in this file the config is built
// in-process, which tests the rule and says nothing about whether the rule is WIRED UP. These
// two runs go through `eslint.config.mjs` as it sits on disk, so a rule that is correct and
// unreferenced fails here.
const CLEAN_FIXTURE = join(ROOT, "fixtures/tex-build/clean.tex");
const DEFECT_FIXTURE = join(ROOT, "fixtures/tex-build/defect.tex");
const real = new ESLint({ cwd: ROOT });

for (const f of [CLEAN_FIXTURE, DEFECT_FIXTURE])
  assert.ok(existsSync(f), `missing fixture: ${f}`);

assert.deepEqual(
  await lintTex(real, CLEAN_FIXTURE),
  [],
  "fixtures/tex-build/clean.tex produced findings — a check that fails a correct input gets " +
    "switched off the same day",
);

// 🔴 AND THE REASON FOR THAT ZERO IS CHECKED SEPARATELY. "Zero because the build is clean" and
// "zero because the build is exempt as review mode" are indistinguishable from the outside; the
// only thing telling them apart is that the exemption sign is genuinely absent from the file.
// Without this assertion, someone editing the fixture into a review build would turn the quiet
// half into a tautology and nothing would notice.
assert.doesNotMatch(
  readFileSync(CLEAN_FIXTURE, "utf8"),
  /^[^%\n]*(?:\\documentclass\[[^\]]*\breview\b|printacmref=false)/m,
  "fixtures/tex-build/clean.tex became a review build — its zero stopped meaning `the rule ran " +
    "and found nothing` and started meaning `the rule was exempt`",
);

// The frozen finding set of the defect fixture: not "some findings", but exactly these two,
// at these addresses, with these captured substrings.
assert.deepEqual(
  await lintTex(real, DEFECT_FIXTURE),
  [
    {
      rule: "tex/future-promise",
      line: 15,
      column: 59,
      text: "at camera-ready",
    },
    {
      rule: "tex/future-promise",
      line: 22,
      column: 52,
      text: "will be made publicly available",
    },
  ],
  "fixtures/tex-build/defect.tex: the finding set drifted from the frozen measurement",
);

// ═════════════════════════════════════════════════════════════════════════════
// II. QUIET ON A CORRECT INPUT — each reason for the silence on its own
// ═════════════════════════════════════════════════════════════════════════════
assert.deepEqual(
  await findings("clean-build", build("We measured how often a rule fails.")),
  [],
  "a build with no promises must be silent",
);

// A promise made DURING PEER REVIEW is true and ordinary. This is not leniency, it is the
// subject: the defect is only a promise that outlived its own delivery.
for (const [label, cls] of [
  ["review option", "\\documentclass[sigconf,review]{acmart}"],
  [
    "printacmref=false",
    "\\documentclass[sigconf]{acmart}\n\\settopmatter{printacmref=false}",
  ],
])
  assert.deepEqual(
    await findings(
      `review-${label}`,
      build("The harness ships at camera-ready.", { cls }),
    ),
    [],
    `${label}: a review build must be exempt`,
  );

// 🔴 A LaTeX COMMENT IS A LEGITIMATE PLACE FOR THESE WORDS. Author notes of the form
// `% camera-ready blocker` live in real sources, and a finding on them would be exactly the
// false positive that kills a check.
assert.deepEqual(
  await findings(
    "promise-in-comment",
    build("% blocker: the harness ships at camera-ready."),
  ),
  [],
  "a promise inside a LaTeX comment is not a finding",
);

// ═════════════════════════════════════════════════════════════════════════════
// III. FIRES ON A PLANTED DEFECT
// ═════════════════════════════════════════════════════════════════════════════
{
  // THE defect: the line printed in an accepted camera-ready on 2026-08-24 in both of the most
  // read positions, while the Availability paragraph three lines below said the opposite.
  const ms = await findings(
    "the-2026-08-24-defect",
    build("We report the finding (full harness at camera-ready)."),
  );
  assert.equal(ms.length, 1, "the historical defect must be caught");
  assert.equal(ms[0].rule, "tex/future-promise");
  assert.equal(ms[0].text, "at camera-ready", "the wrong substring was caught");
  // The address is what the move to a lint rule bought, so it is checked rather than declared:
  // line 4 of the fixture, and a column at the start of the match, not at the start of the line.
  assert.equal(
    ms[0].line,
    4,
    "the finding must point at the line carrying the promise",
  );
  assert.equal(
    ms[0].column,
    "We report the finding (full harness ".length + 1,
    "the column must point at the start of the match",
  );
}

// Every branch of the promise vocabulary gets its own input. Without that, "a vocabulary of six
// forms" is a claim verified by one of the six.
for (const [sentence, want] of [
  ["The harness ships at camera-ready.", "at camera-ready"],
  ["The harness ships at the camera ready stage.", "at the camera ready"],
  ["Upon acceptance we open the repository.", "Upon acceptance"],
  ["On acceptance we open the repository.", "On acceptance"],
  ["The harness will be released later.", "will be released"],
  ["The harness will be published later.", "will be published"],
  [
    "The data will be made publicly available.",
    "will be made publicly available",
  ],
  ["The data will be made available.", "will be made available"],
  ["The harness will be public.", "will be public"],
  ["The harness will be open-sourced.", "will be open-sourced"],
]) {
  const ms = await findings(`vocab-${want}`, build(sentence));
  assert.equal(
    ms.length,
    1,
    `vocabulary branch «${want}» did not fire on «${sentence}»`,
  );
  assert.equal(
    ms[0].text,
    want,
    `vocabulary branch «${want}» caught the wrong substring`,
  );
}

// Two promises on different lines do not collapse into one (the rule reports EVERY place).
{
  const ms = await findings(
    "two-lines",
    build(
      "Upon acceptance we ship.\nThe data will be made publicly available.",
    ),
  );
  assert.deepEqual(
    ms.map((m) => `${m.line}:${m.text}`),
    ["4:Upon acceptance", "5:will be made publicly available"],
    "two promises on different lines must give two findings with their own addresses",
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// IV. PROPERTIES NOBODY "SEES", WITHOUT WHICH THE RULE LIES
// ═════════════════════════════════════════════════════════════════════════════
// 🔴 A COMMENTED-OUT `\documentclass[…review…]` DOES NOT MAKE A BUILD A REVIEW BUILD. In the
// source corpus this was a live property, not an invented case: one paper carried
// `%   was: \documentclass[sigconf,review]{acmart}` a few lines above its real
// `\documentclass[sigconf,screen]{acmart}`. Without the `^[^%\n]*` anchor in `REVIEW_MODE_RE`
// that whole paper would have been silently exempted by the history of its own edits.
// ⚠️ The live half of this assertion (reading the real paper) did not come along with the
// extraction — the paper is private. What is left is the synthetic half, which pins the
// mechanism but no longer proves the case still occurs in the wild.
{
  const ms = await findings(
    "commented-out-review-class",
    build("The harness ships at camera-ready.", {
      cls: "%   was: \\documentclass[sigconf,review]{acmart}\n\\documentclass[sigconf,screen]{acmart}",
    }),
  );
  assert.equal(
    ms.length,
    1,
    "a commented-out review class exempted the build — the `^[^%\\n]*` anchor was lost",
  );
}

// An escaped `\%` is NOT a comment: a line where a percent sign precedes a promise must still
// be checked in full.
{
  const ms = await findings(
    "escaped-percent",
    build("We cover 95\\% of cases and the harness will be published later."),
  );
  assert.equal(
    ms.length,
    1,
    "`\\%` ate the rest of the line — the promise behind it went invisible",
  );
  assert.equal(ms[0].text, "will be published");
}

// No file on disk (a run through stdin): the rule stays quiet rather than judging content it
// never saw.
{
  const [res] = await makeEslint(TMP).lintText(
    build("The harness ships at camera-ready."),
    { filePath: join(TMP, "no-such-dir", "paper.tex") },
  );
  assert.deepEqual(
    res.messages.filter((m) => m.fatal),
    [],
    "the rule threw on a non-existent path",
  );
  assert.deepEqual(
    res.messages.map((m) => m.ruleId),
    [],
    "the rule reads the file FROM DISK (the preamble is blanked in the projection), and on a " +
      "path with no file it must stay quiet rather than judge",
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// V. CONFIG — the rule is on, at the measured severity, over a NON-EMPTY glob
// ═════════════════════════════════════════════════════════════════════════════
{
  const config = (await import(join(ROOT, "eslint.config.mjs"))).default;
  const tex = config.find((b) => b.rules?.["tex/future-promise"]);
  assert.ok(
    tex,
    "eslint.config.mjs declares no block carrying `tex/future-promise`",
  );
  assert.equal(
    tex.rules["tex/future-promise"],
    "warn",
    "the severity of `tex/future-promise` changed. `warn` is an analysis, not caution: the " +
      "finding is not binary (a promise in a camera-ready is sometimes honest, and the verdict " +
      "«does it contradict Availability» is a human one), plus there is a demonstrable class of " +
      "false positives — a sentence about SOMEONE ELSE's work («their replication will be " +
      "published in 2027»)",
  );
  assert.ok(
    tex.plugins?.tex?.rules === texBuild,
    "the `.tex` block no longer wires up `tex-build.mjs` — the rule stopped executing",
  );

  // 🔴 AND THE HALF WITHOUT WHICH ALL OF THE ABOVE IS DECORATION: the glob must match files
  // that exist. A rule whose glob matches nothing is never invoked, and the run is green with
  // zero findings — byte-identical to a rule that passed. See `scripts/rules-see-files.mjs`,
  // which checks this for every declared rule; the assertion here is the cheap local copy so
  // that this rule's own wiring fails in this rule's own test.
  const seen = (await real.lintFiles(["."])).map((r) =>
    relative(ROOT, r.filePath),
  );
  const texSeen = seen.filter((f) => f.endsWith(".tex"));
  assert.ok(
    texSeen.length > 0,
    "the `.tex` glob of eslint.config.mjs matched NO files on disk — the rule was never " +
      "invoked, and this run's zero findings mean nothing. Files linted: " +
      seen.join(", "),
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// VI. tex/acm-frontmatter-override — the module's second rule, tested end to end
// ═════════════════════════════════════════════════════════════════════════════
// 🔴 ITS OWN ESLint FACTORY, with ONLY this rule enabled. Sharing `makeEslint` would make the
// two rules' findings land in one array, and then "quiet" for one of them would depend on the
// other's input — the class of tautology part I already guards against on the fixtures.
const makeEslintFm = (cwd) =>
  new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.tex"],
        plugins: {
          tex: { languages: { latex: texLanguage }, rules: texBuild },
        },
        language: "tex/latex",
        rules: { "tex/acm-frontmatter-override": "warn" },
      },
    ],
  });

let fmN = 0;
async function fmFindings(name, text) {
  const dir = join(TMP, `fm${fmN++}-${name.replace(/[^a-z0-9-]/gi, "_")}`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "paper.tex");
  writeFileSync(file, text);
  return lintTex(makeEslintFm(TMP), file);
}

/** A minimal acmart preamble plus a body, so the language has something to parse. */
const acm = (
  preambleTail,
  { cls = "\\documentclass[sigconf,screen]{acmart}" } = {},
) =>
  [
    cls,
    preambleTail,
    "\\begin{document}",
    "\\begin{abstract}",
    "We measured one thing and report it plainly.",
    "\\end{abstract}",
    "\\end{document}",
    "",
  ].join("\n");

// ── VI.I FIXTURES ON DISK, THROUGH THE REPOSITORY'S OWN CONFIG ───────────────
const FM_CLEAN = join(ROOT, "fixtures/tex-build/frontmatter-clean.tex");
const FM_DEFECT = join(ROOT, "fixtures/tex-build/frontmatter-defect.tex");
for (const f of [FM_CLEAN, FM_DEFECT])
  assert.ok(existsSync(f), `missing fixture: ${f}`);

assert.deepEqual(
  await lintTex(real, FM_CLEAN),
  [],
  "fixtures/tex-build/frontmatter-clean.tex produced findings — a check that fails a correct " +
    "input gets switched off the same day",
);

// 🔴 AND THE REASONS FOR THAT ZERO, EACH CHECKED SEPARATELY. Three different edits to the
// fixture would turn its silence into a tautology, and from the outside all three look the
// same as "the rule ran and the build is clean":
//   (a) it stops being an acmart build → the rule returns before looking at anything;
//   (b) it acquires `nonacm` → the rule is exempt;
//   (c) the commented override block disappears → the comment-blanking half of the rule stops
//       being exercised at all, and that half is the one that protects the accepted sibling
//       paper of the source corpus, which keeps exactly such a block as a record.
{
  const src = readFileSync(FM_CLEAN, "utf8");
  assert.match(
    src,
    /^\\documentclass(?:\s*\[[^\]]*\])?\s*\{acmart\}/m,
    "(a) fixtures/tex-build/frontmatter-clean.tex stopped being an acmart build — its zero now " +
      "means «the rule returned early», not «the rule ran and found nothing»",
  );
  assert.doesNotMatch(
    src,
    /^\\documentclass\s*\[[^\]]*\bnonacm\b/m,
    "(b) fixtures/tex-build/frontmatter-clean.tex became a `nonacm` build — its zero now means " +
      "«exempt», not «clean»",
  );
  assert.match(
    src,
    /^%.*\\setcopyright\{none\}/m,
    "(c) fixtures/tex-build/frontmatter-clean.tex lost its COMMENTED override block. That block " +
      "is the fixture's point: it proves a finding is not raised on an author's record of what " +
      "the preamble used to do. Without it the quiet half no longer exercises comment blanking",
  );
}

// The frozen finding set of the defect fixture: not "some findings", but exactly these three,
// at these addresses, with these captured macros.
assert.deepEqual(
  await lintTex(real, FM_DEFECT),
  [
    {
      rule: "tex/acm-frontmatter-override",
      line: 10,
      column: 1,
      text: "\\setcopyright{none}",
    },
    {
      rule: "tex/acm-frontmatter-override",
      line: 11,
      column: 1,
      text: "\\renewcommand\\footnotetextcopyrightpermission",
    },
    {
      rule: "tex/acm-frontmatter-override",
      line: 12,
      column: 1,
      text: "\\pagestyle{plain}",
    },
  ],
  "fixtures/tex-build/frontmatter-defect.tex: the finding set drifted from the frozen measurement",
);

// ── VI.II QUIET ON A CORRECT INPUT — each reason for the silence on its own ──
assert.deepEqual(
  await fmFindings("plain-acmart", acm("\\setcopyright{cc}")),
  [],
  "an acmart build that leaves the front matter alone must be silent",
);

// OUTSIDE acmart every one of these macros is an ordinary, correct line. `\pagestyle{plain}`
// in an `article` is not a defect in any sense, and a rule that said so would be switched off
// by the first person who writes a non-ACM document.
for (const cls of [
  "\\documentclass{article}",
  "\\documentclass[11pt]{report}",
  "\\documentclass[conference]{IEEEtran}",
])
  assert.deepEqual(
    await fmFindings(
      `non-acmart-${cls.slice(-12)}`,
      acm("\\pagestyle{plain}", { cls }),
    ),
    [],
    `${cls}: the macros only mean something inside acmart — outside it the rule must not fire`,
  );

// `nonacm` is acmart's OWN way of saying "this is not going to an ACM venue", and in that mode
// the class disables the ACM Reference Format itself (acmart.cls:110-121). A build that says
// so the supported way is exempt — otherwise the rule would punish the very escape hatch its
// own message recommends.
for (const cls of [
  "\\documentclass[sigconf,nonacm]{acmart}",
  "\\documentclass[nonacm,screen]{acmart}",
])
  assert.deepEqual(
    await fmFindings(
      `nonacm-${cls.length}`,
      acm("\\setcopyright{none}\n\\pagestyle{plain}", { cls }),
    ),
    [],
    `${cls}: a declared non-ACM build must be exempt`,
  );

// A LaTeX COMMENT IS A LEGITIMATE PLACE FOR THESE MACROS — and not a hypothetical one: the
// accepted paper of the source corpus keeps the whole block commented out as a record of what
// it used to do. Measured 2026-09-11 on the real files: the rejected paper yields three
// findings (181,182,183), the accepted one yields ZERO with the same three macros present as
// comments.
assert.deepEqual(
  await fmFindings(
    "override-in-comment",
    acm("% was: \\setcopyright{none} + \\pagestyle{plain}\n\\setcopyright{cc}"),
  ),
  [],
  "a commented-out override must not fire — an author's record of a removed line is not the line",
);

// 🔴 AND THE SAME FOR THE ARMING SIDE, which is the half a simpler implementation gets wrong:
// a `\documentclass` quoted inside a comment must not turn a non-acmart file into an acmart
// one. Here the REAL class is `article`, and only the comment says `acmart`.
assert.deepEqual(
  await fmFindings(
    "acmart-only-in-comment",
    acm("% was: \\documentclass[sigconf]{acmart}\n\\pagestyle{plain}", {
      cls: "\\documentclass{article}",
    }),
  ),
  [],
  "a `\\documentclass{acmart}` quoted in a comment must not arm the rule on a non-acmart build",
);

// ── VI.III FIRES ON A PLANTED DEFECT — one input per member of the set ───────
for (const [line, want] of [
  ["\\setcopyright{none}", "\\setcopyright{none}"],
  ["\\setcopyright{ none }", "\\setcopyright{ none }"],
  [
    "\\renewcommand\\footnotetextcopyrightpermission[1]{}",
    "\\renewcommand\\footnotetextcopyrightpermission",
  ],
  [
    "\\renewcommand{\\footnotetextcopyrightpermission}[1]{}",
    "\\renewcommand{\\footnotetextcopyrightpermission",
  ],
  ["\\pagestyle{plain}", "\\pagestyle{plain}"],
  ["\\pagestyle{empty}", "\\pagestyle{empty}"],
  ["\\thispagestyle{empty}", "\\thispagestyle{empty}"],
]) {
  const got = await fmFindings(`fire-${want.slice(1, 20)}`, acm(line));
  assert.deepEqual(
    got.map((f) => f.text),
    [want],
    `«${line}» must produce exactly one finding capturing «${want}» — got ${JSON.stringify(got)}`,
  );
}

// The stage does NOT exempt, and this is the assertion that pins the measurement the rule's
// comment rests on. The obvious design — "only flag these in review mode, the class handles
// it" — is wrong in BOTH directions, so both directions are frozen here: a review build fires,
// and so does a camera-ready one. `acmart.cls:93-99`: the `review` option turns on line
// numbers and `\@ACM@printfoliostrue`, and touches neither the copyright statement nor the
// permission footnote.
for (const cls of [
  "\\documentclass[sigconf,review,anonymous]{acmart}",
  "\\documentclass[sigconf,screen]{acmart}",
  "\\documentclass[manuscript]{acmart}",
])
  assert.deepEqual(
    (
      await fmFindings(
        `stage-${cls.length}`,
        acm("\\setcopyright{none}", { cls }),
      )
    ).map((f) => f.text),
    ["\\setcopyright{none}"],
    `${cls}: the finding must not depend on the build stage — the overrides strip the same ` +
      "furniture in every mode, and in a camera-ready that is worse, because that is the " +
      "version the digital library keeps",
  );

// ── VI.IV PROPERTIES NOBODY "SEES", WITHOUT WHICH THE RULE LIES ─────────────
// 🔴 THE MODULE-LEVEL REGEXES ARE `/g`, SO THEY CARRY `lastIndex`. Without the reset in the
// rule, the SECOND file linted in the same process starts searching from wherever the previous
// file's match ended — i.e. findings would depend on the ORDER files were linted in, which is
// the exact class of defect that made the previous implementation read the wrong `.tex`. Two
// runs of the same input through the same process must agree.
{
  const once = (
    await fmFindings("lastindex-a", acm("\\setcopyright{none}"))
  ).map((f) => f.text);
  const twice = (
    await fmFindings("lastindex-b", acm("\\setcopyright{none}"))
  ).map((f) => f.text);
  assert.deepEqual(
    [once, twice],
    [["\\setcopyright{none}"], ["\\setcopyright{none}"]],
    "the second lint in the same process disagreed with the first — a `/g` regex kept its " +
      "`lastIndex` across files, and findings became order-dependent",
  );
}

// TWO OVERRIDES ON ONE LINE are two findings, at two columns. A rule reporting once per line
// would silently under-count a compacted preamble.
{
  const got = await fmFindings(
    "two-on-one-line",
    acm("\\setcopyright{none}\\pagestyle{plain}"),
  );
  assert.deepEqual(
    got.map((f) => [f.line, f.column, f.text]),
    [
      [2, 1, "\\setcopyright{none}"],
      [2, 20, "\\pagestyle{plain}"],
    ],
    "two overrides on one line must produce two findings at two columns",
  );
}

// 🔴 AND TWO MATCHES OF THE **SAME** PATTERN ON ONE LINE, which the case above cannot reach:
// there each finding comes from a different entry of the table, so a rule that took only the
// FIRST match per pattern would still produce two. `\pagestyle` and `\thispagestyle` are one
// regex, so this is the only input that distinguishes `while (re.exec(...))` from `if`.
{
  const got = await fmFindings(
    "same-pattern-twice",
    acm("\\pagestyle{plain}\\thispagestyle{empty}"),
  );
  assert.deepEqual(
    got.map((f) => [f.column, f.text]),
    [
      [1, "\\pagestyle{plain}"],
      [18, "\\thispagestyle{empty}"],
    ],
    "two matches of the SAME pattern on one line must both be reported — the rule stopped at " +
      "the first match per pattern",
  );
}

// A FILE THE RULE CANNOT READ MUST BE SILENT, NOT THROWN. The rule reads from disk because the
// language's projection blanks the preamble; the price is that a run with no real file behind
// it (stdin, a deleted path) has nothing to judge, and judging nothing must not crash the lint.
{
  const dir = join(TMP, "unreadable");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "paper.tex");
  writeFileSync(file, acm("\\setcopyright{none}"));
  const eslint = makeEslintFm(TMP);
  const before = (await lintTex(eslint, file)).length;
  assert.equal(
    before,
    1,
    "setup failed: the file should fire before it is removed",
  );
  rmSync(file);
  const [res] = await eslint.lintText(acm("\\setcopyright{none}"), {
    filePath: file,
  });
  assert.deepEqual(
    res.messages.filter((m) => m.fatal),
    [],
    "a file that cannot be read made the rule throw — an unreadable path must be silent, not fatal",
  );
}

// ── VI.V CONFIG — the rule is on, at the measured severity ───────────────────
{
  const config = (await import(join(ROOT, "eslint.config.mjs"))).default;
  const tex = config.find((b) => b.rules?.["tex/acm-frontmatter-override"]);
  assert.ok(
    tex,
    "eslint.config.mjs declares no block carrying `tex/acm-frontmatter-override` — the rule is " +
      "correct and unreferenced, which lints exactly like a rule that passed",
  );
  assert.equal(
    tex.rules["tex/acm-frontmatter-override"],
    "warn",
    "the severity of `tex/acm-frontmatter-override` changed IN THIS REPOSITORY. `warn` here is " +
      "not a statement about confidence — the finding is binary and has a named exemption. It " +
      "is a statement about the corpus: this repository lints fixtures that are broken by " +
      "construction, so `error` would only mean `npx eslint .` exits non-zero on a healthy " +
      "checkout. A consumer linting a real paper sets `error`",
  );
}
