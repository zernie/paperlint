/**
 * skill-eval-kit.mjs — run ONE skill's trigger case. The body behind every
 * colocated `<skill>.eval.mjs`.
 *
 * WHAT IT MEASURES, and why this is the tier that was missing. The free harness
 * next to it proves a skill's frontmatter parses and its wiring points at real
 * scripts. It cannot prove the skill FIRES, because whether a model picks a skill
 * out of ~39 competing descriptions is a property of a real model reading them.
 * `vigiles lint` counted that gap out loud — "37 whose firing was never measured"
 * — and this closes it one skill at a time.
 *
 * Two numbers, both required, because either alone is gameable:
 *   recall     — does it fire on prompts about its own territory?
 *   precision  — does it stay quiet on a SIBLING's territory? The irrelevant set
 *                is the colliding sibling's own should-fire prompts, so a skill
 *                that fires on everything scores high recall and is caught here.
 *
 * 🔴 WHOLE-HARNESS BY CONSTRUCTION. `pluginDir` is the repo's real `.claude`, so
 * the skill competes against every other installed skill exactly as it does in a
 * live session. An isolated measurement OVERSTATES recall and UNDERSTATES false
 * positives — vigiles's own `TriggerRateSpec.installSet` doc says so — and the
 * number that matters here is the one from the harness the author actually runs.
 *
 * COSTS MONEY. This is the paid tier: a real model, one run per prompt per trial.
 * Not CI. Run it deliberately:
 *
 *   node .claude/skills/<skill>/<skill>.eval.mjs [trials]
 *   npx vigiles eval ".claude/skills/*(/)*.eval.mjs"
 *
 * vigiles:local-by-design — the measurement itself is `measureTriggerRate` in vigiles;
 * what stays here is this corpus's wiring: OUR prompt cases, OUR stub-paper fixture,
 * OUR namespaced loose-skills id and env knobs. Generic-looking because every local
 * thing it names arrives through an import, which is what the detector keys on.
 */
// ⚠️ ALL FROM `vigiles/testing`. There is no `vigiles/eval` subpath — importing
// one throws ERR_PACKAGE_PATH_NOT_EXPORTED. Checked against the installed package
// rather than assumed: the same wrong import shipped inside vigiles's own
// `test-harness` skill for months (it taught `scriptModel` from `vigiles/testing`,
// where it is deliberately absent) and nothing caught it, because a broken example
// in a document is read by a model, not executed.
import { formatTriggerRateReport, skillResolved } from "vigiles";
// ⚠️ A DEFAULT import, not a named one. `vigiles/eval` is CommonJS, and Node determines the
// named exports by heuristic (cjs-module-lexer): it finds `paid_measureTriggerRate` but NOT
// `whichSkillsFired`, and the file fails with a SyntaxError before its first line. Caught by a
// run, not by reading: the build looks identical in both cases.
import evalPkg from "vigiles/eval";
const { paid_measureTriggerRate: measureTriggerRate } = evalPkg;
const { whichSkillsFired } = evalPkg;
import { resolve } from "node:path";
import { consumerRoot } from "../skills/paper-pipeline/scripts/consumer.mjs";

import { BY_SKILL, irrelevantFor } from "./skill-trigger-cases.mjs";
import { FIXTURE } from "./skill-eval-fixture.mjs";

// The CONSUMER's root — the live harness being measured is the consumer's, not this package's.
const REPO = consumerRoot();

/** Namespace vigiles installs a LOOSE skills dir under (see `skillsDir` below). */
const LOOSE_NS = "vigiles-loose-skills";

/**
 * Measure one skill's trigger rate against the live harness.
 *
 * @param {string} skill  name of the skill, matching its directory
 * @param {{trials?: number, min?: number, maxFalsePositive?: number}} [opts]
 */
