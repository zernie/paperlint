// ledger.mjs — the pipeline's memory. One append-only file, and everything else is derived.
//
// WHY THIS EXISTS. Until 2026-08-07 the pipeline's state lived in a hand-maintained markdown
// table (`PIPELINE-STATUS.md`) whose rows a human ticked. It lied constantly and in one
// direction: a gate marked ☑ had been run against text that was later rewritten, and nothing
// noticed. On the day paper #3 shipped, the author found defects that every green gate had
// passed over — because the green was about a document that no longer existed.
//
// Occupancy research (2026-08-06, `paper-pipeline/references/occupancy-2026-08-06-*`) said this
// is a solved problem and named the solution: content-addressed build systems. `make` is not
// enough — it keys on timestamps and has NO notion of the recipe changing, which is exactly our
// bug, because editing a checker leaves its old verdict looking fresh. Nix and Bazel both fold
// the builder's own source into the cache key. So do we.
//
// THREE PROPERTIES, and each one is a defect we actually shipped:
//
//   1. STALENESS IS COMPUTED, NEVER DECLARED. A run is fresh only if the paper's bytes hash to
//      what they hashed when the gate ran. No human ticks a box.
//   2. THE CHECKER'S OWN SOURCE IS PART OF THE KEY. Improve a skill and its old verdicts go
//      stale, because they were verdicts of the old skill.
//   3. A GATE THAT HAS NEVER FOUND ANYTHING IS REPORTED AS SUSPECT. Borrowed from mutation
//      testing: a test that kills no mutant is not a test. We shipped a tightening pass that
//      returned KEEP on 80 of 81 sections and a justification pass that never once recommended
//      deletion. Both "ran". Neither could have said no.
//
// NOT A BUILD SYSTEM. It does not run anything or decide what to run next. It records what ran,
// against what, and what it said — the one thing nobody was doing.
//
// ════════════════════════════════════════════════════════════════════════════════════════════
// 2026-08-10 — THERE IS NO `PASS` CONSTRUCTOR, AND THE ROW KEY IS THE CHECK
// ════════════════════════════════════════════════════════════════════════════════════════════
//
// FIVE FAILURES were observed on this pipeline. Three of them were defects of the CHECKING
// APPARATUS rather than of any manuscript, and all three are the same defect wearing three coats:
//
//   1. a gate was recorded as PASS while the input it needs did not exist;
//   2. a check that had never once returned a negative counted as a working check;
//   3. five model reviewers from one vendor agreeing was recorded as an acquittal.
//
// Each is a stored value meaning "nothing was wrong" — written by a process that had no evidence
// for it, and thereafter indistinguishable from one that did. So the value is gone. A run may
// record exactly two things:
//
//   FINDING    — something is wrong. MUST carry a path to the evidence. Refusing to record it
//                would destroy the finding, so the row is written first and the command fails
//                afterwards (see the CLI at the bottom; that ordering is load-bearing).
//   ABSTAINED  — no judgement was produced. MUST carry a reason from a closed vocabulary, so
//                "I ran and found nothing" and "I could not run" are different rows, not
//                different sentences in a note nobody parses.
//
// "Nothing was wrong" is not a value that can be written down. It is the ABSENCE of findings,
// derived at read time by whoever is asking, who then owns the inference.
//
// ── PRIOR ART, stated honestly because both halves of it cut against us ──────────────────────
//
// SARIF (OASIS Standard 2.1.0 §3.27.9) defines `kind: "pass"` verbatim as "The rule … was
// evaluated, and no problem was found", and the only REQUIRED property of a `result` object is
// `message` — `locations` is optional. So a conformant SARIF acquittal can name no place, no
// span and no artifact at all. That is the stored justification we delete.
//
// 🔴 What must NOT be said, here or in any paper: that industry lacks abstention. It does not.
// `kind: "open"` sits in the same paragraph — "the tool concluded that there was insufficient
// information to decide whether a problem exists" — and its NOTE 1 draws exactly the trichotomy
// we build on. Our position is therefore "DELETE PASS, leaving abstain as the only unwitnessed
// outcome", never "add abstain". A reviewer opens §3.27.9 and finds `open` in ten seconds.
// (Established [A] against the OASIS text and its JSON schema:
// `the author's private research notes` §5.)
//
// The ancestor is `Certifying algorithms` — McConnell, Mehlhorn, Näher & Schweitzer, Computer
// Science Review 5(2):119–161, 2011 — where BOTH answers carry a witness: "bipartite" ships a
// 2-colouring, "not bipartite" ships an odd cycle. 🔴 Our discipline is STRICTLY WEAKER than
// theirs and the code must say so rather than borrow their credit: we witness only the POSITIVE
// answer. We have no witness for "nothing is wrong", which is precisely why we do not offer a
// constructor that asserts it — the honest name for a completed clean run is `no-witness`, an
// abstention, and it is not a pass with better manners.
//
// ── THE SECOND DEFECT, FIXED IN THE SAME PASS: the row key ───────────────────────────────────
//
// `status()` reduces a key's rows with `runs[runs.length - 1]` — last row wins. That is correct
// for repeated runs of ONE check and catastrophic across two. The unit that produces a verdict
// is the CHECK, not the skill: two mechanical checks filed under one skill name took turns being
// the answer, so a clean run of the second erased a finding of the first from every derived view
// while the ledger file itself still honestly held both lines.
//
// The key is now `skill` + `check`, rendered `skill/check` (or just `skill` when a skill has a
// single check). `check-provenance`, `arm-permutation` and `delivered-pdf` all belong to
// `build-benchmark` and now hold three separate rows that cannot overwrite one another.

