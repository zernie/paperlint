/**
 * generated-code.harness.mjs — the linter that reads the analysis scripts BEFORE they produce a
 * number, handed scripts that carry each defect it claims to catch.
 * `npx vigiles test .claude/skills/paper-pipeline/scripts/generated-code.harness.mjs`.
 *
 * WHY. `repro/` is full of scripts a model wrote, and until now nothing asked whether any of them
 * would run twice the same way or run at all on another machine. Ported from
 * `check_generated_code.py` in MedSci Skills (arXiv:2606.09500v4, tag v3.8.0): no random seed, a
 * hard-coded absolute path, an in-place overwrite of the script's own input.
 *
 * 🔴 The three rules are cheap enough that the interesting failure mode is not missing a defect but
 * FIRING ON CORRECT CODE — a checker that cries wolf is muted within a day, and a muted checker is
 * indistinguishable from one that was never written. So every rule here is asserted in BOTH
 * directions, and the quiet cases are the ones that were hardest to get right: `--seed` in an
 * argparse call, a write-only script, a variable reused across two unrelated loops.
 *
 * The ignore set gets its own assertions too. It is the part of this design that can silently
 * neuter the whole check, so: it prints on a clean run, it prints every reason, an allowance is
 * scoped to one KIND rather than to a file, and a row naming nothing is reported.
 *
 * 🔴 Assertions run at MODULE TOP LEVEL — `vigiles test` imports the file and treats "did not
 * throw" as a pass, so an exported test object would report ✓ having run nothing.
 *
 * Every fixture is a throwaway in a temp dir; no real script is read or written.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { consumerRoot } from "./consumer.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT =
  consumerRoot();
const SCRIPT = join(HERE, "generated-code.mjs");
const tmp = mkdtempSync(join(tmpdir(), "genrated-code-harness-"));
let n = 0;

function run(dir, flagsOnly = true) {
  const argv = flagsOnly ? [SCRIPT, dir, "--flags-only"] : [SCRIPT, dir];
  try {
    return {
      code: 0,
      out: execFileSync("node", argv, {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}

/**
 * `scripts` is {relative-path-under-repro: source}; `allow` is the grandfather file's content.
 * `at` is where the repro root sits relative to the paper dir — `"repro"` for every paper but one.
 * `<paper-e>` keeps it at `typed-shell/repro`, and that is not a curiosity: pointing this
 * check at that paper used to print nothing at all. `at: null` builds a paper with NO repro root.
 */
function fixture({ scripts = {}, allow = null, bundle = {}, at = "repro" }) {
  const d = join(tmp, `f${++n}`);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "paper.md"), "## 1. x\n\nprose\n");
  if (at === null) return d;
  mkdirSync(join(d, at), { recursive: true });
  for (const [p, src] of Object.entries(scripts)) {
    mkdirSync(join(d, at, dirname(p)), { recursive: true });
    writeFileSync(join(d, at, p), src);
  }
  for (const [p, src] of Object.entries(bundle)) {
    mkdirSync(join(d, at, "artifact-anon", dirname(p)), { recursive: true });
    writeFileSync(join(d, at, "artifact-anon", p), src);
  }
  if (allow !== null)
    writeFileSync(join(d, at, "generated-code-grandfathered.txt"), allow);
  return d;
}

// ── 1. NO_SEED fires ───────────────────────────────────────────────────────────────────────────
{
  const r = run(
    fixture({
      scripts: {
        "sample.py":
          "import random\nrows = random.sample(all_rows, 30)\nprint(rows)\n",
      },
    }),
  );
  assert.match(
    r.out,
    /NO_SEED\s+repro\/sample\.py — draws randomness \(`random\.sample`\) and never seeds it/,
    "a sampling script with no seed passed: the paper's number came from one draw of a die nobody can\n" +
      "re-roll, and nothing said so:\n" +
      r.out,
  );
  assert.equal(r.code, 1, "it reported NO_SEED and still exited 0");
}

