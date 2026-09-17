/**
 * artifact-coverage.harness.mjs — the gate that asks whether the RELEASED bundle holds the data the
 * paper points at, handed a bundle that does not. `npx vigiles test .claude/skills/paper-pipeline/scripts/artifact-coverage.harness.mjs`.
 *
 * WHY. On 2026-08-06, hours before a submission, the released bundle held NO DATA for the section
 * the abstract leads with. Six `harden-paper` passes and five review panels had not caught it, and
 * none of them was broken — they were asking different questions. The anonymity gate asks whether
 * anything leaks. The numbers gate asks whether a printed number matches its data file. The artifact
 * reviewer asks whether the code runs. A MISSING DIRECTORY passes all three: nothing leaks, nothing
 * mismatches, and everything present still runs.
 *
 * That makes this checker the only thing in the pipeline looking at absence, which makes its silence
 * the most expensive silence we have. Hence both directions below: it fires on a bundle missing the
 * data, and it is quiet on a complete one — including on `owner/repo` strings, which a paper about
 * repositories prints by the dozen and which the first version reported as missing directories.
 *
 * 🔴 Assertions run at MODULE TOP LEVEL — `vigiles test` imports the file and treats "did not throw"
 * as a pass, so an exported test object would report ✓ having run nothing.
 *
 * Every fixture is a throwaway in a temp dir; no real paper or bundle is read or written.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { consumerRoot } from "./consumer.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = consumerRoot();
const SCRIPT = join(HERE, "artifact-coverage.mjs");
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "artifact-harness-")));

function run(dir, flagsOnly = true) {
  const argv = flagsOnly ? [SCRIPT, dir, "--flags-only"] : [SCRIPT, dir];
  try {
    const out = execFileSync("node", argv, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}

/**
 * A paper whose §4.2 reports a figure, plus a bundle. `index` is NUMBERS.md's content (null means
 * the bundle ships no index at all); `files` are paths created inside the bundle.
 */
function fixture(name, { index, files = [], bundle = true, paperExtra = "", readme = null, runs = [], allow = null, bundleFiles = [] }) {
  const d = join(tmp, name);
  mkdirSync(d, { recursive: true });
  writeFileSync(
    join(d, "paper.md"),
    [
      "## Abstract", "", "Prose.", "",
      "## 4. Results", "", "Lead-in prose for the section.", "",
      "### 4.1 Setup", "", "Nothing numeric here.", "",
      "### 4.2 Gated runs", "", "The agent stopped and asked a human in **34 of 48** gated runs.", "",
      paperExtra, "",
      "## References", "", "[1] x.", "",
    ].join("\n"),
  );
  const b = join(d, "repro", "artifact-anon");
  if (bundle) {
    mkdirSync(b, { recursive: true });
    if (index !== null) writeFileSync(join(b, "NUMBERS.md"), index);
    if (readme !== null) writeFileSync(join(b, "README.md"), readme);
    for (const f of files) {
      mkdirSync(join(b, dirname(f)), { recursive: true });
      writeFileSync(join(b, f), "x\n");
    }
    for (const f of bundleFiles) {
      mkdirSync(join(b, dirname(f)), { recursive: true });
      writeFileSync(join(b, f), "x\n");
    }
  }
  // `runs` are experiment directories in the WORKING tree — the input to the reverse leg. Each is
  // ["dir-name", ["RESULTS.md", …]]; an empty file list means a directory with no write-up.
  for (const [rname, heads] of runs) {
    mkdirSync(join(d, "repro", rname), { recursive: true });
    for (const h of heads) writeFileSync(join(d, "repro", rname, h), "x\n");
  }
  if (allow !== null) writeFileSync(join(d, "repro", "unreported-grandfathered.txt"), allow);
  return d;
}

// ── 1. the paper points at data the bundle does not contain ────────────────────────────
// §4.2 reports a figure and the index has never heard of it: the released bundle may hold nothing
// for the one experiment the abstract leads with. This is the 2026-08-06 defect, reproduced.
{
  const d = fixture("unindexed-section", { index: "# numbers → data\n- §4.1: `setup/config.json`\n", files: ["setup/config.json"] });
  const r = run(d);
  assert.match(
    r.out,
    /§4\.2 reports 1 bolded figure\(s\) and is named NOWHERE/,
    "artifact-coverage passed a bundle whose index never mentions the section carrying the paper's " +
      "headline number — absence is invisible to every other gate, which is why this one exists:\n" + r.out,
  );
  assert.equal(r.code, 1, "it reported the finding and still exited 0");
}

