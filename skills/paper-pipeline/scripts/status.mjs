// status.mjs — the one status view, computed. Replaces the table nobody could trust.
//
//   node .claude/skills/paper-pipeline/scripts/status.mjs <papers-root>/<paper-a>
//
// Everything printed here is derived from the ledger plus the bytes currently on disk. There is
// no field a human can set, which is the entire point: the table it replaces was accurate only
// for as long as someone remembered to un-tick it, and nobody ever did.
//
// 🔴 NOTHING IN THIS VIEW SAYS A PAPER PASSED, AND THAT IS ENFORCED, NOT INTENDED.
// The ledger has no `PASS` constructor (see ledger.mjs), so this reader has nothing to render as
// an acquittal. It reports, per check: how many findings the last run recorded, or — when the run
// recorded none — the ABSTENTION reason it gave. `no-witness` means "ran, found nothing, and has
// no witness for the negative"; it is displayed as an abstention and never as green.
// `gates.harness.mjs` asserts that this file's output contains no word meaning "passed", because
// a rule about tone that nothing checks is a rule that lasts one refactor.

import { status, readLedger, rowKey, parseGate, ABSTENTIONS } from './ledger.mjs';
import { resolve, basename } from 'node:path';
import { isMain } from "./consumer.mjs";

// The checks a paper is expected to have been put through. Listed explicitly so a check that has
// NEVER run shows up as a row rather than as an absence — the difference between "we looked and
// recorded nothing" and "nobody asked" is the whole failure this pipeline keeps having.
//
// 🔴 ENTRIES ARE CHECKS, NOT SKILLS. `skill` names a skill's own single pass; `skill/check` names
// one mechanical check filed under that skill. Before 2026-08-10 the key was the skill, and
// `status()` took the LAST row per skill — so two checks under one name took turns being the
// answer and a clean run of one erased a finding of the other from every derived view. Three
// checks now sit under `build-benchmark` and none of them can overwrite the others.
export const EXPECTED_GATES = [
  // — before a word is written —
  'research-ideate',
  'sweep-design-space',
  'map-prior-work',
  'find-venue',
  'plan-paper-timeline',
  // — building the evidence —
  'build-benchmark',
  'build-benchmark/check-provenance',
  'build-benchmark/arm-permutation',
  'build-benchmark/delivered-pdf',
  'build-benchmark/generated-code',
  'argument-arc',
  'draft-paper',
  'draft-paper/population-map',
  // — the loop —
  'cold-read-diff',
  'tighten-paper',
  'tighten-paper/structure',
  'tighten-paper/round-diff',
  'grade-paper-writing',
  'grade-paper-writing/prose-lint',
  // TeXtidote. Filed here because this skill owns the paper's PROSE surface and `prose-lint` is the
  // other instrument reading it — style thresholds there, spelling and grammar here.
  'grade-paper-writing/textidote',
  'render-paper',
  'render-paper/report-submission',
  // — checking against the world —
  'verify-citations',
  'verify-citations/verify-cites',
  // checkcites, the bibliography read backwards: verify-cites asks whether an entry names a real
  // work, this asks whether anything cites the entry. Same surface, opposite arrow, same skill.
  'verify-citations/uncited-refs',
  'analyze-sibling-paper',
  'study-accepted-papers',
  // — the gates —
  'paper-adversarial-review',
  'pc-panel-review',
  'harden-paper',
  'harden-paper/artifact-coverage',
  'submit-paper',
  // — after —
  'camera-ready',
  'extend-paper',
];
// 🔴 This list is the table. A check that records a row but is absent here writes rows nobody
// ever sees — it ran, and the status view says nothing, which is the precise failure this whole
// directory was built to end. Found 2026-08-07, hours after the first version shipped with 12 of
// the 22 wired skills listed. `paper-status` is deliberately absent: it REPORTS state rather than
// producing a verdict about the paper, so a row for it would be the table grading itself.
// Any new paper skill: wire it, then add it here. Any new mechanical check in `run-mechanical.mjs`:
// add its `skill/check` key here. `unlistedGates()` below catches the omission.

