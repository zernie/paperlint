/**
 * round-diff.harness.mjs — plant the defect each check in `round-diff.mjs` claims to catch, assert
 * it says no with the RIGHT WORDS, and assert it stays silent on the clean case. `npx vigiles test`.
 *
 * WHAT IS UNDER TEST. `.claude/skills/paper-pipeline/scripts/round-diff.mjs`: a review round may only
 * change what its manifest declared, and the whole paper is weighed against a declared budget every
 * round. Taken from ARIS's edit whitelist plus its per-round diff gate (`wanshuiyin/
 * Auto-claude-code-research-in-sleep`, MIT, HEAD 2a23847), adapted from LaTeX+`forbidden_operations`
 * to a markdown source. The failure it is aimed at is ours and recorded: one session's panel plus
 * seven overclaim fixes deposited about a page of hedging that nobody had authorised
 * (`paper-pipeline/references/review-ratchet.md`).
 *
 * 🔴 WHY A HARNESS AT ALL. `status.mjs` flags any gate that has run and never returned a negative,
 * on the mutation-testing principle that a test which kills no mutant is not a test. On the live
 * paper this check reports one finding (`no-round-ledger` — there are no rounds on file yet), so the
 * live corpus cannot distinguish "the other twelve checks work" from "the other twelve checks are
 * dead code". Its evidence of life is here, and its evidence that THIS FILE has teeth is
 * `round-diff.mutations.mjs`.
 *
 * 🔴 ASSERTIONS RUN AT MODULE TOP LEVEL. `vigiles test` imports the file and treats "did not throw"
 * as a pass; an earlier harness in this directory exported a `tests` object, nothing ran, and the
 * runner printed ✓ over `assert.equal(1, 2)`. Straight-line code that throws.
 *
 * 🔴 ЗДЕСЬ СТОЯЛО «известные-красные откладываются через `soft()` и перебрасываются внизу, поэтому
 * одна открытая находка не пропустит проверки после себя» — И ЭТО БЫЛО НЕПРАВДОЙ (найдено
 * `no-unused-vars` 2026-08-28). `soft()` был объявлен и НЕ ВЫЗЫВАЛСЯ НИ РАЗУ: `deferred` всегда
 * пуст, блок перебрасывания внизу недостижим, и первый упавший ассерт обрывает остальные — ровно
 * то поведение, которое абзац объявлял устранённым. Механизм удалён вместе с обещанием; включать
 * его обратно значит обернуть в `soft()` сами ассерты (490 строк), а это отдельная работа, не
 * побочный эффект правки линта. Дыра названа, а не заметена.
 *
 * 🔴 EVERY ASSERTION NAMES A MESSAGE, NOT ONLY A KIND. Two vacuous assertions were found in this
 * repository in one week, and one of them was exactly this: a check was deleted, a later branch
 * produced the same finding KIND, and the test stayed green. `only()` below therefore demands the
 * exact finding set and `msg()` demands the substring that only the intended branch can produce.
 *
 * FIXTURES ARE REAL GIT REPOSITORIES in a temp dir. The gate resolves its base with
 * `git show <rev>:<path>`, so a fixture that faked that would test a different program. Nothing here
 * touches the repository this file lives in.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));

const SCRIPT = join(HERE, "round-diff.mjs");
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "round-diff-harness-")));


// ── the fixture paper ────────────────────────────────────────────────────────────────────────
//
// Small, but shaped like the real one: frontmatter, HTML-comment bookkeeping between sections, a
// numbered body, a `## References` boundary and an appendix after it. The boundary is load-bearing
// — the ratchet must not charge for words moved into an appendix.

const P = (o = {}) => `---
title: "A fixture"
---

# A fixture

## Abstract

${o.abstract ?? "We measure a thing and report **41.0%** of cases."}

## 1. Introduction

${o.s1 ?? "Repositories ban things in prose. Nobody checks whether the ban is switched on [7]."}

## 2. Method

<!-- TIGHTEN 2026-08-01 · KEEP · carries: the method -->

${o.s2 ?? "We read 134 configurations and compared each against its own rules file."}

### 2.1 The reader

${o.s21 ?? "The reader resolves the configuration the project's linter would resolve."}

## 3. Results

${o.s3 ?? "The direction holds across all four rules."}

## Limitations

${o.lim ?? "The sample is one ecosystem."}

## References

1. A. Author. *A Title.* arXiv:2101.00001, 2021.
${o.refs ?? ""}
## Appendix A. Extra

${o.appendix ?? "Detail that did not fit."}
`;

let n = 0;
/** A git repo with `paper.md` committed at HEAD, plus whatever the round wants on top. */
function fixture({ base = P(), now = null, rounds = {}, commitRounds = false } = {}) {
  const dir = join(tmp, `f${++n}`, "paper-x");
  mkdirSync(dir, { recursive: true });
  const g = (...a) => spawnSync("git", a, { cwd: dir, encoding: "utf8" });
  g("init", "-q", "-b", "main");
  g("config", "user.email", "h@example.com");
  g("config", "user.name", "harness");
  writeFileSync(join(dir, "paper.md"), base);
  g("add", "-A"); g("commit", "-qm", "base");
  const head = g("rev-parse", "HEAD").stdout.trim();

  const write = () => {
    if (Object.keys(rounds).length) {
      mkdirSync(join(dir, "rounds"), { recursive: true });
      for (const [f, body] of Object.entries(rounds)) {
        writeFileSync(join(dir, "rounds", f), body.replaceAll("__BASE__", head));
      }
    }
  };
  if (commitRounds) { write(); g("add", "-A"); g("commit", "-qm", "rounds"); }
  if (now !== null) writeFileSync(join(dir, "paper.md"), now);
  if (!commitRounds) write();
  return { dir, head };
}

