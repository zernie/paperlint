// run-mechanical.mjs — run every check that is a SCRIPT, and record what each said.
//
//   node .claude/skills/paper-pipeline/scripts/run-mechanical.mjs <papers-root>/<paper-a>
//
// WHY THIS EXISTS, and why it is separate from the judgement gates. Half this pipeline is a
// program and half is a reading. The program half needs no agent, no model and no author — it
// needs someone to type the command, and that was the whole failure: `structure.mjs` shipped on
// 2026-08-05 wired to nothing, its findings reachable only by a person who remembered it existed.
// A check nobody runs and a check that does not exist differ only in the disappointment.
//
// So this runs them all, in one command, and writes each row to the ledger. What it does NOT
// do is decide anything: the exit code is the worst check's, and a BLOCKING finding here means a
// fact is wrong, never that a judgement is unfavourable. Judgement gates (cold-read-diff,
// tighten-paper, the panels) are read by a person or an agent and record themselves — they are
// not in this file, and putting them here would be the category error the CI workflow just got
// fixed for.
//
// ── 2026-08-10: ONE CHECK, ONE ROW ───────────────────────────────────────────────────────────
//
// 🔴 THE KEY USED TO BE `skill`, AND THAT WAS THE DEFECT. `status()` takes the last row per key,
// which is right across repeated runs of one check and wrong across two different checks. Filed
// under one skill name, two checks took turns being the answer: a clean run of the second erased
// a finding of the first from every derived view, while `runs.jsonl` still honestly held both.
//
// The cost was measurable and was paid. `repro/arm_permutation.py` and `repro/delivered_pdf.py`
// were LEFT OUT of this file for exactly that reason — their natural owner is `build-benchmark`
// and `check-provenance.mjs` was already sitting on that row, so wiring them in would have made
// three checks take turns. Both are wired in below now that each carries its own `check` id.
//
// There is no `PASS` verdict any more (see ledger.mjs). A check that runs and finds nothing
// records `ABSTAINED no-witness`, and "the paper is clean" is an inference the reader makes from
// the absence of findings — never a value this file writes down.

import { record, ABSTENTIONS } from "./ledger.mjs";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isMain } from "./consumer.mjs";
import { consumerRoot } from "./consumer.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));

// 🔴 2026-08-26 — THIS USED TO BE `'..', '..'`, AND IT BROKE THE WHOLE FILE SILENTLY. The file
// moved on 15.08 from `.claude/pipeline/` to `.claude/skills/paper-pipeline/scripts/`, that is, two
// levels deeper, while the count of `..` did not change: `ROOT` resolved to `.claude/skills`, and
// EVERY command in `GATES` (all paths in them are from the repo root) was looked up under
// `.claude/skills/.claude/skills/…`.
//
// Measurement before the fix, `run-mechanical.mjs <papers-root>/<paper-a>`: eight checks out of
// thirteen failed with `Cannot find module '.claude/skills/.claude/skills/…'`, and not one
// was recorded as `crashed` — `e.code === 'ENOENT'` catches a missing INTERPRETER, and node was
// found and printed the stack trace to stderr itself. The `flags` mode counted its lines: **six
// `FINDING` rows with findings: 16** went into the ledger, where sixteen is the height of the stack
// trace. One of them (`verify-cites`, `read: 'exit'`) was `blocking: true` on top of that, i.e. the
// run "found a fact".
//
// This is exactly the "four forms of a reference" class from `CLAUDE.md`: a file that moves changes
// the DEPTH of `../` to the root, and a grep over the path does not show it. All fifteen neighbours
// in the directory (`*.harness.mjs`, `*.mutations.mjs`) got four `..` during the resettlement; this
// file did not, because it was the only one that was not a test and nobody ran it.
const ROOT = consumerRoot();

