// ledger.selftest.mjs — plant each failure this thing exists to catch, and watch it catch them.
//
// The project's rule, written after five tools reported success while doing nothing:
// "a checker that has never failed does not count as working". So this file does not check that
// the ledger runs. It checks that it says NO when it should, and YES when it should — both
// directions, for every property the design claims.
//
//   node .claude/skills/paper-pipeline/scripts/ledger.selftest.mjs

import { mkdtempSync, writeFileSync, rmSync, readFileSync, appendFileSync, existsSync, realpathSync } from 'node:fs';
import { consumerSkillsDir } from './consumer.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'ledger-selftest-')));
const paper = join(tmp, 'a-paper');

// 🔴 Point the ledger at a throwaway file BEFORE importing it. The first version wrote to the real
// ledger and restored it in a `finally`, which leaks fixture rows into permanent history the moment
// the run dies between the two — and it did, on the day this shipped. Isolation, not cleanup.
process.env.PIPELINE_LEDGER = join(tmp, 'runs.jsonl');

let failures = 0;
const check = (name, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `  — expected ${expected}, got ${actual}`}`);
};

try {
  // `skillHash` was dropped from the destructuring on 2026-08-28 — no check below was reading it.
  const { record, status } = await import('./ledger.mjs');
  const mk = (t) => { writeFileSync(join(paper, 'paper.md'), t); };
  const { mkdirSync } = await import('node:fs');
  mkdirSync(paper, { recursive: true });

  const gate = 'cold-read-diff'; // a real skill, so skillHash resolves
  const st = () => status(paper, { gates: [gate] })[0];

  // ── 1. NEVER-RUN is a state, not an absence ──────────────────────────────────────────────
  mk('version one');
  check('a gate nobody has run reads NEVER-RUN', st().state, 'NEVER-RUN');

  // ── 2. a fresh run is fresh ──────────────────────────────────────────────────────────────
  // The clean run is an ABSTENTION, not a pass: there is no constructor asserting that nothing
  // was wrong (see ledger.mjs). `no-witness` says the check ran and produced no finding.
  const ran = () => record({ skill: gate, paper, kind: 'ABSTAINED', reason: 'no-witness' });
  ran();
  check('a run against the current bytes reads FRESH', st().state, 'FRESH');

  // ── 3. 🔴 THE PLANTED ERROR THIS FILE EXISTS FOR: the paper changes underneath a green gate.
  //        This is the exact defect that shipped — a ☑ describing a document that no longer
  //        exists. If this assertion ever goes green-on-stale, the ledger is decorative.
  mk('version two, rewritten after the gate ran');
  check('after the paper changes, the same verdict reads STALE-PAPER', st().state, 'STALE-PAPER');

  // ── 4. and the property `make` does not have: the CHECKER changed ────────────────────────
  mk('version one');           // put the paper back so only the skill differs
  ran();
  check('back on the original bytes it is FRESH again', st().state, 'FRESH');

  // 🔴 `../skills/…` until 2026-08-15, when this file moved from `.claude/pipeline/` into the
  // skill it serves. A SIXTH form of hidden reference, after literal paths, `join()` segments,
  // relative imports, path-shaped regexes and `..`-depth constants: `new URL(rel, import.meta.url)`
  // is not an import, so neither a path search nor an import resolver sees it. It broke in CI —
  // ENOENT on `.claude/skills/paper-pipeline/skills/cold-read-diff/SKILL.md`, a path assembled from
  // the new location and the old relative segment.
  //
  // 🔴 AND A SEVENTH FORM, 2026-09-12: the segment was right and the ANCHOR moved. Once the
  // mechanism ships as a package, `import.meta.url` is inside `node_modules`, so the same two `..`
  // now name a skill directory of the PACKAGE — which holds no consumer skill. The subject here
  // was never "a file near me"; it is "the SKILL.md whose bytes `skillHash(gate)` folds into the
  // key", and that file belongs to the repository under test. So it is resolved the way
  // `ledger.mjs` resolves `SKILLS`, from the consumer root, and the two cannot drift apart.
  const skillFile = join(consumerSkillsDir(), gate, 'SKILL.md');
  // Loud, not skipped. This assertion is the only one covering property 2 of the design ("the
  // checker's own source is part of the key"); skipping it when the file is absent would leave the
  // selftest printing success while proving one property fewer — the green-over-emptiness this
  // whole file exists to forbid.
  if (!existsSync(skillFile))
    throw new Error(
      `ledger.selftest: ${skillFile} does not exist.\n` +
        `This selftest runs against a CONSUMER of the pipeline — a repository that has the ` +
        `pipeline's skills installed under .claude/skills/ — not against this package on its own.`,
    );
  const skillBefore = readFileSync(skillFile);
  try {
    appendFileSync(skillFile, '\n<!-- selftest: transient edit, removed below -->\n');
    check('editing the SKILL itself makes its old verdict STALE-SKILL', st().state, 'STALE-SKILL');
  } finally {
    writeFileSync(skillFile, skillBefore); // never leave a real skill modified
  }
  check('restoring the skill restores FRESH', st().state, 'FRESH');

  // ── 5. the mute-check signal, both ways ──────────────────────────────────────────────────
  check('a check that has only ever abstained is flagged as never having found anything', st().everFound, false);
  writeFileSync(join(paper, 'report.md'), '---\nfindings: 3\n---\n');
  record({ skill: gate, paper, kind: 'FINDING', findings: 3, report: 'report.md' });
  check('one finding clears the flag', st().everFound, true);

  // ── 6. a retired verdict is refused rather than silently stored ──────────────────────────
  // 🔴 THE POINT OF THE WHOLE REFACTOR, asserted at its narrowest: `PASS` cannot be written.
  // Not "is discouraged" — the constructor does not exist, and reaching for it is an error that
  // names what to do instead.
  let msg = '';
  try { record({ skill: gate, paper, kind: 'PASS' }); } catch (e) { msg = e.message; }
  check('recording PASS throws', msg.includes('not a verdict any more'), true);
  check('...and the error says what to record instead', msg.includes('no-witness'), true);

  let threw = false;
  try { record({ skill: gate, paper, kind: 'probably fine' }); } catch { threw = true; }
  check('an unrecognised kind throws instead of being written', threw, true);

  threw = false;
  try { record({ skill: gate, paper, kind: 'ABSTAINED', reason: 'it seemed fine' }); } catch { threw = true; }
  check('an abstention with a free-text reason throws', threw, true);

  // ── 7. ONE CHECK, ONE ROW: two checks under one skill do not overwrite each other ────────
  // The defect: `status()` takes the last row per key, and the key used to be the skill. A clean
  // run of the second check erased a finding of the first from every derived view.
  writeFileSync(join(paper, 'prov.md'), '---\nfindings: 5\n---\n');
  record({ skill: 'build-benchmark', check: 'check-provenance', paper, kind: 'FINDING', findings: 5, report: 'prov.md' });
  record({ skill: 'build-benchmark', check: 'arm-permutation', paper, kind: 'ABSTAINED', reason: 'no-witness' });
  const both = status(paper, { gates: ['build-benchmark/check-provenance', 'build-benchmark/arm-permutation'] });
  check('the finding survives a clean run of a SIBLING check', both[0].findings, 5);
  check('and the sibling keeps its own row', both[1].findings, 0);
  check('the sibling did not inherit the finding', both[1].everFound, false);

  // ── 8. ORDER IN THE FILE IS NOT ORDER IN TIME ────────────────────────────────────────────
  // The defect (external review, P1, 2026-09-15): `status()` took `runs[runs.length - 1]`, so the
  // verdict was decided by POSITION. The consumer declares `merge=union` for this ledger, and
  // union concatenates "ours, then theirs" without ordering anything — so a merge that lands an
  // older row after a newer one hid the finding and reported a clean state.
  //
  // The fixture reproduces exactly that shape: both rows are REAL (written by `record`), only
  // their order in the file is swapped, which is all a union merge does. The older row's stamp is
  // set explicitly rather than slept for, so the test is deterministic and costs no wall clock.
  const LEDGER_FILE = process.env.PIPELINE_LEDGER;
  writeFileSync(join(paper, 'merge.md'), '---\nfindings: 3\n---\n');
  record({ skill: gate, check: 'merge-order', paper, kind: 'ABSTAINED', reason: 'no-witness' });
  record({ skill: gate, check: 'merge-order', paper, kind: 'FINDING', findings: 3, report: 'merge.md' });

  {
    const all = readFileSync(LEDGER_FILE, 'utf8').split('\n').filter(Boolean);
    const [abstained, finding] = all.slice(-2).map((l) => JSON.parse(l));
    abstained.ts = '2026-01-01T00:00:00.000Z'; // deliberately older, with no dependence on a timer
    writeFileSync(
      LEDGER_FILE,
      [...all.slice(0, -2), JSON.stringify(finding), JSON.stringify(abstained)].join('\n') + '\n',
    );
  }

  const merged = status(paper, { gates: [`${gate}/merge-order`] })[0];
  check('an older row sitting AFTER a newer one does not hide the finding', merged.findings, 3);
  check('...and the verdict does not come from the stale abstention', merged.abstained, null);

  // The other half: EQUAL stamps must keep the old behaviour — file order decides. Two runs inside
  // one second carry no other information, and for a single writer file order is the true order.
  {
    const all = readFileSync(LEDGER_FILE, 'utf8').split('\n').filter(Boolean);
    const [finding, abstained] = all.slice(-2).map((l) => JSON.parse(l));
    const sameTs = finding.ts;
    writeFileSync(
      LEDGER_FILE,
      [...all.slice(0, -2), JSON.stringify({ ...finding, ts: sameTs }), JSON.stringify({ ...abstained, ts: sameTs })].join('\n') + '\n',
    );
    const tie = status(paper, { gates: [`${gate}/merge-order`] })[0];
    check('with equal stamps the later row in the file still wins', tie.findings, 0);
  }

} finally {
  // The ledger lives inside `tmp`, so removing the fixture removes it too. Nothing to restore,
  // which is the point — there is no window in which real history is at risk.
  rmSync(tmp, { recursive: true, force: true });
}

console.log(failures === 0
  ? '\n  all planted errors were caught\n'
  : `\n  🔴 ${failures} assertion(s) failed — the ledger is not doing what it claims\n`);
process.exit(failures === 0 ? 0 : 1);