// ── 2. the index promises a path the bundle does not ship ──────────────────────────────
// A promise to a file that is not there is worse than no promise: it reads as released.
{
  const d = fixture("dangling-path", { index: "# numbers → data\n- §4.2: the gated runs are in `runs/gated.tsv`\n" });
  const r = run(d);
  assert.match(r.out, /the index names `runs\/gated\.tsv` and `runs` is not in the bundle/, r.out);
}

// ── 3. a bundle with no index at all ───────────────────────────────────────────────────
{
  const d = fixture("no-index", { index: null });
  const r = run(d);
  assert.match(r.out, /no NUMBERS\.md and no README\.md/, "a bundle that maps nothing to anything was accepted:\n" + r.out);
  assert.equal(r.code, 1, "it reported the finding and still exited 0");
}

// ── 4. a complete bundle produces NOTHING ──────────────────────────────────────────────
// Including the guard that keeps this checker switched on: a paper about repositories names dozens
// of `owner/repo` IN BACKTICKS, and those are not paths. Three were reported as missing directories
// on the first real run, and a checker whose findings are mostly noise gets muted — which is how the
// failure this file guards against happens a second time.
//
// 🔴 The backticks are load-bearing in this fixture, and the first version of it did not have them.
// Only backtick-quoted strings are extracted as candidate paths, so an unquoted `saleor/apps` never
// reaches the extension guard at all — the assertion looked like it was testing the guard and was
// testing nothing. Caught by deleting the guard and watching this file stay green.
{
  const d = fixture("clean", {
    index: "# numbers → data\n- §4.1: `setup/config.json`\n- §4.2: `runs/gated.tsv`, drawn from `saleor/apps`\n",
    files: ["setup/config.json", "runs/gated.tsv"],
  });
  const r = run(d);
  assert.equal(r.code, 0, "a complete bundle was failed:\n" + r.out);
  assert.equal(r.out.trim(), "", "--flags-only printed something about a complete bundle:\n" + r.out);
  // …and in report mode it says so out loud, because silence and success must not look alike.
  assert.match(run(d, false).out, /every number-reporting section is indexed, every named path exists/);
}