// The structure rule names are taken FROM THE MODULE ITSELF, not rewritten here as a list. A list
// written by hand rots the day a thirteenth rule is added to `paper-structure.mjs` — and it rots
// toward silence: the new rule simply does not reach the filter, while the ledger row goes on
// looking like it works. `CLAUDE.md`: everything that can be derived, derive.
// Both citation checkers live in ONE place and are pointed at each paper's build; a copy per
// paper is four files that have to be kept in agreement.
// 🔴 A DECLARATION, NOT AN ADDRESS. The citation checkers (`report-submission.py`,
// `uncited_refs.py`) are python that lives AT THE CONSUMER: the pipeline calls them but does not
// ship them. What stood here was a path into one specific paper of the first consumer — in an
// extracted package it would both point into somebody else's tree and name somebody else's work.
//
// ⚠️ THERE IS NO DEFAULT DELIBERATELY, and that is what distinguishes this key from
// `papersDir`/`ledger`. There a default is meaningful (the `papers` directory, a file next to it);
// here any guessed path would be wrong for everyone but one. Not declared — three `GATES` rows
// simply do not run: `needs()` below checks the directory on disk, so the absence reads as
// ABSTAINED `input-missing`, not as a crash and not as a clean run.
const CITE_CHECKS =
  process.env.PIPELINE_CITE_CHECKS ||
  JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"))[
    "research-paper-pipeline"
  ]?.citeChecks ||
  null;
// The citation-checker directory exists and is declared. It sits in the `needs()` of every row
// that calls it: without that a wrong or undeclared path would fail with a python stack trace, and
// in `flags` mode a stack trace is counted line by line and goes into the ledger as a FINDING whose
// count is the height of the trace — exactly what already happened here on 26.08 with the wrong
// `..` depth.
const hasCiteChecks = () =>
  CITE_CHECKS !== null && existsSync(join(ROOT, CITE_CHECKS));
// 🔴 A CHECKER THAT IS NOT INSTALLED IS `input-missing`, NEVER A RUN. Some rows shell out to
// scripts belonging to OTHER skills of the pipeline, which a consumer may not have installed.
// Without this the command fails, node prints a stack trace, and `read: "flags"` COUNTS ITS LINES
// — a missing checker arrives in the ledger as a FINDING whose count is the height of the trace.
// That is not hypothetical: it happened here on 2026-08-26 (see the note on ROOT above), six rows,
// one of them blocking. `needs()` is the only place where «I could not run» stays distinct from
// «I ran and saw something».
const hasScript = (rel) => existsSync(join(ROOT, rel));
// The only layout difference: some papers render into `build/`, the rest are built in place.
const buildOf = (d) => (existsSync(join(d, "build")) ? join(d, "build") : d);
const hasBuilt = (d, ext) =>
  existsSync(buildOf(d)) &&
  readdirSync(buildOf(d)).some((f) => f.endsWith(ext));
// `.body-limit` declares the venue's page limit — that is, a paper that has a submission, and so
// a point to the blocks about anonymity/URLs/pages. The marker lives IN THE PAPER ITSELF, not as a
// name in the script, so a new paper is picked up on its own.
const hasVenue = (d) => existsSync(join(d, ".body-limit"));

// 🔴 THE CONSUMER'S RULE MODULE, RESOLVED FROM THE CONSUMER ROOT — not by counting `..` from
// this file. It was `../../../../eslint-rules/paper-structure.mjs`, which was a distance, and a
// distance stops being true the moment the file moves; from inside `node_modules` those four
// levels land two directories above the repository. The names are still READ FROM THE MODULE
// rather than copied here — a hand-written list rots toward silence the day a rule is added.
//
// Absence is tolerated and REPORTED, because this module belongs to the consumer: a repository
// that lints its papers some other way has no such file, and the one gate that filters on these
// names simply does not run. `needs()` on that gate asks the same question, so the absence
// arrives as ABSTAINED `input-missing` rather than as a clean run.
const STRUCTURE_RULES_FILE = join(ROOT, "eslint-rules", "paper-structure.mjs");
const STRUCTURE_RULES = existsSync(STRUCTURE_RULES_FILE)
  ? new Set(
      Object.keys(
        (await import(pathToFileURL(STRUCTURE_RULES_FILE).href)).default,
      ).map((r) => `paper/${r}`),
    )
  : new Set();

