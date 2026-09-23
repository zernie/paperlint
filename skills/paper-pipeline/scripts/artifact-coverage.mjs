#!/usr/bin/env node
/**
 * artifact-coverage.mjs — does the released bundle actually contain what the paper points at?
 *
 *   node artifact-coverage.mjs <paper-dir>            report
 *   node artifact-coverage.mjs <paper-dir> --flags-only  for hooks and pre-commit
 *
 * 🔴 WHY THIS EXISTS. On 2026-08-06, hours before a submission, the author asked a plain question —
 * "did we ever actually run the artifact?" — and the answer exposed that the released bundle held NO
 * DATA for the paper's §5.2: the agent experiment behind "stopped and asked a human in 34 of 48
 * gated runs". That result is in the ABSTRACT, it is the single reason an agent workshop is the
 * right venue for the paper, and the artifact reference promises "every data file behind the
 * numbers in this paper".
 *
 * Six `harden-paper` passes and five review panels had not caught it, and none of them was broken.
 * They were all asking a different question:
 *
 *   the anonymity gate asks   — does anything in the bundle leak an identity?
 *   the numbers gate asks     — does a printed number match its data file?
 *   the artifact reviewer asks— does the code in the bundle run?
 *   NOBODY asked              — is the data for this experiment IN THE BUNDLE AT ALL?
 *
 * A missing directory passes every one of those: nothing leaks, nothing mismatches, and everything
 * present still runs. Absence is invisible to a checker that only inspects what is there.
 *
 * The two checks below are deliberately dumb, because dumb is what survives:
 *   1. every body section that REPORTS A NUMBER is named somewhere in the artifact's index;
 *   2. every path the index names EXISTS in the bundle.
 *
 * ── 2026-08-10: THE THIRD CHECK RUNS THE OTHER WAY ────────────────────────────────────────────
 *
 * 🔴 Both checks above run FORWARD, from the paper outward, and neither can see the opposite
 * failure: a result that EXISTS ON DISK and that the paper never mentions. Ported from
 * `check_artifact_coverage.py` in MedSci Skills (Nam, Jeong & Kim, arXiv:2606.09500v4, tag
 * v3.8.0), where it is a Major verdict named `DISK_UNREPORTED` and defined as
 *
 *     "an analysis output that exists on disk … is never mentioned in the manuscript. The work was
 *      done and run but its result, which may contradict the headline, is silently absent."
 *
 * That is a CHERRY-PICKING DETECTOR, and it is the one direction no other gate in this pipeline
 * covers. `check-anon` reads the bundle. `paper_numbers` reads printed quantities. `arm_permutation`
 * reads a quantity against its arm label. Every one of them starts from something the paper says.
 * An experiment that was run and quietly dropped says nothing, so nothing looks at it.
 *
 * ⚠️ WHAT WE PORTED IS THE MECHANISM, NOT THE PAPER'S HEADLINE. That paper's 27/27-versus-11/27
 * result does not survive its own artifact: seven of the 27 defects were in files never shown to
 * the model, and one of its eleven "hits" is a substring match on the word `random` in a sentence
 * about random forests. The honest number is 10/27, and 10/20 on what the model could see. Read
 * `the author's private research notes` §2.4 before citing
 * anything from it. The DETECTOR is a good idea regardless of how its evaluation was scored.
 *
 * 🔴 FALSE POSITIVES ARE THE WHOLE DESIGN PROBLEM, AND THE ANSWER IS AN IGNORE SET YOU CAN COUNT.
 * `repro/` is mostly things nobody should ever report: fixtures, fetch caches, working clones,
 * harness scratch, per-repository dumps. So this check needs an ignore set — and an ignore set that
 * is applied silently would turn a cherry-picking detector into the very thing it exists to catch.
 * So it is PRINTED IN FULL ON EVERY RUN, findings or none, exactly as `check_grandfather` in
 * `repro/paper_numbers.py` prints the quantities the numbers gate does not cover. Two halves:
 *   — structural rules, in the code below, each one printed with the names it swallowed;
 *   — `repro/unreported-grandfathered.txt`, one row per knowingly-unreported analysis, and rows of
 *     the form `ships-as:<path>` are RE-VERIFIED against the bundle so that reason cannot rot.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  headings as mdHeadings,
  splitSections,
  requireMarkdown,
} from "../../../lib/markdown.mjs";

// Markup is parsed with a parser (`CLAUDE.md`, 2026-08-11). We fail rather than degrade: without
// the parser NOT A SINGLE section would be found in the paper, and the check "every section with a
// number is named in the artifact index" would pass clean — that is exactly the failure this file
// was written for (absence is invisible to a checker that looks only at what is present).
requireMarkdown();

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const flagsOnly = args.includes("--flags-only");
if (!dir) {
  console.error("usage: node artifact-coverage.mjs <paper-dir> [--flags-only]");
  process.exit(0);
}

const paperPath = ["paper.md", "draft.md"]
  .map((f) => join(dir, f))
  .find(existsSync);
// 🔴 A SILENT exit(0) here read as «clean» for four of five papers. Measured 2026-08-25: only
// <paper-a> has a markdown source; agenticdev/aisec/<paper-e>/scored ship
// `paper.tex`, so this checker printed NOTHING and returned 0 on the camera-ready — which has
// an artifact (reproduce.py, data/) it was built to inspect. Nothing anywhere said so, and the
// CI step mirrored the same condition, so both layers agreed to say nothing. A skip that cannot
// be told apart from a pass is the failure this whole file exists to prevent.
if (!paperPath) {
  console.error(
    `⏭️  artifact coverage SKIPPED for ${dir} — no paper.md/draft.md. This checker\n     reads markdown only; a .tex paper is NOT covered by it. Absence of findings here is\n     absence of checking, not a clean bill.`,
  );
  process.exit(0);
}

// The bundle is whatever directory the paper releases. `artifact-anon` is the anonymised one that
// actually ships; a working `repro/` is NOT the release and must never be treated as one.
const bundle = [join(dir, "repro/artifact-anon"), join(dir, "artifact")].find(
  existsSync,
);
if (!bundle) {
  console.error(
    `⏭️  artifact coverage SKIPPED for ${dir} — no repro/artifact-anon and no artifact/ directory.`,
  );
  process.exit(0);
}
const indexPath = ["NUMBERS.md", "README.md"]
  .map((f) => join(bundle, f))
  .find(existsSync);
if (!indexPath) {
  const msg = `${bundle} has no NUMBERS.md and no README.md — nothing maps the paper's numbers to its data`;
  console.error(`📦 artifact — ${msg}`);
  process.exit(1);
}

const paper = readFileSync(paperPath, "utf8").replace(/<!--[\s\S]*?-->/g, "");
const index = readFileSync(indexPath, "utf8");
const findings = [];

// ---- 1. every number-reporting section is represented in the index --------------------------
// "Reports a number" means a BOLD span containing digits — the paper's own convention for a figure
// it is asserting, as opposed to a section number or a citation. A section that merely mentions
// §4.3 in passing does not trip this.
// 2026-08-11: both the body boundary and the split into sections come from the parser. The former
// `^## ` / `^### ` counted any line with hashes as a section, including hashes inside a ```-block:
// a paper QUOTING somebody else's `## 4.2 …` in an example got an extra "section", and its bold
// numbers got a requirement to be named in the artifact index. The `-1 / >>> 0` convention is kept:
// the former expression did not treat a heading on the very first line of the file as a boundary
// either.
const freeH = mdHeadings(paper).find(
  (h) => h.depth === 2 && /^(Limitations|References|Ethical)/u.test(h.text),
);
const body = paper.slice(0, (freeH ? freeH.offset : -1) >>> 0 || paper.length);
const SECTION_NUM = /^(\d+(?:\.\d+)?)\.?\s+(.+)$/u;
const SUBSECTION_NUM = /^(\d+\.\d+)\s+(.+)$/u;
for (const chunk of splitSections(body, { min: 2, max: 2 })) {
  const h = chunk.heading && SECTION_NUM.exec(chunk.heading.text);
  if (!h) continue;
  const subs = splitSections(chunk.raw, { min: 3, max: 3 });
  for (const subSec of subs) {
    // `subs.length === 1` means "there are no subsections at all", exactly what used to be checked
    // as `sub === chunk`: the numbers are then counted against the section itself. If subsections DO
    // exist, the section's leading chunk (before the first `###`) is not checked — as it was before.
    const sh = subSec.heading
      ? SUBSECTION_NUM.exec(subSec.heading.text)
      : subs.length === 1
        ? [null, h[1], h[2]]
        : null;
    if (!sh) continue;
    const sub = subSec.raw;
    const num = sh[1];
    // Bold spans with digits that are not section pointers or bracketed citations.
    const reported = (
      sub
        .replace(/§\s*\d+(\.\d+)*/g, "")
        .replace(/\[[\d,\s–-]+\]/g, "")
        .match(/\*\*[^*]*\d[^*]*\*\*/g) || []
    ).length;
    if (!reported) continue;
    const named = new RegExp(
      `§\\s*${num.replace(".", "\\.")}\\b|\\b${num.replace(".", "\\.")}\\b`,
    ).test(index);
    if (!named)
      findings.push(
        `§${num} reports ${reported} bolded figure(s) and is named NOWHERE in ` +
          `${indexPath.replace(dir + "/", "")} — the released bundle may hold no data for it`,
      );
  }
}