// ── 2. NO_SEED stays quiet when the script seeds ───────────────────────────────────────────────
// Two spellings, both live in this repository. The `--seed` one is a REGRESSION TEST: the first
// draft of the seed pattern opened with `\b`, which never matches before a hyphen preceded by a
// quote, so `"--seed"` inside argparse was invisible and a correctly-seeded script was accused.
{
  for (const [name, src] of [
    [
      "explicit",
      "import random\nrandom.seed(7)\nrows = random.sample(all_rows, 30)\n",
    ],
    // 🔴 THIS FIXTURE WAS VACUOUS IN ITS FIRST FORM and the mutations file caught it. It drew with
    // `rnd.sample(...)` off a local `random.Random(...)`, which the DRAWS pattern does not recognise
    // as a draw at all — so the case passed because NOTHING was detected, not because the seed was.
    // Neutering the `--seed` alternation changed no verdict. It now draws with `np.random.choice`,
    // which DRAWS does recognise, and is seeded ONLY through the command-line flag, so the argparse
    // alternation is the single thing standing between this script and a finding.
    [
      "argparse",
      'import argparse, numpy as np\nap = argparse.ArgumentParser()\nap.add_argument("--seed", type=int, default=7)\nrng = np.random.default_rng(ap.parse_args().seed)\nrows = np.random.choice(all_rows, 30)\n',
    ],
  ]) {
    const r = run(fixture({ scripts: { "s.py": src } }));
    assert.equal(
      r.code,
      0,
      `a properly seeded script (${name}) was reported as unseeded — this is the false positive\n` +
        "that gets the whole check switched off:\n" +
        r.out,
    );
  }
}

// ── 3. ABS_PATH fires, and names the path ──────────────────────────────────────────────────────
{
  const r = run(
    fixture({
      scripts: {
        "wc.py":
          'text = open("/home/example/papers/paper.md").read()\nprint(len(text.split()))\n',
      },
    }),
  );
  assert.match(
    r.out,
    /ABS_PATH\s+repro\/wc\.py — hard-codes 1 absolute path\(s\), e\.g\. `\/home\/example\/papers\/paper\.md`/,
    "a script that only runs on its author's laptop shipped in the reproduction directory unremarked:\n" +
      r.out,
  );
}

// ── 4. ABS_PATH stays quiet on the two strings that look like paths and are not ─────────────────
// Both guards are lifted from `check-anon.sh` cat. 5, which learned them the hard way: without
// case-sensitivity an Express route `/users/export` matches `/Users/`; without the left anchor a
// third party's RELATIVE `src/pages/workspace/AGENTS.md` matches `/workspace/`.
{
  const r = run(
    fixture({
      scripts: {
        "routes.js":
          'app.get("/users/export", h);\nconst p = "src/pages/workspace/AGENTS.md";\n',
      },
    }),
  );
  assert.equal(
    r.code,
    0,
    "a lowercase route and a relative third-party path were reported as absolute local paths:\n" +
      r.out,
  );
}

// ── 5. IN_PLACE fires on a literal path read then overwritten ──────────────────────────────────
{
  const r = run(
    fixture({
      scripts: {
        "clean.py":
          'rows = open("data/census.tsv").read().splitlines()\nout = [r for r in rows if r]\nopen("data/census.tsv", "w").write("\\n".join(out))\n',
      },
    }),
  );
  assert.match(
    r.out,
    /IN_PLACE\s+repro\/clean\.py — reads and then overwrites `data\/census\.tsv`/,
    "a script that clobbers its own input passed: after one run the original is gone and a re-run\n" +
      "computes on the last run's output:\n" +
      r.out,
  );
}

// ── 6. IN_PLACE fires on argv, the classic form ────────────────────────────────────────────────
{
  const r = run(
    fixture({
      scripts: {
        "fix.py":
          'import sys\ns = open(sys.argv[1]).read()\nopen(sys.argv[1], "w").write(s.replace("a", "b"))\n',
      },
    }),
  );
  assert.match(
    r.out,
    /IN_PLACE\s+repro\/fix\.py — reads and then overwrites `sys\.argv\[1\]`/,
    "the argv form of an in-place rewrite was not caught:\n" + r.out,
  );
}

// ── 7. IN_PLACE stays quiet on read-here-write-there, and on a reused variable name ─────────────
// 🔴 The second fixture is the one that decided the rule's shape. Matching the OPERAND EXPRESSION
// instead of the literal produced seventeen hits on the live repository, essentially all of them a
// variable called `file` or `p` reused across two unrelated loops. The rule is textual and literal
// on purpose, and the recall that costs is written into the check's own blind-spot list.
{
  const r = run(
    fixture({
      scripts: {
        "stats.py":
          'rows = open("data/rows.tsv").read()\nopen("data/summary.tsv", "w").write(rows.upper())\n',
        "loops.mjs":
          'for (const file of inputs) read(readFileSync(file));\nfor (const file of outputs) writeFileSync(file, "x");\n',
      },
    }),
  );
  assert.equal(
    r.code,
    0,
    "a script that reads one file and writes another was reported as clobbering its input,\n" +
      "or a variable name reused across two loops was mistaken for dataflow:\n" +
      r.out,
  );
}