// ── 5. KNOWN GAP, asserted so it stays visible ─────────────────────────────────────────
// 🔴 A paper with NO bundle at all exits 0 in silence, and `run-mechanical.mjs` records that silence
// as PASS for harden-paper. The checker written because absence is invisible is itself blind to the
// largest absence there is. Asserting the CURRENT behaviour: when it learns to say "this paper
// releases nothing", the assertion flips and must be updated — that is the point of writing a gap
// down rather than leaving it as a thing somebody once noticed.
{
  const d = fixture("no-bundle", { index: null, bundle: false });
  const r = run(d);
  assert.equal(r.code, 0, "artifact-coverage now speaks up about a paper with no bundle — good; update this assertion");
  assert.equal(r.out.trim(), "", "artifact-coverage now speaks up about a paper with no bundle — good; update this assertion");
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE REVERSE LEG — a result on disk the paper never mentions (MedSci's `DISK_UNREPORTED`)
//
// Cases 1–3 all start from something the paper SAYS. This leg starts from something on DISK, which
// is the only direction that can see an experiment that was run and quietly dropped. Its silence is
// therefore even more expensive than the forward legs', so the ignore set gets as many assertions
// as the detector does.
// ══════════════════════════════════════════════════════════════════════════════════════════════

const CLEAN_INDEX = "# numbers → data\n- §4.1: `setup/config.json`\n- §4.2: `runs/gated.tsv`\n";
const CLEAN_FILES = ["setup/config.json", "runs/gated.tsv"];

// ── 6. an experiment that ran, wrote up a result, and is named nowhere ──────────────────────────
{
  const d = fixture("disk-unreported", {
    index: CLEAN_INDEX, files: CLEAN_FILES,
    runs: [["burial-curve-2026-07-28", ["RESULTS.md"]]],
  });
  const r = run(d);
  assert.match(
    r.out,
    /DISK_UNREPORTED\s+repro\/burial-curve-2026-07-28\/ holds RESULTS\.md and is named neither in the paper nor in the released index/,
    "an analysis ran, wrote up its result and is reachable from nothing the reviewer sees — that is the\n" +
      "cherry-picking case this leg was ported for, and it passed:\n" + r.out,
  );
  assert.equal(r.code, 1, "it reported DISK_UNREPORTED and still exited 0");
}

// ── 7. named in the PAPER → quiet ───────────────────────────────────────────────────────────────
{
  const d = fixture("named-in-paper", {
    index: CLEAN_INDEX, files: CLEAN_FILES,
    paperExtra: "The burial curve run (`burial-curve-2026-07-28`) found no third point.",
    runs: [["burial-curve-2026-07-28", ["RESULTS.md"]]],
  });
  const r = run(d);
  assert.equal(r.code, 0, "an experiment the paper discusses by name was reported as unmentioned:\n" + r.out);
  assert.equal(r.out.trim(), "", "…and it said so out loud:\n" + r.out);
}

// ── 8. named ONLY in the bundle's README.md → quiet ─────────────────────────────────────────────
// 🔴 THIS IS A REGRESSION TEST FOR A REAL FALSE POSITIVE, not a hypothetical. The first version
// reused check 1's `indexPath`, which resolves to NUMBERS.md *or* README.md and stops. On the live
// paper that accused the bundle of hiding three analyses (`enforcement-surface`, `ladder-prototype`,
// `tier-a-prime`) that it ships and documents — in README.md, the file the leg was not reading. A
// cherry-picking detector that cries wolf gets muted, and a muted detector is how the failure
// happens twice.
{
  const d = fixture("named-in-readme-only", {
    index: CLEAN_INDEX, files: CLEAN_FILES,
    readme: "## What is deliberately not in this bundle\n\n| `ladder-prototype-2026-07-29` | not needed |\n",
    runs: [["ladder-prototype-2026-07-29", ["RESULTS.md"]]],
  });
  const r = run(d);
  assert.equal(
    r.code, 0,
    "an analysis named in the bundle's README.md and nowhere else was reported as unmentioned — the leg is\n" +
      "reading one index file instead of all of them, which is exactly the false positive that mutes it:\n" + r.out,
  );
  // …and the same, matched by the DATE-STRIPPED slug: the bundle is rebuilt with the dates dropped,
  // so `enforcement-surface-2026-07-29` on disk is `enforcement-surface` in the index.
  const e = run(fixture("named-by-slug", {
    index: CLEAN_INDEX, files: CLEAN_FILES,
    readme: "See `enforcement-surface/` for the surface scan.\n",
    runs: [["enforcement-surface-2026-07-29", ["RESULTS.md"]]],
  }));
  assert.equal(e.code, 0,
    "an analysis the index names without its date suffix was reported as unmentioned. Every directory in\n" +
      "this project carries a -YYYY-MM-DD the rebuild drops, so without slug matching the leg accuses the\n" +
      "bundle of hiding most of what it ships:\n" + e.out);
}

// ── 9. an allow row silences it, AND the ledger prints the row with its reason ──────────────────
// The silencing is half the assertion. The other half is that the reason is PRINTED: an ignore set
// applied invisibly turns this detector into the thing it exists to catch.
{
  const d = fixture("allowed-row", {
    index: CLEAN_INDEX, files: CLEAN_FILES, bundleFiles: ["seeded-probe/RESULTS.md"],
    runs: [["seeded-probe-fixtures-2026-07-31", ["RESULTS.md"]]],
    allow: "seeded-probe-fixtures-2026-07-31\tships-as:seeded-probe\ttranslated at anonymisation\n",
  });
  const r = run(d, false);
  assert.equal(r.code, 0, "an allowed row still counted as a finding:\n" + r.out);
  assert.match(
    r.out,
    /seeded-probe-fixtures-2026-07-31\s+→\s+ships-as:seeded-probe — translated at anonymisation/,
    "the ignore row was applied and NOT printed. A hidden ignore list is how a cherry-picking detector\n" +
      "becomes a cherry-pick; the whole design turns on this line being in the output:\n" + r.out,
  );
}

// ── 10. a `ships-as:` allowance whose bundle path is gone is a finding of its own ───────────────
// This is what makes that reason different in kind from prose: it carries a witness, and the witness
// is re-checked every run. An allowance that has rotted is hiding a real absence.
{
  const d = fixture("rotted-allowance", {
    index: CLEAN_INDEX, files: CLEAN_FILES,
    runs: [["seeded-probe-fixtures-2026-07-31", ["RESULTS.md"]]],
    allow: "seeded-probe-fixtures-2026-07-31\tships-as:seeded-probe\ttranslated at anonymisation\n",
  });
  const r = run(d);
  assert.match(
    r.out,
    /claims it ships as `seeded-probe`, and that path is not in the bundle — the allowance has rotted/,
    "the allow row promised the analysis ships under another name, the bundle no longer has it, and the\n" +
      "check believed the row anyway:\n" + r.out,
  );
}

// ── 11. an allow row naming nothing on disk is reported, so the list shrinks ────────────────────
{
  const d = fixture("stale-row", {
    index: CLEAN_INDEX, files: CLEAN_FILES,
    allow: "deleted-experiment-2026-01-01\tships-as:nowhere\tgone\n",
  });
  const r = run(d);
  assert.match(
    r.out,
    /the ignore row for `deleted-experiment-2026-01-01` names no directory under repro\/ that holds a headline result/,
    "a row for a directory that no longer exists sat in the ignore file unreported — which is how the\n" +
      "list stops shrinking and starts being scenery:\n" + r.out,
  );
}

// ── 12. THE LEDGER IS PRINTED ON A CLEAN RUN TOO ────────────────────────────────────────────────
// 🔴 The load-bearing property of the whole design. If the ignore set only appeared beside findings,
// a run with nothing to report would look like coverage — which is the exact inference
// `check_grandfather` in repro/paper_numbers.py exists to block.
{
  const d = fixture("ledger-on-clean", {
    index: CLEAN_INDEX, files: CLEAN_FILES,
    paperExtra: "The burial curve run (`burial-curve-2026-07-28`) is discussed in §4.",
    runs: [["burial-curve-2026-07-28", ["RESULTS.md"]]],
    allow: "# nothing here\n",
  });
  const r = run(d, false);
  assert.equal(r.code, 0, "the clean fixture is not clean:\n" + r.out);
  assert.match(r.out, /what the reverse check ignored, in full \(1 candidate analyses under repro\/\)/,
    "a run with no findings printed no ignore ledger — silence then reads as coverage:\n" + r.out);
  assert.match(r.out, /Ratio: 0 reported as unreported, 0 deliberately ignored, 1 reachable/,
    "the ledger printed no ratio, so nobody can tell whether this check is still doing anything:\n" + r.out);
  assert.match(r.out, /\(the file is empty — nothing is being waved through\)/,
    "an empty allow file printed nothing at all, which is indistinguishable from not reading it:\n" + r.out);
}

// ── 13. the header states the finding COUNT, because run-mechanical.mjs parses it ───────────────
// `run-mechanical` reads this check in `flags` mode, where it prefers the check's own stated count
// and falls back to COUNTING OUTPUT LINES. The ledger is a dozen-odd lines that are not findings, so
// without a stated count a clean run would be recorded as a dozen findings. That regression is
// invisible in the check's own output and only shows up in the ledger, which is why it is asserted
// here, from outside, in both directions.
{
  const clean = run(fixture("count-clean", { index: CLEAN_INDEX, files: CLEAN_FILES }), false);
  assert.match(clean.out, /—\s*0\s+finding\(s\)/,
    "a clean run does not state `— 0 finding(s)`, so run-mechanical falls back to counting the ledger's\n" +
      "lines and records a clean paper as a dozen findings:\n" + clean.out);
  const dirty = run(fixture("count-dirty", {
    index: CLEAN_INDEX, files: CLEAN_FILES,
    runs: [["a-2026-01-01", ["RESULTS.md"]], ["b-2026-01-01", ["SUMMARY.json"]]],
  }), false);
  assert.match(dirty.out, /—\s*2\s+finding\(s\)/,
    "the header does not state the real finding count:\n" + dirty.out);
}

// ── 14. KNOWN GAPS of the reverse leg, asserted so they stay visible ────────────────────────────
// Both are documented in the check's own output. Asserting the CURRENT behaviour: when either
// changes, this block flips and must be updated.
{
  // (a) a directory with no write-up is invisible. Deleting RESULTS.md is a one-command way past
  //     this check, and nothing here can tell that from an experiment nobody finished.
  const d = fixture("no-writeup", {
    index: CLEAN_INDEX, files: CLEAN_FILES,
    runs: [["silent-run-2026-01-01", ["data.tsv"]]],
  });
  const r = run(d);
  assert.equal(r.code, 0, "the reverse leg now sees a run with no write-up — good; update this assertion");
  // (b) the bundle is not itself a candidate: it is the shipped copy of these same analyses, so
  //     counting it would report every one of them twice.
  const e = run(fixture("bundle-not-candidate", { index: CLEAN_INDEX, files: [...CLEAN_FILES, "RESULTS.md"] }), false);
  assert.match(e.out, /the released bundle itself \(artifact-anon\/\)/,
    "the structural ignore that skips the bundle is not named in the ledger:\n" + e.out);
  assert.match(e.out, /—\s*0\s+finding\(s\)/, "the bundle's own RESULTS.md was counted as an unreported analysis:\n" + e.out);
}

rmSync(tmp, { recursive: true, force: true });
console.log("✓ artifact-coverage: unindexed section, dangling path and missing index all fire; a complete bundle is silent; " +
  "the reverse leg fires on a result nobody reports, stays quiet on one named in the paper or in EITHER index file, " +
  "reports rotted and stale allowances, prints its whole ignore set on a clean run, and states its count; 3 known gaps recorded");