/** Round manifest text. `touches` is required by the gate, so it is required here too. */
const M = ({ round = 1, touches = ["3"], allows, budget, hedge, closed, base = "__BASE__" } = {}) =>
  `---
round: ${round}
opened: 2026-08-10
base: ${base}
touches: [${touches.map((t) => `"${t}"`).join(", ")}]
${allows ? `allows: [${allows.join(", ")}]\n` : ""}${budget !== undefined ? `budget: ${budget}\n` : ""}${hedge !== undefined ? `hedge-budget: ${hedge}\n` : ""}${closed ? `closed: ${closed}\n` : ""}---

Round ${round}.
`;

function run(dir, ...args) {
  const json = spawnSync("node", [SCRIPT, dir, "--json", ...args], { encoding: "utf8" });
  const text = spawnSync("node", [SCRIPT, dir, ...args], { encoding: "utf8" });
  assert.equal(json.status, 0, `the gate must always exit 0 (advisory); it exited ${json.status}:\n${json.stderr}`);
  let findings;
  try { findings = JSON.parse(json.stdout); }
  catch { throw new Error(`--json did not produce JSON.\nstdout:\n${json.stdout}\nstderr:\n${json.stderr}`); }
  return { findings, kinds: findings.map((f) => f.kind), text: text.stdout + text.stderr };
}

/** Exactly these kinds, in any order — never `.includes`, which is how a deleted check stays green. */
const only = (r, expected, why) =>
  assert.deepEqual([...r.kinds].sort(), [...expected].sort(),
    `${why}\n  got: ${JSON.stringify(r.findings, null, 2)}`);

/** The finding of this kind must say this. A kind alone does not prove which branch produced it. */
const msg = (r, kind, needle, why) => {
  const f = r.findings.find((x) => x.kind === kind);
  assert.ok(f, `${why} — no finding of kind ${kind}. got: ${r.kinds.join(", ") || "none"}`);
  assert.ok(f.msg.includes(needle), `${why} — the ${kind} message must contain ${JSON.stringify(needle)}.\n  got: ${f.msg}`);
};