// skill      → the skill this check belongs to (its SKILL.md is what `skillHash` keys on)
// check      → THE ROW KEY, unique per check. Two checks under one skill are two rows.
// cmd        → argv, run from the repo root
// read       → how to read the result:
//                `exit` — the script's own exit code is the answer (a FACT check); a non-zero
//                         exit is a BLOCKING finding.
//                `flags` — non-empty output is a finding and never blocking (a JUDGEMENT check).
//                `json`  — stdout is a JSON array of findings; its length is the count.
//                `eslint` — stdout is ESLint's `--format json` (an array of FILES, each with its
//                         own `messages`), so the count is the number of messages whose `ruleId`
//                         is in this gate's `rules` set — never the length of the array, which is
//                         the number of files and would read 1 on a paper with fifty findings.
// rules      → `read: 'eslint'` only: the rule ids this row owns. One ESLint run carries every
//              rule that matched the file, and the rows here are per-check, so each row takes its
//              own and leaves the rest to the row that owns them.
// Exported FOR THE HARNESS. `main()` runs only on a direct call (bottom of the file), so importing
// this module has no side effects, and a test gets the ability to take a row and run ITS COMMAND —
// not its own copy of the command, which would drift from this one at the first edit.
export const GATES = [
  {
    skill: "render-paper",
    check: "report-submission",
    cmd: (d) => [
      "python3",
      join(CITE_CHECKS, "report-submission.py"),
      buildOf(d),
    ],
    needs: (d) => hasCiteChecks() && hasBuilt(d, ".log") && hasVenue(d),
    read: "exit",
    note: "body pages, overfull boxes, unresolved refs, dropped characters, anonymity, artifact URLs",
  },
  {
    // The same program, a narrow slice: for a paper with no declared venue limit the anonymity
    // and URL blocks answer somebody else's question (measured 28.08 on the ACCEPTED agenticdev: 18
    // anonymity findings, not one of them a defect — the camera-ready is de-anonymized on purpose).
    // A gate that is red for reasons the reader is obliged to ignore stops being read.
    skill: "render-paper",
    check: "report-submission-citations",
    cmd: (d) => [
      "python3",
      join(CITE_CHECKS, "report-submission.py"),
      buildOf(d),
      "--only",
      "citations",
    ],
    needs: (d) => hasCiteChecks() && hasBuilt(d, ".log") && !hasVenue(d),
    read: "exit",
    note: "a \\cite with no bibliography entry, from the pdflatex log",
  },
  {
    // 🔴 2026-08-26 — THIS ROW WAS A GREEN-AND-DEAD GATE FOR EXACTLY ONE DAY, AND THAT IS MEASURED.
    // It used to be `node .claude/skills/tighten-paper/structure.mjs --flags-only`. On the same day
    // all sixteen checks from there moved into ESLint rules (`eslint-rules/paper-structure.mjs`),
    // and the `--flags-only` mode started to BE SILENT ALWAYS and exit 0 — deliberately, so that the
    // pointer "see eslint" would not turn into a permanent false finding. But `read: 'flags'` reads
    // silence as "no findings", so the ledger recorded `ABSTAINED no-witness` BY SILENCE, NOT BY
    // CHECKING. Measured on `<paper-a>/paper.md`: `--flags-only` — 0 lines, exit 0; the same
    // bytes through ESLint — **6 findings** (`subsection-size` ×2 · `section-lead` ·
    // `free-section-size` ×2 · `block-ungraded`). Six findings the consumer learned nothing about.
    //
    // WHY THE ROW WAS REPOINTED AND NOT DELETED. For a CI step deleting it was the right call —
    // there `npx eslint … .` over the whole repo already sits next to it, and it prints the
    // structural findings. Here there is no duplicate: ESLint writes NOTHING into the ledger, and
    // the ledger is the only place where "somebody looked at the structure of this paper on these
    // bytes" is kept together with the hash of the input. Removing the row would trade silence for
    // absence.
    //
    // The filter on `STRUCTURE_RULES` is deliberate: ESLint gives 30 findings on this file, 24 of
    // them prose and craft, which have THEIR OWN row in the ledger. Without the filter one row
    // would take somebody else's findings, and that is exactly "two checks in turn become the
    // answer", to cure which `check` was made the key of a row.
    skill: "tighten-paper",
    check: "structure",
    cmd: (d) => [
      "node_modules/.bin/eslint",
      "--no-config-lookup",
      "--config",
      "eslint.config.mjs",
      "--format",
      "json",
      join(d, "paper.md"),
    ],
    // A binary that is not installed is `input-missing` (the checking tool is an input of the
    // run), not `crashed`. The same logic and the same shape as `textidote` below.
    // Plus the rule module itself: without it `rules` is empty, and a filter over an empty set
    // would leave zero findings out of thirty — a confident green run instead of an honest "no
    // input".
    needs: () =>
      existsSync(join(ROOT, "node_modules/.bin/eslint")) &&
      STRUCTURE_RULES.size > 0,
    read: "eslint",
    rules: STRUCTURE_RULES,
    note: "section weights, the free half vs the half under a page limit, unjustified blocks",
  },
  {
    skill: "grade-paper-writing",
    check: "prose-lint",
    cmd: (d) => [
      "node",
      ".claude/skills/grade-paper-writing/prose-lint.mjs",
      "--flags-only",
      join(d, "paper.md"),
    ],
    needs: () => hasScript(".claude/skills/grade-paper-writing/prose-lint.mjs"),
    read: "flags",
    note: "thresholds with published baselines; judgement, so it never fails the run",
  },
  {
    skill: "verify-citations",
    check: "verify-cites",
    cmd: () => [
      "node",
      ".claude/skills/verify-citations/scripts/verify-cites.test.mjs",
    ],
    needs: () =>
      hasScript(
        ".claude/skills/verify-citations/scripts/verify-cites.test.mjs",
      ),
    read: "exit",
    note: "the mechanical half only — the fetching half needs the network and a reader",
  },
  {
    skill: "harden-paper",
    check: "artifact-coverage",
    cmd: (d) => ["node", join(HERE, "artifact-coverage.mjs"), d],
    read: "flags",
    note: "does the released bundle hold data for what the paper points at",
  },
  {
    skill: "build-benchmark",
    check: "check-provenance",
    cmd: (d) => ["node", join(HERE, "check-provenance.mjs"), d],
    read: "flags",
    note: "bolded figures with no row in any provenance file",
  },
  // 🔴 THE TWO THAT HAD NOWHERE TO FILE. Both are `build-benchmark` checks; both were unwired
  // until the row key became the check, and until then their only runner was their own harness.
  {
    skill: "build-benchmark",
    check: "arm-permutation",
    cmd: (d) => [
      "python3",
      join(d, "repro/arm_permutation.py"),
      "--repro",
      join(d, "repro"),
      "--paper",
      join(d, "paper.md"),
      "--json",
    ],
    needs: (d) => existsSync(join(d, "repro/arm_permutation.py")),
    read: "json",
    note: "a quantity that does not move when its arm label moves was transcribed, not computed",
  },
  {
    skill: "build-benchmark",
    check: "delivered-pdf",
    cmd: (d) => [
      "python3",
      join(d, "repro/delivered_pdf.py"),
      "--repro",
      join(d, "repro"),
      "--paper",
      join(d, "paper.md"),
      "--pdf",
      join(d, "build/acl_latex.pdf"),
      "--json",
    ],
    needs: (d) =>
      existsSync(join(d, "repro/delivered_pdf.py")) &&
      existsSync(join(d, "build/acl_latex.pdf")),
    read: "json",
    note: "every registered quantity reached the delivered page beside the prose that claims it",
  },
  {
    // Ported from MedSci Skills' `check_generated_code.py` (arXiv:2606.09500v4). Filed under
    // `build-benchmark` because that is the pass that builds the reproduction artifact, and this
    // asks whether the scripts inside it run the same way twice on somebody else's disk.
    //
    // 🔴 NOT a duplicate of `check-anon.sh` category 5, which greps the same four path prefixes.
    // That one reads the SHIPPED BUNDLE and asks whether it leaks the author's machine layout;
    // this one reads the WORKING TREE before the scripts run and asks whether they are portable at
    // all. The trees they scan are disjoint by construction — the bundle is excluded here — and the
    // exclusion is printed in the check's own ignore ledger rather than hidden in a glob.
    skill: "build-benchmark",
    check: "generated-code",
    cmd: (d) => ["node", join(HERE, "generated-code.mjs"), d],
    read: "flags",
    note: "analysis scripts that never seed randomness, hard-code an absolute path, or clobber their own input",
  },
  // 🔴 TWO EXTERNAL CHECKERS, ADDED 2026-08-10. Both cover a surface every check in this file
  // reads past: one has no dictionary, the other never looks at the citation graph backwards.
  {
    // Filed under `grade-paper-writing` DELIBERATELY, not under `verify-citations` or a skill of
    // its own. That skill already owns `prose-lint`, which is the paper's PROSE surface; spelling
    // and grammar are the same surface, judged by a different instrument. A separate skill would
    // have meant a 23rd SKILL.md to keep wired, and filing it under `render-paper` (which owns the
    // built artifact) would have put a source-text check on the row for the check that reads PDFs.
    skill: "grade-paper-writing",
    check: "textidote",
    cmd: (d) => [
      "python3",
      join(d, "repro/textidote_check.py"),
      "--paper",
      join(d, "paper.md"),
      "--baseline",
      join(d, "repro/textidote-grandfathered.txt"),
      "--json",
    ],
    // The jar is 224 MB and is NOT committed, so its absence is normal on a fresh container and
    // must read as `input-missing` rather than as silence. `crashed` would be the other honest
    // answer; `input-missing` is chosen because the checker is an input the run did not have.
    // 🔴 MIRRORS `find_jar()` IN THE CHECKER, INCLUDING ITS ONE RULE: an explicit $TEXTIDOTE_JAR is
    // AUTHORITATIVE, so naming a missing file means "absent" rather than "fall back to /opt". The
    // first version of this line used `.some()` over both candidates and disagreed with the checker
    // — the gate would have called the input present and the checker would then have refused, so an
    // absent jar was recorded as `crashed` instead of `input-missing`. Two answers to one question,
    // which is the whole failure mode of a gate that does not read what it gates.
    needs: (d) =>
      existsSync(join(d, "repro/textidote_check.py")) &&
      existsSync(process.env.TEXTIDOTE_JAR || "/opt/textidote/textidote.jar"),
    read: "json",
    note: "a spelling or grammar warning with no row in repro/textidote-grandfathered.txt",
  },
  {
    // `verify-citations` owns the bibliography, and this is that surface read in the one direction
    // its own check cannot see: verify-cites asks whether an ENTRY names a real work, and this asks
    // whether anything points AT the entry. Same file, opposite arrow, so the same skill.
    skill: "verify-citations",
    check: "uncited-refs",
    cmd: (d) => [
      "python3",
      join(CITE_CHECKS, "uncited_refs.py"),
      "--build",
      buildOf(d),
      "--json",
    ],
    needs: (d) => hasCiteChecks() && hasBuilt(d, ".aux"),
    read: "json",
    note: "a bibliography entry no \\cite in the paper points at",
  },
  {
    skill: "draft-paper",
    check: "population-map",
    cmd: (d) => ["node", join(HERE, "population-map.mjs"), d],
    read: "flags",
    note: "can the reader tell WHICH SET each number counts",
  },
  {
    // `tighten-paper` owns this row because it is the pass told to pay the ratchet back: a review
    // round that only ever ADDS text is this project's oldest recorded drift, and the one gate whose
    // job is to remove text is the right place to weigh it. Four of the thirteen finding kinds read
    // the WHOLE body at both revisions rather than the round's declared scope — coverage that is a
    // function of what happened to be edited degrades silently, which is documented upstairs.
    skill: "tighten-paper",
    check: "round-diff",
    cmd: (d) => ["node", join(HERE, "round-diff.mjs"), d, "--json"],
    needs: (d) => existsSync(join(d, "rounds")),
    read: "json",
    note: "a review round may only change what it declared; the whole body is weighed every round",
  },
];