import { createHash } from 'node:crypto';
import { readFileSync, appendFileSync, existsSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { consumerSkillsDir, isMain, ledgerPath } from "./consumer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// 🔴 Overridable so a test never touches real history. The first version of the selftest wrote to
// the production ledger and restored it afterwards — which works right up until the run crashes
// between the two, and then fixture rows are in the record permanently. That is not hypothetical:
// two `my-paper` rows survived into the working tree on 2026-08-07, hours after this shipped.
// Save-and-restore is not isolation. A separate file is.
//
// 🔴 THREE RUNGS SINCE 2026-09-12, AND THE THIRD ONE THROWS. `join(HERE, 'runs.jsonl')` was
// the whole resolution while this file lived in the repository it serves. Once the mechanism moved
// into a package, `HERE` is inside `node_modules` — a directory `npm ci` deletes. Appending there
// SUCCEEDS, so rows would look recorded right up until the next install removed them, with no
// error at any point: the exact stored-untruth this ledger exists to abolish, arriving through its
// own front door. `ledgerPath()` refuses that path and names the key to declare instead; the
// environment variable above is unchanged and still outranks everything.
export const LEDGER = ledgerPath(HERE);
// 🔴 `resolve(HERE, '..', 'skills')` until 2026-08-15, correct while this lived in
// `.claude/pipeline/` and silently wrong the moment it moved into the skill it serves: from
// `.claude/skills/paper-pipeline/scripts/` that resolves to `…/paper-pipeline/skills`, which does
// not exist. And the failure is SILENT in the worst direction — `skillHash()` over a missing
// directory is stable, so every recorded verdict reads FRESH forever and staleness detection is
// dead without a single error. Caught only because `ledger.selftest.mjs` asserts the transition.
//
// 🔴 AND IT BROKE A SECOND TIME, THE SAME WAY, ON 2026-09-12 — which is why it is no longer a
// walk at all. The skills being hashed are the CONSUMER's: `skillHash()` answers "has the checker
// changed since it rendered this verdict", and the checker is a SKILL.md in the repository under
// test. From inside `node_modules` two `..` land on the package's own skills directory, which
// holds no consumer skill — and a hash over a missing directory is stable, i.e. every verdict
// reads FRESH forever. Same silent direction as last time, so the anchor is now the consumer root
// rather than a distance from this file.
const SKILLS = consumerSkillsDir();

/**
 * The two things a run may record. There is no third, and in particular there is no positive.
 *
 * A gate that can only ABSTAIN is not a gate — that property is asserted against every SKILL.md
 * in `skill-checks.mjs` (assertion 10), because it cannot be observed at runtime until the gate
 * has run, and by then a paper has shipped.
 */
export const KINDS = ['FINDING', 'ABSTAINED'];

/**
 * Why a run produced no finding. CLOSED, because the whole point of deleting `PASS` is to stop
 * one word covering several unrelated states — and a free-text reason is that same word with
 * more characters.
 *
 * 🔴 `no-witness` IS NOT A PASS. It says: this check ran to completion and produced no finding,
 * and — unlike a certifying algorithm (McConnell et al. 2011) — it has no witness for the
 * negative answer and therefore does not assert one. Everything downstream must render it as an
 * abstention. `status.mjs` asserts, in its own harness, that its output contains no word meaning
 * "passed".
 */
export const ABSTENTIONS = new Map([
  ['started', 'the run has begun and has not reported yet (written by announce.mjs)'],
  ['no-witness', 'ran to completion, produced no finding — NOT a claim that nothing is wrong'],
  ['input-missing', 'could not run: the thing it reads is not there'],
  ['blocked', 'a required upstream gate has not produced its input'],
  ['crashed', 'the check itself errored out'],
]);

/** The retired vocabulary, kept BY NAME so a caller reaching for it gets an explanation. */
export const RETIRED = new Map([
  ['PASS', 'deleted: it stored "nothing was wrong" as a value. Record ABSTAINED `no-witness`, and let the reader derive cleanliness from the absence of findings.'],
  ['FINDINGS', 'renamed FINDING (one row is one check, and it either found something or it did not).'],
  ['FAIL', 'is a FINDING. Blockingness is a property of the finding — pass `blocking: true` — not a second constructor.'],
  ['ABSENT', 'is ABSTAINED with reason `input-missing`.'],
  ['ERROR', 'is ABSTAINED with reason `crashed` (or `started`, for an announce row).'],
]);

const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

/** Hash of the document under test. Missing file is not an error — it is a distinct state. */
export function inputHash(paperDir) {
  const p = join(paperDir, 'paper.md');
  if (!existsSync(p)) return null;
  return sha(readFileSync(p));
}

/**
 * Hash of the CHECKER ITSELF — its SKILL.md plus any scripts it ships. This is the property
 * `make` lacks and the reason its staleness answers cannot be trusted. Rewrite a skill's
 * instructions and every verdict it ever gave becomes a verdict about a tool that is gone.
 */
export function skillHash(skill) {
  const dir = join(SKILLS, skill);
  if (!existsSync(dir)) return null;
  const parts = [];
  const walk = (d) => {
    for (const e of readdirSorted(d)) {
      const full = join(d, e);
      const st = statSync(full);
      if (st.isDirectory()) { if (e !== 'fixtures' && e !== 'node_modules') walk(full); }
      else if (/\.(md|mjs|js|sh|py|ts)$/.test(e)) parts.push(e + ':' + sha(readFileSync(full)));
    }
  };
  walk(dir);
  return sha(parts.join('\n'));
}

function readdirSorted(d) {
  // Sorted so the hash is stable across filesystems. An unstable key would make every run look
  // stale on another machine, and a check that cries wolf is a check that gets muted.
  return readdirSync(d).sort();
}

// ── the key ───────────────────────────────────────────────────────────────────────────────────

/** The row key of a ledger row: `skill` for a single-check skill, `skill/check` otherwise. */
export const rowKey = (r) => (r.check && r.check !== r.skill ? `${r.skill}/${r.check}` : r.skill);

/** Split a gate identifier (`skill` or `skill/check`) into its parts. Inverse of `rowKey`. */
export function parseGate(g) {
  const [skill, check] = String(g).split('/');
  return { key: String(g), skill, check: check || skill };
}

// ── writing ───────────────────────────────────────────────────────────────────────────────────

/**
 * Record one run. Called by the skill itself, at the END, with what it produced.
 *
 * Throws BEFORE writing when the vocabulary is wrong (nothing is lost — there is no evidence in
 * a malformed call), and AFTER writing when a FINDING's evidence is missing (the finding must
 * survive; see the CLI comment). An error thrown after the write carries `err.recorded`.
 */
export function record({ skill, check = skill, paper, kind, findings = 0, report = null, reason = null, note = null, blocking = false }) {
  if (RETIRED.has(kind)) {
    throw new Error(
      `"${kind}" is not a verdict any more — ${RETIRED.get(kind)}\n` +
      `  Record one of ${KINDS.join('|')}. Reasons for ABSTAINED: ${[...ABSTENTIONS.keys()].join('|')}.`
    );
  }
  if (!KINDS.includes(kind)) {
    throw new Error(`kind must be one of ${KINDS.join('|')}, got ${JSON.stringify(kind)}`);
  }
  if (kind === 'ABSTAINED' && !ABSTENTIONS.has(reason)) {
    throw new Error(
      `ABSTAINED needs a reason from ${[...ABSTENTIONS.keys()].join('|')}, got ${JSON.stringify(reason)}.\n` +
      `  A free-text reason is "PASS" with more characters: the point of the closed set is that\n` +
      `  "ran and found nothing" and "could not run" stop being the same row.`
    );
  }
  if (kind === 'FINDING' && !(Number(findings) >= 1)) {
    throw new Error(
      `FINDING with findings=${JSON.stringify(findings)}. A finding of nothing is an abstention:\n` +
      `  record ABSTAINED no-witness instead. Nothing is lost by refusing here — there is no\n` +
      `  evidence in a count of zero.`
    );
  }

  const paperDir = resolve(paper);
  const row = {
    ts: new Date().toISOString(),
    skill,
    check,
    paper: basename(paperDir),
    inputSha: inputHash(paperDir),
    skillSha: skillHash(skill),
    kind,
    findings: kind === 'FINDING' ? Number(findings) : 0,
    blocking: kind === 'FINDING' ? Boolean(blocking) : false,
    reason,
    report,
    note,
  };
  mkdirSync(dirname(LEDGER), { recursive: true });
  appendFileSync(LEDGER, JSON.stringify(row) + '\n');

  if (kind === 'FINDING') {
    const problem = evidenceProblem(row, paperDir);
    if (problem) {
      const e = new Error(problem);
      e.recorded = row; // the row IS on disk; only the run failed
      throw e;
    }
  }
  return row;
}

/**
 * 🔴 THE EVIDENCE CONTRACT. A FINDING must point at something a reader can open, and if that
 * something states its own count the two must agree.
 *
 * This is where an output contract can actually be enforced, and the reason is structural: a
 * skill is prose and returns nothing to a runtime, so there is no `return skill({schema})` to
 * typecheck. What there IS, is a choke point — every skill must call `record` or its row never
 * reaches the status table and the gate reads NEVER-RUN, which is loud. Anything checked here
 * cannot be skipped, and nothing checked anywhere else has that property.
 *
 * Graduated on purpose, the gradual-typing shape rather than a flag day:
 *   no path at all             -> HARD. The row survives (see `record`); the RUN fails.
 *   path points at nothing     -> HARD. Worse than no path: it reads as evidence and sends the
 *                                 next reader into a 404.
 *   report states no count     -> nudge only. Reports written before this convention are fine;
 *                                 demanding a field they lack would get the check disabled on
 *                                 day one.
 *   report states a DIFFERENT  -> HARD. Two numbers that disagree mean one of them is already
 *   count                        wrong, and silence picks the wrong one at random.
 */
function evidenceProblem(row, paperDir) {
  if (!row.report) {
    return (
      `${row.skill}: recorded ${row.findings} finding(s) with NO report path.\n` +
      `   The row is saved, so nothing is lost — but a count with no location is a rumour, and\n` +
      `   next session will re-derive it from scratch. Re-run with the report path last:\n` +
      `   node .claude/skills/paper-pipeline/scripts/ledger.mjs record ${row.skill} <paper-dir> FINDING ${row.findings} <report-path>`
    );
  }
  const reportPath = resolve(paperDir, row.report);
  if (!existsSync(reportPath)) {
    return (
      `${row.skill}: recorded report path "${row.report}" — nothing is there.\n` +
      `   Resolved to ${reportPath}\n` +
      `   A path that points at nothing is worse than no path: the status table shows it as\n` +
      `   evidence and the next reader follows it into a 404. Write the report, then record.`
    );
  }
  const stated = /^findings:\s*(\d+)\s*$/m.exec(readFileSync(reportPath, 'utf8'));
  if (!stated) {
    console.error(
      `\n⚠️  ${row.skill}: ${row.report} does not state its own finding count.\n` +
      `   Add \`findings: ${row.findings}\` to its frontmatter and the ledger and the report can\n` +
      `   be checked against each other. Without it, the count here is unverifiable prose.`
    );
    return null;
  }
  if (Number(stated[1]) !== Number(row.findings)) {
    return (
      `${row.skill}: the ledger says ${row.findings} finding(s), ${row.report} says ${stated[1]}.\n` +
      `   One of the two is already wrong and nothing here can tell which. Fix the report or the\n` +
      `   recorded count so they agree, then record again.`
    );
  }
  return null;
}

// ── reading ───────────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 HOW ROWS FROM THE OLD VOCABULARY ARE TREATED, decided deliberately and loudly.
 *
 * `runs.jsonl` is append-only and holds real rows carrying `PASS`, `FINDINGS`, `FAIL`, `ABSENT`
 * and `ERROR`. The file is NOT rewritten — rewriting history to make it agree with today's
 * design is the same move as ticking a box in the old status table.
 *
 * Nor are those rows TRANSLATED into the new constructors. A silent reinterpretation is exactly
 * the class of defect this refactor exists to remove: were an old `PASS` mapped onto
 * `ABSTAINED no-witness`, a row asserting "nothing was wrong" would come back out of the reader
 * wearing the new vocabulary's honesty without having earned it.
 *
 * So a legacy row keeps its own kind, `LEGACY`, and its original word verbatim in
 * `legacyVerdict`. `LEGACY` is deliberately NOT in `KINDS`: it can be read and can never be
 * written. Downstream:
 *
 *   • it counts as a RUN (someone did run something, and pretending otherwise is its own lie);
 *   • a legacy `FINDINGS`/`FAIL` row still surfaces its count and report path, because those
 *     rows carry evidence and discarding evidence is the destructive direction;
 *   • a legacy `PASS`/`ABSENT`/`ERROR` row carries nothing forward. It is displayed as what it
 *     is — a word from a vocabulary we retired — and satisfies nothing.
 */
export const LEGACY_KIND = 'LEGACY';

function normalise(row) {
  if (row.kind) return { ...row, check: row.check || row.skill };
  return {
    ...row,
    check: row.check || row.skill,
    kind: LEGACY_KIND,
    legacyVerdict: row.verdict ?? null,
    // Only the two negatives carried anything. Everything else is a word, not a fact.
    findings: row.verdict === 'FINDINGS' || row.verdict === 'FAIL' ? Number(row.findings ?? 0) : 0,
    blocking: row.verdict === 'FAIL',
    reason: null,
  };
}

/** Does this row assert that something is wrong? Legacy negatives count; legacy `PASS` does not. */
export const isFinding = (r) =>
  r.kind === 'FINDING' || (r.kind === LEGACY_KIND && (r.legacyVerdict === 'FINDINGS' || r.legacyVerdict === 'FAIL'));

export function readLedger() {
  if (!existsSync(LEDGER)) return [];
  return readFileSync(LEDGER, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => { try { return normalise(JSON.parse(l)); } catch { return null; } })
    .filter(Boolean);
}

/**
 * The computed state of every CHECK for one paper. This REPLACES the hand-maintained table —
 * it is not a second copy of it. Nothing here is declared; every field is derived from the
 * ledger plus the current bytes on disk.
 *
 * 🔴 There is no `verdict` field, and that is the interface change. A caller that wants to know
 * whether a check is clean must read `findings === 0` and own the inference, which is a sentence
 * it has to write down rather than a value it can copy.
 */
export function status(paperDir, { gates } = {}) {
  const dir = resolve(paperDir);
  const paper = basename(dir);
  const nowInput = inputHash(dir);
  const rows = readLedger().filter((r) => r.paper === paper);

  const known = gates || [...new Set(rows.map(rowKey))];
  return known.map((g) => {
    const { key, skill, check } = parseGate(g);
    const runs = rows.filter((r) => rowKey(r) === key);
    const last = runs[runs.length - 1] || null;
    const nowSkill = skillHash(skill);

    let state;
    if (!last) state = 'NEVER-RUN';
    else if (last.inputSha !== nowInput) state = 'STALE-PAPER';
    else if (last.skillSha !== nowSkill) state = 'STALE-SKILL';
    else state = 'FRESH';

    const found = last && isFinding(last);
    return {
      key,
      skill,
      check,
      state,
      runs: runs.length,
      // The last run's finding, if it made one. Zero here means NO FINDING WAS RECORDED — it is
      // not, and must never be rendered as, a claim that the paper is clean.
      findings: found ? Number(last.findings ?? 0) : 0,
      blocking: found ? Boolean(last.blocking) : false,
      report: found ? last.report ?? null : null,
      abstained: last && last.kind === 'ABSTAINED' ? { reason: last.reason, note: last.note } : null,
      legacy: last && last.kind === LEGACY_KIND ? last.legacyVerdict : null,
      ts: last?.ts ?? null,
      // Mutation-testing borrow: a check with runs and no finding has never demonstrated it is
      // able to produce one. Not proof of a broken check — a reason to go plant a defect.
      everFound: runs.some(isFinding),
    };
  });
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────

const USAGE = [
  'usage: ledger.mjs record <skill> <paperDir> FINDING   <count> <report-path> [--check=<id>] [--blocking]',
  '       ledger.mjs record <skill> <paperDir> ABSTAINED <reason> [note]       [--check=<id>]',
  '       ledger.mjs status <paperDir>',
  '',
  `  reasons: ${[...ABSTENTIONS.keys()].join(' | ')}`,
  '  --blocking marks a finding that must stop the pass (a fact is wrong, a required predecessor',
  '  does not exist). It is a PROPERTY of the finding, not a second constructor: the old `FAIL`.',
  '  there is no PASS: a clean run is `ABSTAINED no-witness`, and cleanliness is derived by the',
  '  reader from the absence of findings, never stored as a value.',
].join('\n');

if (isMain(import.meta.url)) {
  // 🔴 EVERY FLAG THE USAGE TEXT ADVERTISES IS PARSED HERE, and that sentence is load-bearing
  // because it was false for the first hour of this file's life: `--blocking` was written into the
  // usage block and into all 22 SKILL.md files while nothing read it, so every skill instructing
  // `--blocking` for its desk-reject case would have recorded an ordinary advisory finding and the
  // status view would have shown a bullet where it should show 🔴. A documented flag that does
  // nothing is this repository's oldest recurring defect — three dead hooks, a twelve-day-dead
  // nudge — arriving inside the refactor written to end it. `gates.harness.mjs` block 14 asserts
  // the flag from the outside, which is the only form of this that cannot rot.
  const argv = process.argv.slice(2);
  const flag = (name) => argv.some((a) => a === `--${name}`);
  const valued = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const [cmd, ...rest] = argv.filter((a) => !a.startsWith('--'));

  if (cmd === 'record') {
    const [skill, paper, kind, a4, a5] = rest;
    const check = valued('check') || skill;
    const args =
      kind === 'FINDING'
        ? { kind, findings: Number(a4 || 0), report: a5 || null, blocking: flag('blocking') }
        : { kind, reason: a4 || null, note: a5 || null };

    // 🔴 A FINDING WITH BROKEN EVIDENCE IS RECORDED, AND THEN THE COMMAND FAILS.
    //
    // Every SKILL.md instructs `record <skill> <dir> FINDING <count> <report-path>`. On
    // 2026-08-07, surfacing open findings for the first time showed that four of six real runs
    // had passed the count and omitted the path: build-benchmark 13, tighten-paper 9,
    // grade-paper-writing 11, draft-paper 3 — thirty-six findings that are a number and nothing
    // else, unrecoverable without rerunning the gate. The instruction was written, read, and not
    // followed, which is this pipeline's own thesis landing on itself.
    //
    // The row is written FIRST and deliberately: refusing outright would destroy the finding,
    // which is worse than storing it badly. What must not happen is the run reading as DONE. So
    // the data survives and the command exits non-zero, which the author sees in the session
    // rather than a week later in a status table. `record()` throws AFTER appending, and this
    // catch is the half that turns that into an exit code.
    let row;
    try {
      row = record({ skill, check, paper, ...args });
    } catch (e) {
      if (e.recorded) {
        console.log(JSON.stringify(e.recorded));
        console.error(`\n🔴 ${e.message}`);
        process.exit(1);
      }
      console.error(`\n🔴 ${e.message}\n\n${USAGE}`);
      process.exit(2);
    }
    console.log(JSON.stringify(row));
  } else if (cmd === 'status') {
    console.log(JSON.stringify(status(rest[0] || '.'), null, 2));
  } else {
    console.error(USAGE);
    process.exit(2);
  }
}