// ── 8. the bundle is NOT scanned — the boundary with check-anon.sh, asserted ────────────────────
// 🔴 The two checks grep the same four prefixes and would be a duplicate if they read the same
// tree. They do not: check-anon reads the SHIPPED bundle and asks whether it leaks a machine
// layout; this reads the WORKING tree and asks whether the script is portable. If this assertion
// ever fails, one of the two checks should be deleted rather than both kept.
{
  // Silence asserted through --flags-only rather than through the header's count, so that this case
  // tests the EXCLUSION and not the count. Sharing the count assertion with case 11 made a mutation
  // of the header land here instead, which reads as an off-target kill and hides which property
  // actually failed.
  const r = run(
    fixture({ bundle: { "leak.py": 'open("/home/example/secret.tsv")\n' } }),
    false,
  );
  assert.doesNotMatch(
    r.out,
    /ABS_PATH/,
    "generated-code reported an absolute path inside the RELEASED bundle. That is check-anon.sh cat. 5's\n" +
      "question, and two checks answering it is one check too many:\n" +
      r.out,
  );
  assert.match(
    r.out,
    /the released bundle — `check-anon\.sh` cat\. 5 owns it/,
    "the bundle was skipped and the ledger did not say so, which makes the boundary invisible:\n" +
      r.out,
  );
}

// ── 9. an allow row is scoped to ONE KIND, not to the file ─────────────────────────────────────
// 🔴 The design point. Waving through a hard-coded path in a script must not also wave through a
// missing seed in that same script; that is how one justified exemption becomes a file nobody
// checks. The fixture carries BOTH defects and allows only one.
{
  const src =
    'import random\nrows = random.sample(open("/home/example/x.tsv").read().split(), 3)\n';
  const r = run(
    fixture({
      scripts: { "both.py": src },
      allow: "both.py\tABS_PATH\tit is this checker's own pattern\n",
    }),
    false,
  );
  assert.doesNotMatch(
    r.out,
    /ABS_PATH\s+repro\/both\.py/,
    "the allowed kind still fired:\n" + r.out,
  );
  assert.match(
    r.out,
    /NO_SEED\s+repro\/both\.py/,
    "allowing ABS_PATH in a file also silenced its unseeded sampling. An allowance scoped to a FILE is\n" +
      "how an ignore list stops being an ignore list and starts being a hole:\n" +
      r.out,
  );
  assert.match(
    r.out,
    /both\.py · ABS_PATH\s+→\s+it is this checker's own pattern/,
    "the allowance was applied and its reason was not printed — an invisible ignore set is the failure\n" +
      "this whole design is arranged around:\n" +
      r.out,
  );
}

// ── 10. a row naming nothing on disk is reported ────────────────────────────────────────────────
{
  const r = run(
    fixture({
      scripts: { "ok.py": "print(1)\n" },
      allow: "deleted.py\tNO_SEED\tgone\n",
    }),
  );
  assert.match(
    r.out,
    /STALE_ALLOW\s+the allow row `deleted\.py · NO_SEED` names no script under repro\//,
    "a row for a script that no longer exists sat unreported, so the list never shrinks:\n" +
      r.out,
  );
}

// ── 11. the ledger prints on a CLEAN run, and the header states the count ───────────────────────
// The count matters beyond tidiness: `run-mechanical.mjs` reads this check in `flags` mode, where
// it prefers a stated count and otherwise COUNTS OUTPUT LINES. The ledger is ~20 lines that are not
// findings, so without the stated count a clean paper would be recorded as twenty findings.
{
  const r = run(
    fixture({
      scripts: {
        "ok.py": "import random\nrandom.seed(1)\nprint(random.random())\n",
      },
    }),
    false,
  );
  assert.equal(r.code, 0, "the clean fixture is not clean:\n" + r.out);
  assert.match(
    r.out,
    /—\s*0\s+finding\(s\)/,
    "a clean run does not state `— 0 finding(s)`, so run-mechanical counts the ledger's lines and records\n" +
      "a clean paper as a pile of findings:\n" +
      r.out,
  );
  assert.match(
    r.out,
    /what this check ignored, in full \(1 scripts scanned under repro\/\)/,
    "no ignore ledger on a clean run — silence then reads as coverage:\n" +
      r.out,
  );
  assert.match(
    r.out,
    /\(nothing is being waved through\)/,
    "an empty allow file printed nothing, which is indistinguishable from not reading it:\n" +
      r.out,
  );
  // …and --flags-only stays silent, because a hook that speaks when nothing is wrong gets removed.
  const q = run(fixture({ scripts: { "ok.py": "print(1)\n" } }));
  assert.equal(
    q.out.trim(),
    "",
    "--flags-only printed something about a clean tree:\n" + q.out,
  );
}