// ---- 2. every path the index names actually exists -------------------------------------------
// Backtick-quoted things that look like a path into the bundle. A promise to a file that is not
// there is worse than no promise: it reads as released.
const seen = new Set();
for (const m of index.matchAll(/`([A-Za-z0-9_./-]+\/[A-Za-z0-9_.*/-]+)`/g)) {
  let p = m[1];
  if (seen.has(p) || p.includes("*") || p.startsWith("http")) continue;
  seen.add(p);
  // A paper about repositories names a LOT of `owner/repo`, and those are not paths. Require a file
  // extension: it is the one signal that separates `census/rows.tsv` from `saleor/apps`. Caught on
  // the first run, when three GitHub repositories were reported as missing directories.
  if (!/\.[a-z0-9]{1,5}$/i.test(p)) continue;
  // `repro/` is the WORKING tree, deliberately not in the anonymised bundle — the whole reason the
  // bundle exists separately is that repro holds real names in fixtures.
  if (p.startsWith("repro/")) continue;
  // A directory prefix is enough: the index names files inside runs that may be regenerated.
  const head = p.split("/")[0];
  if (!existsSync(join(bundle, head)) && !readdirSync(bundle).includes(head))
    findings.push(
      `the index names \`${p}\` and \`${head}\` is not in the bundle`,
    );
}