/**
 * Write the check's own output where a reader can open it, and hand back the repo-relative path.
 *
 * 🔴 THIS IS NOT DECORATION. Before today this file recorded findings with NO report path, and
 * `record()` now refuses that — correctly, and for a reason measured on real rows: four of six
 * runs on 2026-08-07 stored a count and dropped the location, leaving thirty-six findings that
 * were a number and nothing else. A count with no location is a rumour, and a rumour gets
 * re-derived from scratch next session. The frontmatter states the count so the ledger and the
 * report can be checked against each other, which `record()` does.
 */
function writeReport(dir, g, count, body) {
  const rel = join("reviews", "mechanical", `${g.skill}--${g.check}.md`);
  const abs = join(dir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(
    abs,
    [
      "---",
      `title: "${g.skill}/${g.check} — mechanical check output"`,
      `created: ${new Date().toISOString().slice(0, 10)}`,
      `findings: ${count}`,
      "---",
      "",
      `Written by \`run-mechanical.mjs\`. What this check looks at: ${g.note}`,
      "",
      "```",
      body.trimEnd() || "(the check produced no output)",
      "```",
      "",
    ].join("\n"),
  );
  return rel;
}

function main(argv) {
  const dir = resolve(argv[2] || ".");
  if (!existsSync(join(dir, "paper.md"))) {
    console.error(`no paper.md in ${dir}`);
    return 2;
  }

  // A duplicate key would silently restore the exact defect this file was refactored to remove,
  // so it is checked here rather than trusted to review. Cheap, and it cannot be forgotten.
  const keys = GATES.map((g) => `${g.skill}/${g.check}`);
  const dupe = keys.find((k, i) => keys.indexOf(k) !== i);
  if (dupe) {
    console.error(
      `two checks share the row key "${dupe}" — they would take turns being the answer`,
    );
    return 2;
  }

  let worst = 0;
  for (const g of GATES) {
    const key = `${g.skill}/${g.check}`;
    const abstain = (reason, note) => {
      console.log(
        `\n⬜ ${key} — abstained (${reason}): ${ABSTENTIONS.get(reason)}`,
      );
      record({
        skill: g.skill,
        check: g.check,
        paper: dir,
        kind: "ABSTAINED",
        reason,
        note: note ?? g.note,
      });
    };

    if (g.needs && !g.needs(dir)) {
      abstain("input-missing");
      continue;
    }

    // `out` with no initial value: try assigns it, catch assigns it below (2026-08-28)
    let out,
      code = 0,
      crashed = false;
    try {
      out = execFileSync(g.cmd(dir)[0], g.cmd(dir).slice(1), {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      if (e.code === "ENOENT") {
        crashed = true;
      }
      code = e.status ?? 1;
      out = (e.stdout || "") + (e.stderr || "");
    }
    if (crashed) {
      abstain("crashed", `${g.cmd(dir)[0]} is not installed`);
      continue;
    }

    const lines = out.split("\n").filter((l) => l.trim()).length;
    let count,
      blocking = false;
    if (g.read === "exit") {
      count = code === 0 ? 0 : Math.max(1, lines);
      blocking = code !== 0;
    } else if (g.read === "eslint") {
      // Three ways in which ESLint can NOT check a file, and all three look like a clean run if
      // you read only the length of the filtered list. Each is routed into its own ledger row,
      // because "did not check" and "checked and found nothing" are different facts.
      let parsed;
      try {
        parsed = JSON.parse(out);
      } catch {
        parsed = null;
      }
      // 1. not JSON at all: a broken config, a glob without a single file (`No files matching the
      //    pattern … were found`, exit 2), a missing binary. All of that goes to stderr.
      if (!Array.isArray(parsed)) {
        abstain(
          "crashed",
          `eslint did not return JSON: ${(out.trim().split("\n")[0] || "(empty output)").slice(0, 160)}`,
        );
        continue;
      }
      const msgs = parsed.flatMap((f) =>
        f.messages.map((m) => ({ ...m, filePath: f.filePath })),
      );
      // 2. a rule itself crashed on this file. `fatal` arrives with `ruleId: null`, that is, after
      //    the filter it disappears without a trace and reads as "no findings".
      const fatal = msgs.find((m) => m.fatal);
      if (fatal) {
        abstain("crashed", `eslint crashed on the file: ${fatal.message}`);
        continue;
      }
      // 3. NOT A SINGLE rule applied to the file ("File ignored because outside of base path" is
      //    how a fixture in a temporary directory looks, "…because no matching configuration" is a
      //    file outside the config's glob). Zero findings here means "nobody looked".
      const ignored = msgs.find(
        (m) => !m.ruleId && /^File ignored/.test(m.message),
      );
      if (ignored) {
        abstain(
          "input-missing",
          `eslint applied not a single rule to the file: "${ignored.message}"`,
        );
        continue;
      }
      const mine = msgs.filter((m) => g.rules.has(m.ruleId));
      count = mine.length;
      // severity 2 means the rules declared binary in `eslint.config.mjs` ("a reference either
      // resolves or it does not"), that is, a FACT in this file's vocabulary. Thresholds chosen by
      // a human are declared `warn` and stay judgemental.
      blocking = mine.some((m) => m.severity === 2);
      out = mine
        .map(
          (m) =>
            `${m.filePath}:${m.line}:${m.column}  ${m.severity === 2 ? "error" : "warning"}  ${m.ruleId}  ${m.message}`,
        )
        .join("\n");
    } else if (g.read === "json") {
      let parsed;
      try {
        parsed = JSON.parse(out);
      } catch {
        parsed = null;
      }
      if (!Array.isArray(parsed)) {
        abstain(
          "crashed",
          "output was not the JSON array of findings it documents",
        );
        continue;
      }
      count = parsed.length;
      out = JSON.stringify(parsed, null, 2);
    } else {
      // `flags` mode prints a header line even when clean, so one line is not a finding.
      //
      // 🔴 PREFER THE CHECK'S OWN COUNT WHEN IT STATES ONE. Counting output lines is what this file
      // did before 2026-08-10, and writing the report out made the consequence visible on the page:
      // `check-provenance` printed "7 finding(s)" in a report whose frontmatter said 13, because
      // thirteen was the number of LINES. The ledger and the report agreed with each other and both
      // disagreed with the checker — which is the exact "two numbers, one already wrong" state the
      // evidence contract exists to catch, sitting one level up where the contract could not see it.
      // Lines remain the fallback for checks that state nothing.
      const stated = /—\s*(\d+)\s+finding\(s\)/.exec(out);
      count = stated ? Number(stated[1]) : lines > 1 ? lines : 0;
    }

    if (count === 0) {
      // 🔴 NOT a pass. The check ran and produced no finding, and it has no witness for the
      // negative — so it abstains and the reader derives cleanliness from the absence, if they
      // want to claim it.
      console.log(`\n🤍 ${key} — no finding recorded (abstained: no-witness)`);
      console.log(`   ${g.note}`);
      record({
        skill: g.skill,
        check: g.check,
        paper: dir,
        kind: "ABSTAINED",
        reason: "no-witness",
        note: g.note,
      });
      continue;
    }

    const report = writeReport(dir, g, count, out);
    console.log(
      `\n${blocking ? "🔴" : "🟠"} ${key} — ${count} finding(s) → ${report}`,
    );
    console.log(`   ${g.note}`);
    console.log(
      out
        .split("\n")
        .slice(0, 12)
        .map((l) => "   " + l)
        .join("\n"),
    );
    record({
      skill: g.skill,
      check: g.check,
      paper: dir,
      kind: "FINDING",
      findings: count,
      report,
      blocking,
      note: g.note,
    });
    if (blocking) worst = 1;
  }

  console.log(
    `\n${worst === 0 ? "🟢 no FACT check recorded a blocking finding" : "🔴 a FACT check found something — see above"}`,
  );
  console.log(
    `   Judgement checks report and never fail the run; read them, and never grep this for green.\n`,
  );
  return worst;
}

if (isMain(import.meta.url)) process.exit(main(process.argv));