// ── 12. KNOWN GAP, asserted so it stays visible ────────────────────────────────────────────────
// 🔴 A path held in a variable defeats IN_PLACE. This is the price paid for precision in case 7 and
// it is written into the check's own output; asserting the CURRENT behaviour so that when the rule
// learns dataflow, this flips and must be updated.
{
  const r = run(
    fixture({
      scripts: {
        "var.py":
          'p = "data/rows.tsv"\ns = open(p).read()\nopen(p, "w").write(s)\n',
      },
    }),
  );
  assert.equal(
    r.code,
    0,
    "IN_PLACE now follows a path through a variable — good; update this assertion and case 7",
  );
}

// ── 13. a repro/ ONE LEVEL DOWN is found — the input that was invisible ────────────────────────
// 🔴 The defect this case exists for, measured 2026-08-26. `<paper-e>` keeps its
// reproduction code at `typed-shell/repro/`. Run against the paper directory, this check used to
// print NOTHING and exit 0 — which reads as a clean paper — while eighteen ABS_PATH findings sat
// one level below, including a reproduction script hard-coding a path into ANOTHER paper's
// directory. A guard that tests for a filename rather than for the job; the same class the
// `numbers` CI job documents about itself and the same class as the skipped `artifact/reproduce.py`.
{
  // Фикстура нейтральна НАМЕРЕННО: здесь стоял `/home/example/x.tsv` и метка `typed-shell/repro` —
  // домашний каталог с именем владельца и имя нашей статьи в тестовых данных. Проверка от этого не
  // зависит: ей нужен ЛЮБОЙ абсолютный путь.
  const r = run(
    fixture({
      at: "some-paper/repro",
      scripts: { "wc.py": 'open("/home/example/x.tsv").read()\n' },
    }),
  );
  assert.match(
    r.out,
    /ABS_PATH\s+some-paper\/repro\/wc\.py/,
    "a repro/ one level below the paper directory was not scanned. That is not a missed finding, it is a\n" +
      "SILENT missed directory — the run looks exactly like a clean paper:\n" +
      r.out,
  );
  assert.equal(
    r.code,
    1,
    "the nested tree was scanned, findings were reported, and it still exited 0",
  );
}

// ── 14. no repro/ ANYWHERE says so, instead of exiting in silence ──────────────────────────────
// The half that matters more. Silence has to mean "scanned and clean"; if it can also mean "did not
// look", then every clean report in this pipeline is worth nothing. `--flags-only` still stays
// quiet, because a hook that speaks when it has nothing to say is removed within a day.
{
  const r = run(fixture({ at: null }), false);
  assert.equal(r.code, 0, "a paper with no repro/ is not an error:\n" + r.out);
  assert.match(
    r.out,
    /NOTHING WAS SCANNED: no repro\/ here or one level below/,
    "a paper with no repro/ produced no output at all, so 'nothing to check' and 'checked, all clean' are\n" +
      "the same observation:\n" +
      r.out,
  );
  const q = run(fixture({ at: null }));
  assert.equal(
    q.out.trim(),
    "",
    "--flags-only spoke about a paper it had nothing to say about:\n" + q.out,
  );
}

// ── 15. a SECOND repro/ root is named in the ledger rather than silently dropped ────────────────
// The allow file is scoped to one root, so this check reads one. That is a defensible scope and an
// indefensible silence: an unread tree has to be a name you can count.
{
  const d = fixture({ scripts: { "ok.py": "print(1)\n" } });
  mkdirSync(join(d, "sub", "repro"), { recursive: true });
  writeFileSync(
    join(d, "sub", "repro", "leak.py"),
    'open("/home/example/x.tsv")\n',
  );
  const r = run(d, false);
  assert.match(
    r.out,
    /1 tree\(s\) not entered — a SECOND repro\/ root/,
    "a second repro/ root under the paper directory was dropped without being named, which is the ignore\n" +
      "set becoming invisible again:\n" +
      r.out,
  );
  assert.match(
    r.out,
    /sub\/repro/,
    "the second root was counted but not named:\n" + r.out,
  );
}

rmSync(tmp, { recursive: true, force: true });
console.log(
  "✓ generated-code: unseeded randomness, a hard-coded absolute path and an in-place overwrite (literal and argv) " +
    "each fire; a seeded script, a lowercase route, a relative third-party path, a read-here-write-there script and a reused " +
    "variable name all stay quiet; the released bundle is left to check-anon; allowances are per-kind, printed, and reported " +
    "when stale; the ledger prints on a clean run and the header states its count; a repro/ one level down is found, " +
    "a paper with none says so instead of exiting silent, and a second root is named; 1 known gap recorded",
);