// ---- 3. reverse: a result on disk that neither the paper nor the index mentions ---------------
// The unit is an EXPERIMENT DIRECTORY under `repro/` that holds a headline write-up — this
// project's own convention, stated in `repro/README.md`: "you go into the folder, and there is a
// RESULTS.md with the full write-up". A directory with a RESULTS.md is a run somebody finished and
// wrote up.
//
// "Mentioned" is: the directory's name, or its name with a trailing -YYYY-MM-DD stripped, appears
// in the paper OR in the released index. Matching is LITERAL on purpose. Prefix or fuzzy matching
// would quietly absolve `gate-effect-spike-2026-08-05` on the strength of the shipped
// `gate-effect/`, and a false NEGATIVE in a cherry-picking detector is the failure that costs
// something. A rename is therefore a row in the ignore file, where it is visible and re-verified,
// rather than an inference nobody can see.
//
// 🔴 THIS LEG READS EVERY INDEX FILE, NOT JUST THE FIRST. Check 1 above resolves `indexPath` to
// NUMBERS.md *or* README.md and stops, which is right for it: it asks whether the map from numbers
// to data exists. Reused here it produced three false positives on the first run —
// `enforcement-surface`, `ladder-prototype` and `tier-a-prime` are all named in the bundle's
// README.md and in no other file, so a reverse check reading only NUMBERS.md accused the bundle of
// hiding three analyses it ships and documents. A cherry-picking detector that cries wolf gets
// muted, and a muted detector is how the failure happens twice.
const ledger = [];
const HEADLINE = /^(RESULTS|SUMMARY|FINDINGS|METRICS)\.(md|json|tsv|csv|txt)$/i;
const repro = join(dir, "repro");
const bundleName = bundle
  .slice(dir.length + 1)
  .split("/")
  .pop();
