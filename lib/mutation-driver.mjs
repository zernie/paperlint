/**
 * mutation-driver.mjs — the shared engine behind every `*.mutations.mjs` in this repo.
 *
 * NOT IN vigiles, AND THAT IS A DECISION WITH A DATE. On 2026-08-14 this engine was extracted into
 * vigiles as `runMutations` (`vigiles/testing`, shipped in 15.3.0). The owner killed it the next
 * day with one question: «how is this vigiles' responsibility, it's just nodejs?» — and he is
 * right. Measured against the rest of
 * that package: `runHook` knows the Claude Code hook protocol, `measureTriggerRate` knows what a
 * skill is, `skillContract` reads `allowed-tools` out of frontmatter. This file knows none of that.
 * It replaces a substring, spawns `node`, and reads stdout; lift it into any Node repo and it works
 * unchanged. Confirming measurement: no test in vigiles used it — the product did not dogfood its
 * own published API.
 *
 * The rule «механизм → vigiles» was applied too bluntly, and this is the correction worth keeping:
 * what fixed the ten drifted copies was CONSOLIDATION, not RELOCATION. One copy instead of ten
 * buys every protection listed below. Moving that copy into a product for harness authors was a
 * second, separate step, and it was never justified — it only bought a newcomer the question the
 * owner asked. `checkProductCodeInKb` flags this file on sight, which is correct and stays visible: the
 * heuristic is right that this is mechanism-shaped, and the answer is «yes, and it was rejected
 * upstream on 2026-08-15», not «no».
 *
 * 🔴 2026-09-12 — IT NOW LIVES IN A PACKAGE ANYWAY, AND THAT DOES NOT REOPEN THE DECISION
 * ABOVE. The rejected move was into vigiles: a product for people writing agent harnesses, where
 * a generic string-replacing test driver is off-topic and, measured, was not used by a single one
 * of its own tests. This package is the opposite case — it IS the batteries' own repository, they
 * are its tests, and it cannot run them without the engine. So the destination differs on the
 * exact axis the rejection turned on: «does the package this lives in actually use it». Do not
 * read this file's presence here as the vigiles decision being reversed; it was not re-argued.
 *
 * The one shape that WOULD belong in vigiles is a different function that does not exist yet:
 * mutate the HOOK — remove one branch of a guard — and require the assembled harness test to
 * notice. Only vigiles knows what a hook is. Backlog, not this file.
 *
 * WHAT A MUTATION RUN IS. Plant one defect in a checker, run that checker's harness, and require
 * the harness to go red AND to name the case that owns the defect. A harness that stays green has
 * an assertion that cannot fail; a harness that reddens with someone else's message has two
 * defects sharing one assertion, which means neither is really watched.
 *
 * WHY THIS FILE EXISTS (2026-08-14). Ten mutation files, 1799 lines, ran the same twenty-five-line
 * driver ten times — and they had DRIFTED, so the copies were not equivalent. Counted against the
 * committed versions, not estimated:
 *
 *   - NO-OP GUARD (a replacement equal to the original leaves a green harness that proves nothing):
 *     present in 4 of 10 — `ledger`, `round-diff`, `textidote`, `uncited-refs`. SIX lacked it.
 *   - RETRY (a non-kill is re-run once before it is believed, because a row killed as named came
 *     back DIFFERENT in a later full run and reproduced clean when replayed alone): present in
 *     1 of 10 — `ledger`. NINE lacked it.
 *   - `skills.mutations.mjs` alone mutated a COPY of the tree; the other nine rewrite the real
 *     source and restore it in a `finally`.
 *   - Two files pointed at `.claude/pipeline/skills.harness.mjs`, deleted by the 2026-08-11
 *     colocation (`ledger`, six cases; and `skills` itself). `vigiles test` on a path matching
 *     nothing exits 0, so those cases reported SURVIVED forever — a mutation runner producing
 *     confident wrong answers about mutation runs.
 *
 * Every protection above was written AFTER it caught something, in one file, and never travelled
 * to the other nine. That is the argument for one engine, and it is stronger than "less code".
 *
 * So the split is not cosmetic DRY: nine files GAIN two protections they never had, and the dead
 * path becomes expressible once instead of three times.
 *
 * WHAT STAYS IN THE CALLER. The CASES TABLE — which defect, which bytes, which message. That is
 * data about OUR checkers and belongs next to them (root CLAUDE.md: "механизм — в vigiles, данные
 * — в mine"; the same line separates mechanism from data inside this repo). This file knows
 * nothing about papers, skills or ledgers.
 *
 * WHAT DOES NOT USE THIS ENGINE, AND WHY. `skills.mutations.mjs` mutates a COPY of `.claude` in a
 * temp root and runs the harnesses there with `CLAUDE_PROJECT_DIR` repointed. That is the right
 * strategy for it — its cases break the SKILL CORPUS itself, so a copy is cheap (one directory) and
 * the real corpus is never touched. It is the only one CI runs, and it stays as it is. Two
 * strategies is a smell only when they differ by accident; here the difference is the subject.
 *
 * 🔴 THE IN-PLACE STRATEGY IS PRESERVED, NOT "FIXED". Nine callers rewrite a real file, and moving
 * them to a temp copy is not a refactor: their harnesses resolve every path from the repo root, so
 * a copy means copying the whole repo per mutation — minutes instead of seconds. What IS fixed is
 * the failure mode: the restore now also runs on SIGINT/SIGTERM, and a run refuses to start when
 * any target file is already dirty, so an interrupted run cannot leave a neutered checker behind
 * and then pass.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

/**
 * @typedef {object} MutationCase
 * @property {string} name        Short id, printed in the table.
 * @property {string} disables    What the mutation takes away, in words — the column a reader scans.
 * @property {[string, string, string][]} edits  `[absolutePath, find, replace]`. A LIST because some
 *   defects are only expressible as more than one edit: an acquittal reaching the ledger needs both
 *   the retired-name guard and the vocabulary check removed, and either alone throws for an
 *   unrelated reason.
 * @property {string} harness     Absolute path to the harness that must go red.
 * @property {string} expect      Substring the harness's complaint must contain.
 */