export async function runSkillTriggerEval(skill, opts = {}) {
  /** Who fired on each run — filled in by the `fired` predicate below. */
  const WINNERS = [];
  const c = BY_SKILL.get(skill);
  if (!c)
    throw new Error(
      `no trigger case for "${skill}". Add one to .claude/lib/skill-trigger-cases.mjs — ` +
        `an eval file with no case is a file that measures nothing, which is the ` +
        `defect this corpus exists to stop.`,
    );

  /** Control prompts — a neighbour's win on these is EXPECTED and stays out of the diagnostics. */
  const IRRELEVANT = new Set(irrelevantFor(skill));

  /** The run's first user prompt, or null if the transcript has a different shape. */
  const firstUserPrompt = (t) => {
    const msgs = t?.messages ?? t?.transcript ?? [];
    for (const m of Array.isArray(msgs) ? msgs : []) {
      if (m?.role !== "user") continue;
      const c = m.content;
      if (typeof c === "string") return c;
      if (Array.isArray(c)) {
        const txt = c.find((b) => typeof b?.text === "string");
        if (txt) return txt.text;
      }
    }
    return null;
  };

  const trials = Number(
    opts.trials ?? process.env.VIGILES_TRIALS ?? process.argv[2] ?? 1,
  );

  // Model is a KNOB, not a default to drift on. Sonnet is the floor vigiles
  // enforces because trigger-rate is a SELECTION measurement and a weaker
  // selector under-fires: the same skill measured 0.50 on haiku and 0.90 on
  // sonnet, so a haiku number reads as "bad description" when the description is
  // fine. Running haiku deliberately therefore requires lowering `minModel` too —
  // the tool makes you say you meant it.
  //
  // The question this existed to answer: is haiku a valid LOWER BOUND, i.e. does
  // everything that fires on haiku also fire on sonnet? If containment holds,
  // tuning against haiku buys a safety margin cheaply.
  //
  // ANSWERED 2026-08-11 — it DOES NOT HOLD. Measured across 84 prompts, 21 skills,
  // both models: three counterexamples fire on haiku and NOT on sonnet. So a haiku
  // number is not a floor under the sonnet number; it is a different number.
  // Raw data + the reproduction command: `vigiles/s63.md` and
  // `vigiles/repro/skill-trigger-2026-08-11/`. The sibling `model-containment.mjs`
  // carries the same verdict — do not re-open this by reading only this file.
  const model = opts.model ?? process.env.VIGILES_MODEL ?? "sonnet";

  const report = await measureTriggerRate({
    name: `skill-trigger-${skill}`,
    // 🔴 `skillsDir`, NOT `pluginDir`. `.claude/skills` is a LOOSE skills
    // directory; `pluginDir` wants a complete plugin (`.claude-plugin/plugin.json`).
    // `skillsDir` packages the loose dir into a throwaway `--plugin-dir` install.
    // Getting this wrong is not a subtle failure — the first run of this kit used
    // `pluginDir` and reported 0% recall on prompts written FOR the skill, which
    // reads exactly like a finding about the skill. `pipeline-firing.eval.mjs`
    // warns about this by name; I hit it anyway by not reading it first.
    skillsDir: resolve(REPO, ".claude", "skills"),
    stubSkillBodies: true, // selection is decided by frontmatter; don't run the body
    minPrompts: 4, // deliberate: four NAMED phrasings, not a rate estimate
    prompts: c.prompts,
    irrelevantPrompts: irrelevantFor(skill),
    // The installed namespace for a loose skills dir — `skillResolved` matches the
    // NAMESPACED id, and a bare name silently never matches (the second half of
    // the same 0% above).
    // 🔴 SIDE DIAGNOSTICS THAT COST ZERO. Measured 2026-08-28: across 24 skills the median
    // recall is 50%, and three gave a CLEAN ZERO. But the number "did not fire" does not
    // answer the question that decides the fix: did NOBODY come, or did a NEIGHBOUR come?
    // Those are different diseases — the first is cured by the description, the second by
    // drawing a boundary, and "make the description louder" in the second case will collapse
    // precision for the whole folder at once.
    //
    // The trace is already here, in the predicate. So the winner can be recorded for free —
    // without a single extra call to the model. Until this day the diagnostics would have
    // required a second paid run, and that is why nobody did it.
    fired: (t) => {
      // 🔴 TARGET PROMPTS ONLY (review #189). This callback is invoked both for
      // `prompts` and for `irrelevantPrompts` — the controls, on which the neighbour
      // and not we SHOULD fire. Recording winners indiscriminately, the diagnostics
      // then printed these LAWFUL wins as "instead of <skill>": a healthy run read as
      // a borderline collision and pushed toward fixing a description that is fine.
      // The prompt is pulled out of the transcript; if that fails we do not record,
      // because a false line in the diagnostics is worse than a missing one.
      try {
        const p = firstUserPrompt(t);
        if (p !== null && !IRRELEVANT.has(p)) WINNERS.push(whichSkillsFired(t));
      } catch {
        /* the diagnostics are optional — the verdict is computed by skillResolved */
      }
      return skillResolved(t, `${LOOSE_NS}:${skill}`);
    },
    // 🔴 REQUIRED, not decoration. Each run gets a fresh EMPTY cwd; asking "grade
    // the writing on this paper" where no paper exists makes not-firing the
    // correct behaviour. Measured on the first full sweep: four skills scored 0%
    // on prompts that had fired before, purely because the directory was bare.
    fixture: FIXTURE,
    trials,
    model,
    // Lowered to whatever was asked for, so a deliberate haiku run is possible.
    // Left at the tool's own floor otherwise.
    minModel: model,
    // Matching `pipeline-firing.eval.mjs`, which has run this way. The wall-clock
    // cost is dominated by session STARTUP, not by the skill: each run ships the
    // root CLAUDE.md (~98 KB) plus 39 descriptions plus the CLI's own system
    // prompt, ~30 s apiece. Three in flight turns ~84 min into ~30 for the full
    // corpus. Metered cost is zero either way — these run on the subscription.
    concurrency: Number(
      opts.concurrency ?? process.env.VIGILES_CONCURRENCY ?? 3,
    ),
  });

  // Who was winning instead of us — printed only when there is something to show.
  {
    const others = WINNERS.flat()
      .map((x) => String(x).replace(`${LOOSE_NS}:`, ""))
      .filter((x) => x && x !== skill);
    if (others.length) {
      const tally = {};
      for (const o of others) tally[o] = (tally[o] || 0) + 1;
      const top = Object.entries(tally).sort((a, b) => b[1] - a[1]);
      console.log(
        `\nfired instead of ${skill}: ` +
          top.map(([k, v]) => `${k}×${v}`).join(", "),
      );
    } else if (WINNERS.length && !WINNERS.some((w) => w.length)) {
      console.log(
        `\nNOBODY fired instead of ${skill} — no skill was chosen at all. ` +
          `This is a defect of the DESCRIPTION, not of the boundary with a neighbour.`,
      );
    }
  }
  console.log(`\n${skill} — ${c.why} [model: ${model}]`);
  console.log(formatTriggerRateReport(report));
  if (report.n === 0) throw new Error("no runs executed");

  // Record that THIS description text was measured. Added 2026-08-28: before that recall was
  // a number obtained once — reword the description, and nobody catches the firing regression.
  // It is written AFTER the run and only when n > 0, otherwise the ledger would assert a
  // measurement that never happened.
  {
    const { recordRun } = await import("./trigger-ledger.mjs");
    recordRun(skill, {
      recall: report.rate ?? report.triggerRate ?? null,
      precision: report.precision ?? null,
      model,
      trials,
    });
  }

  // Machine-readable row, appended when asked. The printed report TRUNCATES each
  // prompt, so comparing two models' per-prompt outcomes off the text would match
  // on prefixes — fine until two prompts share one. This keeps the full prompt.
  if (process.env.VIGILES_RESULTS) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(
      process.env.VIGILES_RESULTS,
      JSON.stringify({
        skill,
        model,
        trials,
        rate: report.rate,
        falsePositiveRate: report.falsePositiveRate,
        precision: report.precision,
        competitors: report.competitors,
        perPrompt: report.perPrompt.map((p) => ({
          prompt: p.prompt,
          rate: p.rate,
        })),
      }) + "\n",
    );
  }

  // Reported, NOT gated by default. These 21 cases have never all been run, so a
  // threshold now would be a number invented before the measurement — exactly the
  // shape this repo keeps catching. Pass { min } once a baseline exists.
  if (opts.min !== undefined || opts.maxFalsePositive !== undefined) {
    const { assertTriggerRate } = await import("vigiles/testing");
    assertTriggerRate(report, {
      min: opts.min ?? 0,
      maxFalsePositive: opts.maxFalsePositive ?? 1,
    });
  }
  return report;
}