// ═══ 1. the clean case: a round that did what it said, and the gate says nothing ══════════════
//
// First and load-bearing. A check that fires on correct input is muted inside a day, which is worse
// than one that misses — and every assertion below is worthless if this one does not hold, because
// then the findings prove only that the gate is noisy.
{
  const f = fixture({
    now: P({ s3: "The direction holds across all four rules. It also holds when we drop the largest repository." }),
    rounds: { "01.md": M({ touches: ["3"], budget: 20 }) },
  });
  const r = run(f.dir);
  only(r, [], "a round that changed only its declared section, inside budget, with no new cite or number, must be silent");
  assert.match(r.text, /SILENT ABOUT/,
    "the run must always print what it cannot see. A gate that speaks only when it fires teaches the reader to hear silence as coverage — the exact failure of 2026-08-05, where four defects sat under four tools that were all silent by construction.");
  assert.match(r.text, /body \d+w \(\+\d+\)/, "the census prints the whole-document body delta on every run, findings or none");
}

// ═══ 2. no ledger at all — the live state of every paper in this repo ═════════════════════════
{
  const f = fixture({ now: P({ s3: "Changed." }) });
  const r = run(f.dir);
  only(r, ["no-round-ledger"], "a paper with no rounds/ directory must say so rather than pass");
  msg(r, "no-round-ledger", "measured against nothing",
    "the message must name what is unmeasured, not merely that a directory is absent");
  msg(r, "no-round-ledger", "body words",
    "and it must carry the current census, so the first round has a number to budget from");
}

// ═══ 3. undeclared-section: the round touched what it did not declare ════════════════════════
{
  const f = fixture({
    now: P({ s3: "The direction holds across all four rules.", lim: "The sample is one ecosystem. It is also one language." }),
    rounds: { "01.md": M({ touches: ["3"], budget: 50 }) },
  });
  const r = run(f.dir);
  only(r, ["undeclared-section"], "a change to Limitations under a manifest declaring only §3 is the whole point of the gate");
  msg(r, "undeclared-section", "Limitations", "the finding must name the section, or nobody can act on it");
  msg(r, "undeclared-section", "+5 words", "and the size of the change, so a typo fix reads differently from a paragraph");
}