/** Runs a harness file. `node` for a plain harness, `npx vigiles test` when the caller says so. */
const runners = {
  node: (harness, root) => spawnSync("node", [harness], { cwd: root, encoding: "utf8" }),
  vigiles: (harness, root) =>
    spawnSync("npx", ["vigiles", "test", harness], { cwd: root, encoding: "utf8" }),
};

/**
 * vigiles' own protocol constant: `skip()` ends the process with this code. Its docs state it —
 * `harness-assert.d.ts`: «Exit 77 is the runner's `SKIP_EXIT_CODE` (run-scripts.ts)» — but the
 * package exports `skip` and not the number, so it is NAMED here instead of appearing as a bare
 * literal in a comparison.
 *
 * ⚠️ If a future vigiles changes it, this degrades GRACEFULLY rather than silently: an unknown
 * non-zero code reads as "red", so the battery reports UNJUDGEABLE instead of claiming a
 * survivor. Wrong, but loudly wrong — which is the direction this whole file errs in.
 */
const VIGILES_SKIP_EXIT = 77;

/**
 * 🔴 A SKIPPED HARNESS IS A THIRD OUTCOME, AND CONFLATING IT WITH "GREEN" PRODUCES A CONFIDENT
 * WRONG DIAGNOSIS — the failure this file already documents twice, arriving by a new door.
 *
 * MEASURED 2026-09-15, chain complete, every link observed rather than argued:
 *
 *     the harness itself, `claude` CLI absent   exit 77   "SKIPPED: … no run can be observed"
 *     `npx vigiles test <harness>`              exit 0    "0 passed, 1 skipped."
 *     the driver reads 0                        ⇒ "🔴 SURVIVED"
 *
 * So `plan-paper-timeline.effects.mutations.mjs` reported TWO survivors in CI and none locally,
 * and the difference was not the code under test — it was that CI has no `claude` binary. The
 * reader is sent to rewrite a working assertion, which is strictly worse than a red with no
 * explanation.
 *
 * WHY THE FLAG AND NOT A SUBSTRING. `--no-skip` exists precisely to turn "skipped" into a
 * failure, so asking the tool with it is asking the THING; matching "SKIPPED" in the output
 * would be matching its shadow, and the shadow has spellings. The plain run then disambiguates:
 * a harness that is green without the flag and red with it SKIPPED; one that is red both ways was
 * already red, which the caller below already handles.
 *
 * ⚠️ The extra probe runs ONLY for a harness that is not plainly green, so the common path costs
 * exactly what it cost before.
 *
 * @returns {"green"|"red"|"skip"}
 */
function probeHarness(runner, harness, root) {
  // The node runner needs no probe: a skipping harness exits with vigiles' own skip code, and
  // that code IS the signal. It is only the `vigiles` wrapper that swallows it into a 0.
  if (runner === "node") {
    const r = runners.node(harness, root);
    return r.status === 0 ? "green" : r.status === VIGILES_SKIP_EXIT ? "skip" : "red";
  }
  const strict = spawnSync("npx", ["vigiles", "test", harness, "--no-skip"], { cwd: root, encoding: "utf8" });
  if (strict.status === 0) return "green";
  return runners.vigiles(harness, root).status === 0 ? "skip" : "red";
}