/** Checks that have recorded rows for this paper but are missing from the table above. */
export function unlistedGates(rows) {
  const listed = new Set(EXPECTED_GATES);
  return [...new Set(rows.map(rowKey))].filter((k) => !listed.has(k) && parseGate(k).skill !== 'paper-status');
}

const ICON = {
  'FRESH': '🟢',
  'STALE-PAPER': '🟠',
  'STALE-SKILL': '🟡',
  'NEVER-RUN': '⬜',
};

const WHY = {
  'FRESH': 'ran against these exact bytes',
  'STALE-PAPER': 'the paper changed since it ran — its answer is about a document that is gone',
  'STALE-SKILL': 'the check itself changed since it ran — that answer came from a different tool',
  'NEVER-RUN': 'nobody has asked this question about this paper',
};

/** What the last run of this check produced. Never a word that could be read as an acquittal. */
function produced(r) {
  if (r.state === 'NEVER-RUN') return '—';
  if (r.findings > 0) return `${r.blocking ? '🔴' : '•'} ${r.findings} found`;
  if (r.legacy) return `legacy:${r.legacy}`;
  if (r.abstained) return `abstained:${r.abstained.reason}`;
  return 'no row';
}

function main(argv) {
  const dir = resolve(argv[2] || '.');
  const rows = status(dir, { gates: EXPECTED_GATES });

  console.log(`\n  ${basename(dir)}\n`);
  const pad = (s, n) => String(s ?? '').padEnd(n);
  console.log(`  ${pad('check', 36)}${pad('freshness', 14)}${pad('last run produced', 22)}${pad('runs', 6)}when`);
  console.log(`  ${'-'.repeat(92)}`);

  for (const r of rows) {
    const when = r.ts ? r.ts.slice(0, 16).replace('T', ' ') : '—';
    console.log(
      `  ${ICON[r.state]} ${pad(r.key, 34)}${pad(r.state, 14)}${pad(produced(r), 22)}${pad(r.runs, 6)}${when}`
    );
  }

  const stale = rows.filter((r) => r.state === 'STALE-PAPER' || r.state === 'STALE-SKILL');
  const never = rows.filter((r) => r.state === 'NEVER-RUN');
  const mute = rows.filter((r) => r.runs > 0 && !r.everFound);

  console.log('');
  for (const r of stale) console.log(`  ${ICON[r.state]} ${r.key}: ${WHY[r.state]}`);
  if (never.length) {
    console.log(`  ⬜ never run: ${never.map((r) => r.key).join(', ')}`);
    console.log(`     ${WHY['NEVER-RUN']} — an unasked question reads exactly like a clean one in prose.`);
  }

  // 🔴 THE ABSENCE OF FINDINGS IS NOT A RESULT, AND THIS IS WHERE THAT IS SAID OUT LOUD.
  // Under the old vocabulary these checks recorded PASS and this block was a footnote about a
  // suspicious gate. With PASS deleted, "recorded no finding" is ALL that a clean run ever
  // produces, so this is now the primary reading of the table rather than a warning about it.
  if (mute.length) {
    console.log(`\n  🔇 has run and has NEVER recorded a finding: ${mute.map((r) => r.key).join(', ')}`);
    console.log(`     Borrowed from mutation testing: a test that kills no mutant is not a test. This is`);
    console.log(`     not proof the check is broken — it is the reason to go plant a defect and watch.`);
    console.log(`     Precedent here: a tightening pass returned KEEP on 80 of 81 sections and a`);
    console.log(`     justification pass never once recommended a deletion. Both "ran".`);
  }

  const legacy = rows.filter((r) => r.legacy);
  if (legacy.length) {
    const acquittals = legacy.filter((r) => !['FINDINGS', 'FAIL'].includes(r.legacy));
    console.log(`\n  🏷️  answered in the RETIRED vocabulary: ${legacy.map((r) => `${r.key}=${r.legacy}`).join(', ')}`);
    console.log(`     Rows written before 2026-08-10 are kept verbatim and are NOT translated into the`);
    console.log(`     current constructors — a silent reinterpretation is the class of defect this`);
    console.log(`     pipeline removed. A retired FINDINGS/FAIL row still shows its count above, because`);
    console.log(`     it carries evidence and discarding evidence is the destructive direction.`);
    if (acquittals.length) {
      console.log(`     ${acquittals.map((r) => `${r.key}=${r.legacy}`).join(', ')} carry NOTHING forward:`);
      console.log(`     they recorded that nothing was wrong, with no evidence attached, which is exactly`);
      console.log(`     the value that was deleted. Re-run those checks for an answer in a live vocabulary.`);
    }
  }

  const orphans = unlistedGates(readLedger().filter((r) => r.paper === basename(dir)));
  if (orphans.length) {
    console.log(`\n  ❗ recording but NOT IN THE TABLE: ${orphans.join(', ')}`);
    console.log(`     These ran and said something, and this view showed you nothing. Add them to`);
    console.log(`     EXPECTED_GATES — an invisible row is the failure this directory exists to end.`);
  }

  // 🔴 OPEN FINDINGS. The ledger has recorded a findings COUNT and a REPORT PATH on every row since
  // it was written, and this view never showed either — a check could record "7 findings, report at
  // <path>" and the table printed a single word. The number and the path went nowhere, so the one
  // thing a check actually produces was the one thing you could not see without opening runs.jsonl
  // by hand.
  //
  // NB this reports what the LEDGER holds. It cannot tell whether anyone acted on a finding — that
  // lives in the session's task list, which is not a file and cannot be checked from the repo. So
  // this makes findings VISIBLE and durable; it does not and cannot make them assigned.
  const open = rows.filter((r) => r.findings > 0 && r.state !== 'NEVER-RUN');
  if (open.length) {
    const total = open.reduce((s, r) => s + r.findings, 0);
    console.log(`\n  📌 open findings: ${total} across ${open.length} check(s)`);
    for (const r of open) {
      const where = r.report ? ` → ${r.report}` : ' (no report path recorded — the count is all there is)';
      const fresh = r.state === 'FRESH' ? '' : `  [${r.state}: this count describes an older text]`;
      console.log(`     ${r.blocking ? '🔴' : '•'} ${r.key}: ${r.findings}${where}${fresh}`);
    }
    console.log(`     Nothing here proves anyone acted on these. The ledger records what a check SAID,`);
    console.log(`     never what was done about it — that lives in the session, not in a file.`);
  }

  const quiet = rows.filter((r) => r.state === 'FRESH' && r.findings === 0 && r.abstained);
  if (quiet.length) {
    console.log(`\n  🤍 ran against the current bytes and recorded nothing: ${quiet.length} check(s)`);
    console.log(`     ${quiet.map((r) => `${r.key} (${r.abstained.reason})`).join(', ')}`);
    console.log(`     Read this as the ABSENCE of a finding, which is what it is. \`no-witness\` means the`);
    console.log(`     check ran and has no witness for the negative answer — unlike a certifying`);
    console.log(`     algorithm (McConnell et al. 2011), which ships one for both answers. Our discipline`);
    console.log(`     is strictly weaker than theirs and this line is where that shows.`);
    for (const [reason, meaning] of ABSTENTIONS) {
      if (quiet.some((r) => r.abstained.reason === reason)) console.log(`       ${reason}: ${meaning}`);
    }
  }

  const blocking = stale.length + never.length;
  console.log(
    `\n  ${blocking === 0 ? '🟢 every expected check answered for the current text' : `🔴 ${blocking} check(s) not answering for the current text`}\n`
  );
  return 0; // advisory: this reports, it does not block
}

if (isMain(import.meta.url)) process.exit(main(process.argv));
