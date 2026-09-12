#!/usr/bin/env node
/**
 * generated-code.mjs — lint the analysis scripts BEFORE they produce a number.
 *
 *   node generated-code.mjs <paper-dir>              report
 *   node generated-code.mjs <paper-dir> --flags-only for hooks and pre-commit
 *
 * Ported from `check_generated_code.py` in MedSci Skills (Nam, Jeong & Kim, arXiv:2606.09500v4,
 * tag v3.8.0), one of the twenty-one deterministic detectors that paper ships. It asks three
 * questions of a script a model wrote for you:
 *
 *   NO_SEED    it draws randomness and never seeds it, so its result is not the same twice;
 *   ABS_PATH   it hard-codes an absolute path, so it runs on exactly one machine;
 *   IN_PLACE   it opens a file for reading and later overwrites that same file, so the input to a
 *              re-run is the output of the last one and the original is gone.
 *
 * ⚠️ ON THE SOURCE. That paper's headline (27/27 deterministic versus 11/27 for an LLM reviewer)
 * does not survive its own artifact — seven of the twenty-seven defects were in files the model was
 * never shown, and one of its eleven hits is a substring match on `random` in a sentence about
 * random forests. Honest: 10/27, and 10/20 on what the model could see. See
 * `the author's private research notes` §2.4. None of that
 * touches whether these three questions are worth asking; they are, and nothing here asked them.
 *
 * ── 🔴 THE BOUNDARY WITH check-anon.sh, WHICH IS NOT A DUPLICATE ──────────────────────────────
 *
 * `repro/check-anon.sh` category 5 greps for `/home/`, `/Users/`, `/workspace/`, `/root/` too, and
 * the two look identical until you ask WHAT each one reads and WHEN:
 *
 *   check-anon.sh cat. 5 — reads the SHIPPED BUNDLE (`repro/artifact-anon/`) at release time, and
 *                          its question is DISCLOSURE: does the reviewer's copy leak the author's
 *                          machine layout and therefore their identity? A hard-coded path that is
 *                          never shipped is none of its business.
 *   this check           — reads the WORKING TREE's generated scripts, before they run, and its
 *                          question is REPRODUCIBILITY: will this script do anything at all on
 *                          somebody else's disk? A path scrubbed out of the bundle by hand is
 *                          still a script only one machine can execute.
 *
 * They therefore scan DISJOINT trees on purpose: the bundle is excluded here, and this exclusion is
 * printed in the ignore ledger below rather than being a silent line in a glob. If they overlapped,
 * one of them should be deleted.
 *
 * 🔴 AND THE SAME FALSE-POSITIVE DISCIPLINE AS THE REVERSE COVERAGE LEG. `repro/` is mostly not
 * analysis code, so an ignore set is unavoidable — and an ignore set applied in silence is how a
 * check becomes a green light. Every structural rule prints the names it swallowed, and
 * `repro/generated-code-grandfathered.txt` prints every row and every reason, on every run,
 * findings or none. Same reasoning as `check_grandfather` in `repro/paper_numbers.py`.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const flagsOnly = args.includes('--flags-only');
if (!dir) { console.error('usage: node generated-code.mjs <paper-dir> [--flags-only]'); process.exit(0); }

// ── WHERE repro/ IS ────────────────────────────────────────────────────────────────────────────
// 🔴 `repro/` is NOT always directly under the paper directory. `<paper-e>` keeps it at
// `typed-shell/repro/`, and the first version of this line was `join(dir, 'repro')` followed by a
// bare `process.exit(0)`. Measured 2026-08-26: run against that paper's own directory this check
// printed NOTHING and exited 0 — indistinguishable from a clean paper — while EIGHTEEN ABS_PATH
// findings sat one level below, among them `<papers-root>/<paper-c>/…`
// hard-coded inside a reproduction script. Same class the `numbers` job documents about itself
// (`for d in <papers-root>/*/repro`) and the same class as the `artifact/reproduce.py` skip:
// A GUARD THAT TESTS FOR A FILENAME RATHER THAN FOR THE JOB.
//
// Two changes, and the second matters more than the first: the root is now also looked for one
// level down, and "no repro/ anywhere" SAYS SO instead of exiting in silence. Silence has to mean
// "scanned and clean", never "did not look".
const nested = existsSync(dir)
  ? readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      .map((e) => join(dir, e.name, 'repro'))
      .filter(existsSync)
  : [];
const roots = [join(dir, 'repro'), ...nested].filter(existsSync);
if (!roots.length) {
  if (!flagsOnly)
    console.log(`🧪 generated-code — 0 finding(s) in ${dir}\n   NOTHING WAS SCANNED: no repro/ here or one level below. ` +
      'That is not the same as clean, and this line exists because the silent exit that used to stand here hid 18 findings');
  process.exit(0);
}
const repro = roots[0];

// ── scope ──────────────────────────────────────────────────────────────────────────────────────
// Depth 3 under repro/ is where this project's analysis code lives: `repro/<experiment>/script.mjs`
// and `repro/<experiment>/lib/…`, plus `repro/<experiment>/generated/…`, which holds the checkers a
// model synthesised and is the most literal reading of "generated code" there is. Below that are
// fixtures, working clones and raw transcripts; going deeper buys tens of thousands of files and no
// analysis. This is a SCOPE and therefore a blind spot, and it is printed as one.
const EXT = /\.(py|mjs|cjs|js)$/;
const MAX_DEPTH = 3;
const swallowed = new Map([
  ['the released bundle — `check-anon.sh` cat. 5 owns it, and it asks a different question there ' +
   '(does it leak an identity, not will it run elsewhere)', []],
  ['dependency, VCS and build trees (node_modules, .git, __pycache__, dot-directories)', []],
  [`nested deeper than ${MAX_DEPTH} levels under repro/ — fixtures, working clones, raw transcripts`, []],
  // The allow file is per repro root, so this check reads ONE. A paper carrying two would have the
  // second read by nobody, and an unread tree has to be a name you can count, not an absence.
  ['a SECOND repro/ root under this paper directory — this check reads one, and the allow file is ' +
   'scoped to it; run the check against that directory to cover the other', []],
]);
const RULE = [...swallowed.keys()];
for (const other of roots.slice(1)) swallowed.get(RULE[3]).push(relative(dir, other));
const bundleName = ['artifact-anon', 'artifact'].find((b) => existsSync(join(repro, b)));

const files = [];
(function walk(abs, depth) {
  for (const name of readdirSync(abs)) {
    const p = join(abs, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (depth === 1 && name === bundleName) { swallowed.get(RULE[0]).push(name); continue; }
      if (name.startsWith('.') || name === 'node_modules' || name === '__pycache__') {
        swallowed.get(RULE[1]).push(relative(repro, p)); continue;
      }
      if (depth >= MAX_DEPTH) { swallowed.get(RULE[2]).push(relative(repro, p)); continue; }
      walk(p, depth + 1);
    } else if (EXT.test(name)) files.push(p);
  }
})(repro, 1);

// ── the allow file ─────────────────────────────────────────────────────────────────────────────
const allowPath = join(repro, 'generated-code-grandfathered.txt');
const allowed = new Map();
if (existsSync(allowPath)) {
  for (const line of readFileSync(allowPath, 'utf8').split('\n')) {
    const row = line.split('#')[0].trimEnd();
    if (!row.trim()) continue;
    // The key is TWO fields, path and kind. The first draft took only the first field, so every
    // row silenced nothing and the two real allowances came back as findings AND as stale rows —
    // caught because the run printed both at once, which is the argument for printing the ledger.
    const [path, kind, ...rest] = row.split('\t').map((c) => c.trim());
    if (path && kind) allowed.set(`${path}\t${kind}`, rest.filter(Boolean).join(' — ') || '(NO REASON GIVEN)');
  }
}

// ── the three rules ────────────────────────────────────────────────────────────────────────────
// Whole-line comments are stripped first. Not inline ones: `p = "/home/me/x"  # fixme` is still a
// hard-coded path, and a rule that lets a trailing comment disarm it is worse than no rule.
const strip = (s) => s.replace(/^\s*#.*$/gm, '').replace(/^\s*\/\/.*$/gm, '');

const DRAWS = /(?:\brandom\.(?:random|sample|shuffle|choice|choices|randint|randrange|uniform)|\bnp\.random\.|\bnumpy\.random\.|\bMath\.random\s*\(|\brandom_state\b|\bcrypto\.randomBytes\s*\()/;
// 🔴 NO LEADING \b ON THIS ALTERNATION. The first draft opened with `\b(?:…|--seed|…)`, and `\b`
// before a hyphen never matches after a quote — so `"--seed"` in an argparse call was invisible and
// `spotcheck-census.py`, which seeds properly and takes `--seed` on the command line, was reported.
// Found by reading the one file the rule accused, which is the only way this class is ever found.
const SEEDS = /(?:random\.seed|np\.random\.seed|numpy\.random\.seed|default_rng\s*\(\s*\d|\bseed\s*=\s*\d|--seed|\bSEED\b|Random\s*\(\s*[\w.]+\s*\)|seedrandom|mulberry32|splitmix)/;
// Anchored and case-sensitive, for the reasons check-anon.sh cat. 5 documents at length: without
// the anchor a third party's relative `src/workspace/x` matches, and without case-sensitivity an
// Express route `/users/export` matches `/Users/`.
const ABS = /(?<![\w./-])(?:\/home\/|\/Users\/|\/workspace\/|\/root\/|[A-Z]:\\\\?[A-Za-z])/;

// IN_PLACE is deliberately LITERAL — the same quoted path, or the same argv element, read and then
// written. It is a textual check and not dataflow: a path held in a variable is invisible to it.
// The first draft matched the OPERAND EXPRESSION instead (`open(p)` … `open(p, "w")`) and produced
// seventeen hits on this repository, essentially all of them a variable named `file` or `p` reused
// across two unrelated loops, plus `path.join(HERE` truncated at the comma by the regex. A checker
// whose findings are mostly noise is muted within a day; precision is the only affordable choice
// here, and the recall it costs is written down in the blind-spot list at the bottom.
const READS = [
  /open\(\s*(['"])([^'"]+)\1\s*(?:,\s*(['"])r[b+]*\3\s*)?\)/g,
  /readFileSync\(\s*(['"])([^'"]+)\1/g,
  /Path\(\s*(['"])([^'"]+)\1\s*\)\s*\.read/g,
  /open\(\s*((?:sys\.argv|process\.argv)\[\d\])\s*\)/g,
];
const WRITES = [
  /open\(\s*(['"])([^'"]+)\1\s*,\s*['"][wa]/g,
  /writeFileSync\(\s*(['"])([^'"]+)\1/g,
  /Path\(\s*(['"])([^'"]+)\1\s*\)\s*\.write/g,
  /open\(\s*((?:sys\.argv|process\.argv)\[\d\])\s*,\s*['"][wa]/g,
];
const operands = (code, res) => {
  const s = new Set();
  for (const re of res) for (const m of code.matchAll(re)) s.add(m[2] ?? m[1]);
  return s;
};

const findings = [];
const ignored = [];
const hitFiles = new Set();
for (const f of files.sort()) {
  const rel = relative(dir, f);
  const src = readFileSync(f, 'utf8');
  const code = strip(src);
  const raise = (kind, detail) => {
    const key = `${relative(repro, f)}\t${kind}`;
    // An allow row is per FILE AND KIND: silencing `ABS_PATH` in a script must not also silence a
    // missing seed in it. A bare filename row silences the file entirely and is spelled that way.
    const reason = allowed.get(key) ?? allowed.get(`${relative(repro, f)}\t*`);
    if (reason !== undefined) { ignored.push([`${relative(repro, f)} · ${kind}`, reason]); return; }
    hitFiles.add(rel);
    findings.push(`${kind.padEnd(9)} ${rel} — ${detail}`);
  };

  if (DRAWS.test(code) && !SEEDS.test(src))
    raise('NO_SEED', `draws randomness (\`${code.match(DRAWS)[0]}\`) and never seeds it: two runs, two answers, ` +
      'and the number in the paper came from one of them');

  // 🔴 `ABS.flags`, not a literal 'g'. The first version passed 'g' alone, which silently DROPPED
  // the case-sensitivity that keeps an Express route `/users/export` from matching `/Users/` —
  // so the property the harness asserts lived nowhere the harness could reach it. Found by the
  // mutations file: adding an `i` to ABS changed no verdict, i.e. a mutation that did not mutate.
  const abs = code.match(new RegExp(ABS.source + '[^\\s\'"`)\\],]*', ABS.flags + 'g'));
  if (abs)
    raise('ABS_PATH', `hard-codes ${abs.length} absolute path(s), e.g. \`${abs[0]}\` — it runs on one machine. ` +
      'Distinct from check-anon cat. 5, which asks whether the SHIPPED bundle leaks a layout');

  const both = [...operands(code, READS)].filter((p) => operands(code, WRITES).has(p));
  if (both.length)
    raise('IN_PLACE', `reads and then overwrites \`${both.join('`, `')}\` — after one run the input is gone and ` +
      'a re-run is computing on its own output');
}

// stale allowances, the same property `check_grandfather` keeps: a list that never shrinks is a list
// nobody reads.
const live = new Set();
for (const f of files) for (const k of ['NO_SEED', 'ABS_PATH', 'IN_PLACE', '*']) live.add(`${relative(repro, f)}\t${k}`);
for (const key of allowed.keys())
  if (!live.has(key))
    findings.push(`STALE_ALLOW  the allow row \`${key.replace('\t', ' · ')}\` names no script under repro/ — ` +
      'retire it rather than leave it to rot');

// ── output ─────────────────────────────────────────────────────────────────────────────────────
const ledger = [
  '',
  `   ── what this check ignored, in full (${files.length} scripts scanned under repro/) ──`,
  '   Printed on every run, findings or none. An ignore set nobody sees turns a check into a green',
  '   light; the uncovered set has to be a list you can count. Same discipline as check_grandfather',
  '   in repro/paper_numbers.py.',
];
for (const [rule, names] of swallowed) {
  ledger.push(`   • ${names.length} tree(s) not entered — ${rule}`);
  if (names.length) ledger.push(`       ${names.slice(0, 8).join(', ')}${names.length > 8 ? ` … and ${names.length - 8} more` : ''}`);
}
ledger.push(`   • ${ignored.length} row(s) in repro/generated-code-grandfathered.txt — every row, every reason:`);
for (const [key, reason] of ignored) ledger.push(`       ${key}  →  ${reason}`);
if (!ignored.length) ledger.push('       (nothing is being waved through)');
ledger.push(
  `   • ${hitFiles.size} script(s) reported above.`,
  '',
  '   🔴 WHAT THIS CHECK IS SILENT ABOUT:',
  '   — a path held in a VARIABLE. IN_PLACE matches literals and argv elements only; `p = f"{d}/x";',
  '     open(p); open(p, "w")` passes. Dataflow would catch it and would also have produced seventeen',
  '     false positives on this repository, which is why it is not here.',
  '   — a seed that is set but not RECORDED. A script can seed from the clock and satisfy NO_SEED.',
  '   — anything below the depth limit, and any language that is not Python or JavaScript.',
  '   — WHETHER THE SCRIPT IS CORRECT. Every rule here is about whether it runs the same way twice,',
  '     which is a different and much weaker question.',
);

const header = `🧪 generated-code — ${findings.length} finding(s) in ${dir}`;
if (findings.length) {
  const out = flagsOnly ? console.error : console.log;
  out(header);
  findings.forEach((f) => out('   ' + f));
  ledger.forEach((l) => out(l));
  process.exit(1);
}
if (!flagsOnly) {
  console.log(header);
  console.log('   every analysis script seeds its randomness, names only relative paths, and does not clobber its input');
  ledger.forEach((l) => console.log(l));
}