// ═══ 4. a new section, and a deleted one, are both undeclared changes ════════════════════════
{
  const f = fixture({
    now: P().replace("## Limitations", "## Threats to validity\n\nNew.\n\n## Limitations"),
    rounds: { "01.md": M({ touches: ["3"], budget: 50 }) },
  });
  const r = run(f.dir);
  only(r, ["undeclared-section"], "an added section is an undeclared change");
  msg(r, "undeclared-section", "is new", "an added section must read as added, not as a word delta against nothing");
}
{
  const f = fixture({
    now: P().replace(/## Limitations\n\nThe sample is one ecosystem\.\n\n/, ""),
    rounds: { "01.md": M({ touches: ["3"], budget: 50 }) },
  });
  const r = run(f.dir);
  only(r, ["undeclared-section"], "a REMOVED section must be caught — a check that only walks the current document cannot see a deletion, which is the direction a ratchet gate is least expected to look");
  msg(r, "undeclared-section", "was removed", "and it must say so in those words");
}

// ═══ 5. the declaration's number prefixes nest ═══════════════════════════════════════════════
{
  const f = fixture({
    now: P({ s21: "The reader resolves the configuration the project's own linter would resolve." }),
    rounds: { "01.md": M({ touches: ["2"], budget: 50 }) },
  });
  only(run(f.dir), [], "`touches: 2` must cover §2.1 — otherwise every round has to enumerate leaves and nobody will");
}
{
  const f = fixture({
    now: P({ s21: "Rewritten entirely." }),
    rounds: { "01.md": M({ touches: ["3"], budget: 50 }) },
  });
  assert.ok(run(f.dir).kinds.includes("undeclared-section"),
    "`touches: 3` must NOT cover §2.1 — if prefix matching were substring-only, `3` would match any heading containing a 3 and the declaration would authorise the document");
}

// ═══ 6. ratchet: the whole body against the declared budget ══════════════════════════════════
{
  const long = "The direction holds across all four rules. " + "We add a qualifying clause here as well. ".repeat(12);
  const f = fixture({ now: P({ s3: long }), rounds: { "01.md": M({ touches: ["3"], budget: 10 }) } });
  const r = run(f.dir);
  only(r, ["ratchet"], "growth past the declared budget is the finding this gate exists for");
  msg(r, "ratchet", "against a declared budget of +10", "the finding must quote the budget it was measured against, or it is an opinion about length");
  msg(r, "ratchet", "the appendix moved 0", "and it must report where the words did NOT go, because moving text to an appendix is the sanctioned way to pay");
}
{
  const long = "The direction holds across all four rules. " + "We add a qualifying clause here as well. ".repeat(12);
  const f = fixture({ now: P({ s3: long }), rounds: { "01.md": M({ touches: ["3"], budget: 200 }) } });
  only(run(f.dir), [], "the same growth under a budget that declared it is not a finding — a budget nobody can spend is a budget nobody will write");
}

// ═══ 7. words moved into the appendix are not growth ═════════════════════════════════════════
{
  const bulk = "A sentence that will move into the appendix later on. ".repeat(10);
  const base = P({ s3: "The direction holds across all four rules. " + bulk });
  const now = P({ s3: "The direction holds across all four rules.", appendix: "Detail that did not fit. " + bulk });
  const f = fixture({ base, now, rounds: { "01.md": M({ touches: ["3", "Appendix"], budget: 0 }) } });
  const r = run(f.dir);
  only(r, [], "moving a passage into an appendix must not read as growth: paying by relocation is the rule this project wrote after paying by shaving a neighbouring sentence");
  assert.match(r.text, /appendix \d+w \(\+\d+\)/, "the appendix delta is still reported as a fact, because a paper that empties its body into an appendix should be visible even when it is legal");
}
{
  // The other half of the same rule, and the half a MOVE cannot test: text that only ever existed in
  // the appendix. A move keeps the total constant, so a checker that had no body/appendix boundary
  // at all would still pass the fixture above. This one grows the appendix and nothing else.
  const bulk = "A sentence that lives only in the appendix. ".repeat(10);
  const f = fixture({
    now: P({ appendix: "Detail that did not fit. " + bulk }),
    rounds: { "01.md": M({ touches: ["Appendix"], budget: 0 }) },
  });
  only(run(f.dir), [],
    "appendix growth under a zero body budget must be free — the page limit is a limit on the BODY, and an appendix is where this project is told to pay from");
}

// ═══ 8. 🔴 ratchet-cumulative: the finding a per-round check CANNOT produce ═══════════════════
//
// Three rounds of 20 words each. Round 1 overspent (+30) and nobody made it pay the difference back;
// rounds 2 and 3 were model citizens at +18. Today's open round is inside its budget, so `ratchet`
// — which sees only this round — has nothing to say, and the paper is 66 words heavier than the
// ledger ever authorised. This is ARIS's named case ("a small softening at round 1 + another small
// softening at round 2 can compound into a meaningful framing change") and it is the assertion that
// proves this gate is not diff-scoped.
//
// 🔴 Note the arithmetic, because the first version of this fixture was WRONG and silently proved
// nothing: with uniform steps, cumulative growth can never exceed the sum of the per-round budgets
// (n·step ≤ n·budget). A compounding overrun REQUIRES an earlier round to have overspent and never
// paid it back — which is exactly the failure the cumulative check exists for, and exactly what a
// per-round gate forgets the moment the round is closed.
{
  const grow = (k) => P({ s3: "The direction holds across all four rules. " + "Another qualifying clause. ".repeat(k) });
  const dir = join(tmp, "cumulative", "paper-x");
  mkdirSync(dir, { recursive: true });
  const g = (...a) => spawnSync("git", a, { cwd: dir, encoding: "utf8" });
  g("init", "-q", "-b", "main"); g("config", "user.email", "h@e.com"); g("config", "user.name", "h");
  const shas = [];
  for (const k of [0, 10, 16]) {
    writeFileSync(join(dir, "paper.md"), grow(k));
    g("add", "-A"); g("commit", "-qm", `r${k}`);
    shas.push(g("rev-parse", "HEAD").stdout.trim());
  }
  writeFileSync(join(dir, "paper.md"), grow(22));
  mkdirSync(join(dir, "rounds"), { recursive: true });
  for (const [i, sha] of shas.entries()) {
    writeFileSync(join(dir, "rounds", `0${i + 1}.md`),
      M({ round: i + 1, touches: ["3"], budget: 20, base: sha, closed: i < 2 ? "2026-08-1" + i : undefined }));
  }
  const r = run(dir);
  assert.ok(r.kinds.includes("ratchet-cumulative"),
    "three rounds each inside a 20-word budget compounding to +66 must be caught. This is the only finding here that ignores what the current round did, and it is the reason this gate is not a diff checker.");
  assert.ok(!r.kinds.includes("ratchet"),
    "and the per-round check must be SILENT in this fixture — round 3 spent 18 of its 20. If `ratchet` also fired, this assertion would prove nothing about scope, only that the paper is long.");
  msg(r, "ratchet-cumulative", "across 3 rounds", "the finding must name how many rounds it accumulated over");
  msg(r, "ratchet-cumulative", "of declared budget", "and the total budget, so the overspend is arithmetic rather than an impression");
  msg(r, "ratchet-cumulative", "inside its own budget",
    "and it must say plainly that every round may have been legal — otherwise it reads as a duplicate of `ratchet` and gets dismissed as one");
}

// ═══ 9. hedge mass over the whole body ═══════════════════════════════════════════════════════
{
  const hedged = "The direction may hold across all four rules, and it could arguably generalise, though it might possibly depend on the sample and perhaps somewhat on the ecosystem.";
  const f = fixture({ now: P({ s3: hedged }), rounds: { "01.md": M({ touches: ["3"], budget: 60 }) } });
  const r = run(f.dir);
  only(r, ["hedge-mass"], "hedges deposited by a review round, inside the word budget, must still be caught — that is precisely how a page of hedging arrives unnoticed");
  msg(r, "hedge-mass", "per 1000 body words", "the metric must be a DENSITY over the whole body, not a count in the diff");
  msg(r, "hedge-mass", "TIGHTEN → CUT → Threats → inline hedge", "and it must name the fix order, because the default response to this finding is to add one more caveat");
}
{
  const hedged = "The direction may hold across all four rules, and it could arguably generalise, though it might possibly depend on the sample and perhaps somewhat on the ecosystem.";
  // The budget is large because the fixture body is ~60 words, so seven hedges is a swing of ~91 per
  // 1000. On the real paper the same seven would move the density by about 0.8. The number is a
  // property of the fixture, not of the rule.
  const f = fixture({ now: P({ s3: hedged }), rounds: { "01.md": M({ touches: ["3"], budget: 60, hedge: 200 }) } });
  only(run(f.dir), [], "a round that declared its hedge budget in advance has paid for it");
}

// ═══ 10. forbidden operations: a citation that entered during a review round ══════════════════
{
  const f = fixture({
    now: P({ s3: "The direction holds across all four rules [42].", refs: "42. B. Body. *Another Title.* arXiv:2202.00002, 2022.\n" }),
    rounds: { "01.md": M({ touches: ["3", "References"], budget: 40 }) },
  });
  const r = run(f.dir);
  only(r, ["unauthorised-citation"], "a cite added mid-round is ARIS's `new_cite`, and it is the operation most likely to skip verify-citations");
  msg(r, "unauthorised-citation", "(42)", "the finding must name WHICH citation, or checking it costs a re-read of the diff");
  msg(r, "unauthorised-citation", "verify-citations", "and it must name the queue the cite skipped — nine fabricated titles with correct arXiv ids came in exactly this way");
}
{
  const f = fixture({
    now: P({ s3: "The direction holds across all four rules [42].", refs: "42. B. Body. *Another Title.* arXiv:2202.00002, 2022.\n" }),
    rounds: { "01.md": M({ touches: ["3", "References"], budget: 40, allows: ["new-citation"] }) },
  });
  only(run(f.dir), [], "a declared `new-citation` is authorised — the whitelist has to be spendable");
}
{
  // ARIS lists `new_bibitem` as a forbidden operation SEPARATE from `new_cite`, and this is why: an
  // entry can enter the bibliography with no inline marker anywhere in the prose. A check that only
  // scanned prose would pass it, and it is the harder case — nothing in the text points at it, so
  // nobody re-reads it either.
  const f = fixture({
    now: P({ refs: "42. B. Body. *Another Title.* arXiv:2202.00002, 2022.\n" }),
    rounds: { "01.md": M({ touches: ["References"], budget: 40 }) },
  });
  const r = run(f.dir);
  assert.ok(r.kinds.includes("unauthorised-citation"),
    "a bibliography entry with NO inline marker is still a citation this round added");
  msg(r, "unauthorised-citation", "(42)", "and it must be named, since the prose gives no clue it is there");
}

// ═══ 11. forbidden operations: a number that entered during a review round ════════════════════
{
  const f = fixture({
    now: P({ s3: "The direction holds across all four rules, at 73.2% of the sample." }),
    rounds: { "01.md": M({ touches: ["3"], budget: 40 }) },
  });
  const r = run(f.dir);
  only(r, ["unauthorised-number"], "ARIS's `numerical_claim`: a figure that appears during a revision round has no provenance row and no registry key");
  msg(r, "unauthorised-number", "73.2%", "the finding must print the literal, because the response is to trace it or delete it");
  msg(r, "unauthorised-number", "2026-08-05", "and it must connect to the defect class it belongs to, or it reads as pedantry about digits");
}
{
  const f = fixture({
    now: P({ s3: "The direction holds across all four rules. Recall that 41.0% is the headline." }),
    rounds: { "01.md": M({ touches: ["3"], budget: 40 }) },
  });
  only(run(f.dir), [],
    "RESTATING a number already in the paper must be free. Without this the check fires on every legitimate cross-reference, is muted in a day, and the whole gate dies with it");
}
{
  const f = fixture({
    now: P({ s3: "The direction holds across all four rules, at 73.2% of the sample." }),
    rounds: { "01.md": M({ touches: ["3"], budget: 40, allows: ["new-number"] }) },
  });
  only(run(f.dir), [], "a declared `new-number` is authorised");
}

// ═══ 12. a base that does not resolve must never read as a clean run ═════════════════════════
{
  const f = fixture({
    now: P({ s3: "Changed." }),
    rounds: { "01.md": M({ touches: ["3"], base: "0000000000000000000000000000000000000000" }) },
  });
  const r = run(f.dir);
  only(r, ["unresolvable-base"], "a round whose base does not resolve is a round with no gate");
  msg(r, "unresolvable-base", "must not read as a clean run",
    "and the message has to say that outright — an unresolvable base produces zero comparisons, which looks identical to zero problems");
}

// ═══ 13. edits with every round closed — the state that deposited a page of hedging ══════════
{
  const f = fixture({
    now: P({ s3: "Changed with nothing open." }),
    rounds: { "01.md": M({ touches: ["3"], budget: 500, hedge: 5, closed: "2026-08-10" }) },
    commitRounds: true,
  });
  const r = run(f.dir);
  assert.ok(r.kinds.includes("no-open-round"),
    "a dirty paper.md with every manifest closed means edits authorised by nothing — the literal shape of the recorded failure");
  msg(r, "no-open-round", "authorised by nothing", "and it must say so, since 'no open round' alone reads like bookkeeping");
}

// ═══ 14. two open rounds ═════════════════════════════════════════════════════════════════════
{
  const f = fixture({
    now: P({ s3: "Changed." }),
    rounds: { "01.md": M({ round: 1, touches: ["3"], budget: 99 }), "02.md": M({ round: 2, touches: ["3"], budget: 99 }) },
  });
  const r = run(f.dir);
  assert.ok(r.kinds.includes("two-open-rounds"),
    "two open manifests silently pick one base and check every budget against the wrong revision");
  msg(r, "two-open-rounds", "round 1, round 2", "and the finding must name them");
}

// ═══ 15. a manifest that declares nothing ════════════════════════════════════════════════════
{
  const f = fixture({ now: P({ s3: "Changed." }), rounds: { "01.md": "---\nround: 1\ntouches: [\"3\"]\n---\n" } });
  const r = run(f.dir);
  msg(r, "unreadable-manifest", "no `base:`", "a manifest with no base must be reported, not skipped — a malformed declaration read as absent is how a gate becomes decorative");
}
{
  const f = fixture({ now: P({ s3: "Changed." }), rounds: { "01.md": "---\nround: 1\nbase: __BASE__\n---\n" } });
  const r = run(f.dir);
  msg(r, "unreadable-manifest", "authorises nothing", "a manifest with no `touches:` list authorises nothing and must say so");
}

// ═══ 16. a declaration that covers the paper is not a declaration ════════════════════════════
{
  const f = fixture({
    now: P({ s3: "Changed." }),
    rounds: { "01.md": M({ touches: ["Abstract", "1", "2", "3", "Limitations", "References", "Appendix"], budget: 99 }) },
  });
  const r = run(f.dir);
  assert.ok(r.kinds.includes("overbroad-scope"),
    "declaring most of the document defeats the declaration, and it is the obvious way to make this gate stop complaining");
  msg(r, "overbroad-scope", "of 9 sections", "the finding must show the denominator — it is a whole-document count, not a judgement about the list's length");
}

// ═══ 17. HTML comments are bookkeeping, not prose ════════════════════════════════════════════
{
  const base = P();
  const now = base.replace("<!-- TIGHTEN 2026-08-01 · KEEP · carries: the method -->",
    "<!-- TIGHTEN 2026-08-10 · KEEP · carries: the method, restated at much greater length than before -->");
  const f = fixture({ base, now, rounds: { "01.md": M({ touches: ["3"], budget: 0 }) } });
  only(run(f.dir), [],
    "rewriting a section's own TIGHTEN note must change nothing. The real paper carries hundreds of lines of these; if they counted, every round would light the board up and the gate would be turned off within a day");
}

// ═══ 18. a permission nothing reads ══════════════════════════════════════════════════════════
{
  const f = fixture({
    now: P({ s3: "The direction holds across all four rules." }),
    rounds: { "01.md": M({ touches: ["3"], allows: ["new-theorem-env"] }) },
  });
  const r = run(f.dir);
  assert.ok(r.kinds.includes("unknown-op"),
    "an `allows:` entry this gate does not implement must be reported. ARIS carries `new_theorem_env` and we do not; a manifest copied from theirs would otherwise read as granting something");
  msg(r, "unknown-op", "not a permission", "and it must say the permission is inert, not merely unknown");
}

// ═══ 19. --since: the ad-hoc mode still weighs the whole document ═════════════════════════════
{
  const long = "The direction holds across all four rules. " + "We add a qualifying clause here as well. ".repeat(12);
  const f = fixture({ now: P({ s3: long }) });
  const r = run(f.dir, `--since=${f.head}`);
  assert.ok(r.kinds.includes("ratchet"),
    "`--since` must still measure: it is how a paper with no round ledger — every paper in this repo today — finds out what a round would have been charged");
  assert.ok(!r.kinds.includes("no-round-ledger"),
    "and it must not also complain about the missing ledger it was explicitly told to work without");
  assert.ok(!r.kinds.includes("undeclared-section"),
    "with no manifest there is no declaration to violate; reporting one would be the checker inventing a rule nobody wrote");
}

// ── report ───────────────────────────────────────────────────────────────────────────────────
rmSync(tmp, { recursive: true, force: true });
console.log("✓ round-diff.harness — 21 blocks; clean case silent, every check watched failing with its own words");