/**
 * @param {object} o
 * @param {string} o.root                 Repo root; every path in `edits` and `harness` is absolute.
 * @param {MutationCase[]} o.cases
 * @param {"node"|"vigiles"} [o.runner]   How to invoke a harness. Default `node`.
 * @param {string[]} [o.cleanHarnesses]   Run after restoring to prove the restore worked. Defaults
 *                                        to the distinct harnesses named by the cases.
 * @returns {number} process exit code — 0 only if every mutation was killed by its OWN case.
 */
export function runMutations({ root, cases, runner = "node", cleanHarnesses }) {
  const run = runners[runner];
  if (!run) throw new Error(`unknown runner ${JSON.stringify(runner)}; expected node or vigiles`);
  if (!cases.length) throw new Error("no mutation cases were passed — a runner with nothing to run reports success");

  const targets = [...new Set(cases.flatMap((c) => c.edits.map(([f]) => f)))];
  const harnesses = [...new Set(cases.map((c) => c.harness))];

  // COVERAGE MODE — report which harnesses this battery can kill, then stop without touching a
  // file. Read by `scripts/run-mutations.mjs` to answer «is every harness in the repo killable by
  // SOMETHING», which it previously answered by FILENAME (`x.harness.mjs` ⇄ `x.mutations.mjs`).
  //
  // 🔴 THE FILENAME WAS A PROXY, AND IT WAS WRONG ON THIS CORPUS. `ledger.mutations.mjs` is the
  // battery for `gates.harness.mjs` — it plants defects in the ledger and requires the GATES
  // harness to notice — and no naming convention expresses that. Under the old rule it read as
  // two problems at once: a battery covering nothing and a harness covered by nobody. Pairing is
  // now derived from the `harness` field of the cases that actually run, i.e. from the same data
  // structure that does the work, so it cannot disagree with what the battery does.
  //
  // ⚠️ An exemption list was the other available answer and is the one NOT taken: a guard with a
  // list of things it agrees not to look at is decoration. Nothing here is exempt — a harness is
  // covered only when some battery names it, and a battery that names a harness it does not
  // really exercise is caught by that case reporting SURVIVED.
  if (process.env.MUTATIONS_REPORT_COVERAGE) {
    for (const h of harnesses) console.log(`MUTATION-COVERS\t${h}`);
    return 0;
  }

  // 🔴 A harness path that resolves to nothing is the defect that hid for three days: `vigiles
  // test` prints "No files found" and exits 0, so every case naming it reports SURVIVED and the
  // reader goes looking for a broken assertion that was never reached. Checked BEFORE any file is
  // touched, so the message arrives with a clean working tree.
  const missing = harnesses.filter((h) => !existsSync(h));
  if (missing.length) {
    console.error(`refusing to run: harness file(s) do not exist:\n  ${missing.join("\n  ")}`);
    return 2;
  }

  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" }).stdout ?? "";
  const dirty = targets.filter((f) => git("status", "--porcelain", f).trim());
  if (dirty.length) {
    console.error(
      `refusing to run: this script rewrites the file(s) below and they have uncommitted changes.\n  ${dirty.join("\n  ")}\nCommit first (do NOT stash — the stash is repository-global and shared with any other agent).`,
    );
    return 2;
  }

  // 🔴 BASELINE FIRST, and it is not an optimisation. The old "did the restore work" check ran the
  // harnesses at the END and called any red one a FAILED RESTORE. `gates.harness.mjs` is red today
  // on purpose — its own message says "these are OPEN FINDINGS about the gates themselves, not
  // harness bugs" — so every ledger run printed "🔴 the restore failed" about a working restore and
  // exited 1. A confident wrong diagnosis, produced by the tool whose whole job is catching those.
  // Knowing which harnesses were ALREADY red makes the end-of-run claim mean what it says.
  // Three outcomes, not two — see `probeHarness`. A harness that SKIPS here can never testify
  // about a mutation, so the battery is refused BEFORE a single file is touched, exactly like the
  // missing-path guard above: the message arrives with a clean working tree.
  const probes = new Map(harnesses.map((h) => [h, probeHarness(runner, h, root)]));
  const skipped = harnesses.filter((h) => probes.get(h) === "skip");
  if (skipped.length) {
    console.error(
      `refusing to run: harness(es) SKIP on clean source, so this battery can prove nothing:\n  ` +
        skipped.join("\n  ") +
        `\nA skipped harness exits 0 through \`vigiles test\`, which this driver would read as ` +
        `"the mutation survived" — a claim about the TEST that is really a claim about the ` +
        `ENVIRONMENT. Install the capability the harness names (it says so on its skip line), ` +
        `or run the battery where that capability exists.`,
    );
    return 2;
  }
  const redBefore = new Set(harnesses.filter((h) => probes.get(h) === "red"));
  if (redBefore.size) {
    console.log(`ℹ️  already red before any mutation: ${[...redBefore].map(base).join(", ")} — excluded from the restore check, and any case naming one is reported as UNJUDGEABLE.`);
  }

  const originals = new Map(targets.map((f) => [f, readFileSync(f, "utf8")]));
  const restore = () => { for (const [f, text] of originals) writeFileSync(f, text); };

  // Restoring only in `finally` leaves a neutered checker on the disk when the run is killed —
  // and the next run then measures a repo that is already broken.
  const onSignal = (sig) => { restore(); process.exit(sig === "SIGINT" ? 130 : 143); };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const rows = [];
  try {
    for (const c of cases) {
      let problem = null;
      for (const [file, find, replace] of c.edits) {
        const src = readFileSync(file, "utf8");
        const n = src.split(find).length - 1;
        if (n !== 1) { problem = n === 0 ? `NOT FOUND in ${base(file)}` : `AMBIGUOUS (${n}) in ${base(file)}`; break; }
        const next = src.replace(find, replace);
        // The mutation-that-does-not-mutate guard, confirmed against the BYTES rather than the
        // intent. Nine of the ten files lacked it; a replacement equal to the original leaves a
        // green harness that proves nothing and reads exactly like a killed mutation.
        if (next === src) { problem = "NO-OP (replacement equals original)"; break; }
        writeFileSync(file, next);
      }
      if (problem) { rows.push([c.name, problem, c.disables]); restore(); continue; }

      // A non-kill is retried ONCE before it is believed. Observed on the ledger table: a row
      // killed as named came back DIFFERENT in a later full run and then reproduced as a clean
      // kill when replayed alone. Reporting a flake as a survivor sends the next reader to rewrite
      // a working assertion — a worse outcome than one extra run. A row that fails BOTH times is
      // a real finding and is printed without hedging.
      const attempt = () => {
        const r = run(c.harness, root);
        const out = (r.stdout || "") + (r.stderr || "");
        if (r.status === 0) return "🔴 SURVIVED";
        if (out.includes(c.expect)) return "RED (expected case)";
        // When the harness was ALREADY red, "red" carries no information — but the MESSAGE still
        // does, because node's assert aborts at the first failure, so a message that appears was
        // genuinely reached. Absent it, the two causes are indistinguishable and saying "different
        // case" would be a guess dressed as a verdict.
        return redBefore.has(c.harness)
          ? `🔴 UNJUDGEABLE (harness red before the run; "${c.expect}" never printed)`
          : `RED (but a DIFFERENT case: expected "${c.expect}")`;
      };
      let verdict = attempt();
      if (verdict !== "RED (expected case)") {
        const second = attempt();
        if (second === "RED (expected case)") verdict = "RED (expected case, on retry)";
        else verdict = second;
      }
      rows.push([c.name, verdict, c.disables]);
      restore();
    }
  } finally {
    restore();
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }

  const width = Math.max(...rows.map((r) => r[0].length));
  for (const [name, verdict, disables] of rows) console.log(`${name.padEnd(width)}  ${verdict.padEnd(38)} ${disables}`);

  // The restore is asserted, not assumed: every harness the run touched must be green again.
  // Only harnesses that were GREEN before can testify about the restore. One that was already red
  // proves nothing either way, and counting it was how this line came to lie.
  const cleanSet = (cleanHarnesses ?? harnesses).filter((h) => !redBefore.has(h));
  const stillRed = cleanSet.filter((h) => run(h, root).status !== 0);
  console.log(
    `\nrestored source: ${
      cleanSet.length === 0
        ? "NOT CHECKED — every harness here was already red before the run"
        : stillRed.length === 0
          ? "harness GREEN"
          : `🔴 RED — the restore failed (${stillRed.map(base).join(", ")})`
    }`,
  );

  // 🔴 `RED (expected`, not `RED`. Nine of the ten files counted a mutation killed by SOMEONE
  // ELSE'S assertion as a kill; only `ledger` required the named one. Taking the weak rule while
  // printing "each at its own assertion" below would have been a claim the mechanism did not back —
  // exactly the defect this whole directory exists to catch. Measured cost of the strict rule on
  // today's corpus: zero rows change verdict, because every row already came back as its own case.
  const survived = rows.filter((r) => !r[1].startsWith("RED (expected"));
  console.log(
    survived.length
      ? `🔴 ${survived.length} mutation(s) survived: ${survived.map((r) => r[0]).join(", ")}`
      // "each at its own assertion" is not decoration — a kill only counts when the harness went
      // red with the message the case named. A mutation killed by SOMEONE ELSE'S assertion means
      // two defects share one assertion and neither is really watched, and it lands in `survived`.
      : `✓ all ${rows.length} mutations killed by the harness, each at its own assertion`,
  );
  return survived.length || stillRed.length ? 1 : 0;
}

const base = (p) => p.split("/").pop();
