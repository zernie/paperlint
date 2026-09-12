#!/usr/bin/env node
/**
 * population-map.selftest.mjs — planted defects, both directions.
 *
 * This repository has been burned three times by checkers and hooks that were green and dead, and
 * the rule that came out of it is that a checker which has never failed is not a checker.
 *
 * 🔴 СОКРАЩЁН 2026-08-26 ВМЕСТЕ С САМИМ ЧЕКЕРОМ. Девять из тринадцати случаев проверяли `untied`
 * и `undeclared` — обе находки уехали в правила ESLint (`paper/population-untied`,
 * `paper/population-undeclared`), и их случаи переехали туда же, в
 * `eslint-rules/paper-registry.harness.mjs`, где стоят рядом с прогоном на НАСТОЯЩЕЙ статье.
 * Здесь остались две находки, которые говорят про сам реестр: `stale` и `badref`.
 *
 * 🔴 ОДИН СЛУЧАЙ УДАЛЁН, А НЕ ПЕРЕЕХАЛ, и это стоит помнить. Он выглядел так:
 *
 *     check('189 does not match inside 1,189',
 *           !sentences('x 1,189 y').some((s) => /(?<![\d,.])189(?!\d|[,.]\d)/.test(s)));
 *
 * то есть прогонял по строке РУКОПИСНУЮ КОПИЮ регулярки чекера и утверждал о литерале внутри
 * самого теста. Мутация тела `printed()` такой тест не задевает по построению — что и показала
 * батарея `eslint-rules/paper-registry.mutations.mjs`, где эта мутация ВЫЖИЛА в первом прогоне.
 * Свойство теперь закреплено фикстурой, проверяющей ПОВЕДЕНИЕ, а не совпадение двух копий
 * регулярки.
 */
import { findings, bodyOf } from './population-map.mjs';

const doc = (bodyLines) => `## Abstract\n\n${bodyLines}\n\n## References\n\n[1] x.\n`;
let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log(`  FAIL  ${name}`); } };
const kinds = (md, reg) => findings(md, reg).map((f) => `${f.kind}:${f.row?.print ?? f.print}`);

const REG = [
  'id\tprinted\trelation\trelated_to\tgloss',
  'broad\t1,921\troot\t\tthe corpus',
  'sub\t1,836\tsubset\tbroad\tthose it could read',
].join('\n');

// 1. Everything the registry declares is printed -> silence. The direction that matters more:
//    a checker firing on a paper that already obeys gets muted the same week, and a muted checker
//    is indistinguishable from an absent one.
check('a registry that matches the body is silent', kinds(doc(
  'The resolver ran over all 1,921 repositories, and read 1,836 of them.'
), REG).length === 0);

// 2. A registry row for a quantity the paper no longer prints. The registry shrinks when the
//    paper does; a row nobody removed is a claim nobody can check.
check('stale registry row fires', kinds(doc(
  'The resolver ran over all 1,921 repositories.'
), REG).includes('stale:1,836'));

// 3. ...but a row explicitly marked `retired` is exempt — that is what the marker is FOR.
//    Without this the only way to keep a set declared after cutting it from the paper would be
//    to delete the row, which loses the record.
check('a retired row does not fire', !kinds(doc(
  'The resolver ran over all 1,921 repositories.'
), REG + '\ngold\t7,310\tretired\t\ta public gold set').includes('stale:7,310'));

// 4. A relation pointing at an id that does not exist. Purely a defect of the TSV: the row claims
//    a parent that is not a row. This is why the check stayed a script — there is nothing in the
//    paper to point a finding at.
check('dangling related_to fires', findings(
  doc('We read 1,836 repositories.'),
  'id\tprinted\trelation\trelated_to\tgloss\nsub\t1,836\tsubset\tnosuch\tx'
).some((f) => f.kind === 'badref'));

// 5. `badref` is reached only for a quantity the body actually prints: a row whose number is
//    absent is `stale`, and reporting both about one row would double-count it.
check('a row that is absent is stale, not badref', kinds(
  doc('Nothing numeric here.'),
  'id\tprinted\trelation\trelated_to\tgloss\nsub\t1,836\tsubset\tnosuch\tx'
).join() === 'stale:1,836');

// 6. `printed()` boundaries, tested through BEHAVIOUR: 189 must not count as printed inside 1,189.
//    Without the guard the row would be considered present and `stale` would go quiet — a silent
//    loss, which is the failure mode this file exists to prevent. (The deleted case asserted the
//    same property against a hand-copied regex, and a mutation of the real one survived it.)
check('189 is not "printed" inside 1,189', kinds(
  doc('A follow-up read covered 1,189 records.'),
  'id\tprinted\trelation\trelated_to\tgloss\nbroad\t1,921\troot\t\tthe corpus\nspread\t189\tsubset\tbroad\tenumerable'
).includes('stale:189'));

// 7. bodyOf must stop at the bibliography. Appendices sit after it and are not under the page
//    limit, so a number printed only there does not reach the reader who stops at References.
check('bodyOf stops at References', !bodyOf(doc('nothing here')).includes('[1] x.'));

console.log(`population-map selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