const indexAll = ["NUMBERS.md", "README.md"]
  .map((f) => join(bundle, f))
  .filter(existsSync)
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

if (!existsSync(repro)) {
  ledger.push(
    "   reverse check (results on disk nobody reports): SKIPPED — no repro/ directory",
  );
} else {
  // Structural ignores. Each is a RULE, and each prints what it swallowed.
  const swallowed = new Map([
    [
      `the released bundle itself (${bundleName}/) — it is the shipped copy of these same analyses, ` +
        "so counting it would report every one of them a second time",
      [],
    ],
    [
      "dot-directories and build/dependency trees (node_modules, __pycache__)",
      [],
    ],
  ]);
  const allowPath = join(repro, "unreported-grandfathered.txt");
  const allowed = new Map();
  if (existsSync(allowPath)) {
    for (const line of readFileSync(allowPath, "utf8").split("\n")) {
      const row = line.split("#")[0].trimEnd();
      if (!row.trim()) continue;
      const [name, reason, ...rest] = row.split("\t").map((c) => c.trim());
      if (name)
        allowed.set(
          name,
          [reason, ...rest].filter(Boolean).join(" — ") || "(NO REASON GIVEN)",
        );
    }
  }

  const candidates = [];
  for (const name of readdirSync(repro)) {
    const p = join(repro, name);
    if (!statSync(p).isDirectory()) continue;
    if (name === bundleName) {
      swallowed.get([...swallowed.keys()][0]).push(name);
      continue;
    }
    if (
      name.startsWith(".") ||
      name === "node_modules" ||
      name === "__pycache__"
    ) {
      swallowed.get([...swallowed.keys()][1]).push(name);
      continue;
    }
    const heads = readdirSync(p).filter((f) => HEADLINE.test(f));
    if (heads.length) candidates.push({ name, heads });
  }

  // 🔴 WHOLE-TOKEN, AND NEVER ON A SHORT SLUG. `includes()` was the first version and it acquitted
  // a directory called `a-2026-01-01` on the strength of the letter "a" appearing in the prose —
  // caught by the harness case that asserts the stated finding count. Substring matching in a
  // detector like this fails in the dangerous direction: it invents evidence that a result was
  // mentioned. Hyphens count as part of the token, so `gate-effect` does not match inside
  // `gate-effect-spike`, and a slug shorter than four characters is not used for matching at all.
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const mentions = (t, s) =>
    s.length >= 4 && new RegExp(`(?<![\\w-])${esc(s)}(?![\\w-])`).test(t);

  const reported = [],
    ignored = [],
    unreported = [];
  for (const c of candidates) {
    const slug = c.name.replace(/-\d{4}-\d{2}-\d{2}$/, "");
    const named = (t) => mentions(t, c.name) || mentions(t, slug);
    if (named(paper)) {
      reported.push(`${c.name} (named in the paper)`);
      continue;
    }
    if (named(indexAll)) {
      reported.push(`${c.name} (named in the index)`);
      continue;
    }
    if (allowed.has(c.name)) {
      ignored.push([c.name, allowed.get(c.name)]);
      continue;
    }
    unreported.push(c);
  }

  // A `ships-as:` reason carries a witness, so it is checked rather than believed. Everything else
  // is prose and is reprinted verbatim for a human to disbelieve.
  const stale = [];
  for (const [name, reason] of ignored) {
    const m = /^ships-as:(\S+)/.exec(reason);
    if (m && !existsSync(join(bundle, m[1])))
      stale.push(
        `the ignore row for \`${name}\` claims it ships as \`${m[1]}\`, and that path is ` +
          "not in the bundle — the allowance has rotted and is now hiding a real absence",
      );
  }
  for (const name of allowed.keys())
    if (!candidates.some((c) => c.name === name))
      stale.push(
        `the ignore row for \`${name}\` names no directory under repro/ that holds a ` +
          "headline result — retire the row rather than leaving it to grow stale",
      );
  findings.push(...stale);

  for (const c of unreported)
    findings.push(
      `DISK_UNREPORTED  repro/${c.name}/ holds ${c.heads.join(", ")} and is named neither in the ` +
        "paper nor in the released index — an analysis that ran and whose result a reader cannot reach",
    );

  ledger.push(
    "",
    `   ── what the reverse check ignored, in full (${candidates.length} candidate analyses under repro/) ──`,
    "   An ignore set applied in silence would make this a cherry-picking detector that cherry-picks,",
    "   so it is printed whether or not anything was found. Same discipline as check_grandfather in",
    "   repro/paper_numbers.py: the uncovered set is a list you can count, not an absence of warnings.",
  );
  for (const [rule, names] of swallowed)
    ledger.push(
      `   • ${names.length} before they were counted — ${rule}`,
      ...(names.length ? [`       ${names.join(", ")}`] : []),
    );
  ledger.push(
    `   • ${reported.length} reported: ${reported.join(" · ") || "(none)"}`,
  );
  ledger.push(
    `   • ${ignored.length} in repro/unreported-grandfathered.txt — every row, every reason:`,
  );
  for (const [name, reason] of ignored)
    ledger.push(`       ${name}  →  ${reason}`);
  if (!ignored.length)
    ledger.push("       (the file is empty — nothing is being waved through)");
  ledger.push(
    `   • ${unreported.length} left over, and those are the findings above.`,
    `   Ratio: ${unreported.length} reported as unreported, ${ignored.length} deliberately ignored, ` +
      `${reported.length} reachable. If the ignored column ever dwarfs the other two, this check has`,
    "   become a formality and the honest move is to say so rather than to keep running it.",
    "",
    "   🔴 WHAT THIS LEG IS SILENT ABOUT, stated so nobody reads its silence as coverage:",
    "   — an analysis SHIPPED in the bundle but never discussed in prose is counted as reported here,",
    "     because the index is treated as the paper's delegate. MedSci's DISK_UNREPORTED is scoped to",
    "     the manuscript alone and would flag those; ours would not.",
    "   — a result that was never written up (no RESULTS.md) is invisible. Deleting the write-up is a",
    "     one-command way past this check, and nothing here can tell that from an experiment nobody",
    "     finished.",
    '   — nothing reads the CONTENT of a result, so "mentioned" and "reported honestly" are different',
    "     things and only the first is checked.",
  );
}

const header = `📦 artifact coverage — ${findings.length} finding(s) in ${dir}`;
if (findings.length) {
  const out = flagsOnly ? console.error : console.log;
  out(header);
  findings.forEach((f) => out("   " + f));
  out(
    "   absence is invisible to the leak gate, the numbers gate and the artifact runner:",
  );
  out("   nothing leaks, nothing mismatches, and what IS there still runs.");
  ledger.forEach((l) => out(l));
  process.exit(1);
}
if (!flagsOnly) {
  console.log(header);
  console.log(
    "   every number-reporting section is indexed, every named path exists",
  );
  ledger.forEach((l) => console.log(l));
}
