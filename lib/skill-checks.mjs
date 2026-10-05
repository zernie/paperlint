/**
 * skill-checks.mjs — everything asserted about ONE skill, as a function you call with its name.
 * `checkSkill("verify-citations")`.
 *
 * WHY A FUNCTION AND NOT A HARNESS. Until 2026-08-11 these assertions lived in
 * `skills.harness.mjs`, a 614-line file named after no surface, and the 21 colocated per-skill
 * harnesses reached it by setting `PIPELINE_SKILL_ONLY` and importing it for its side effects.
 * That is a script pretending to be an API: the caller could not pass an argument, could not get
 * a result, and the coupling was an environment variable. The owner asked three times why the
 * file survived; the answer was that I had wrapped it instead of splitting it.
 *
 * WHAT IS CHECKED HERE. Anything decidable from one SKILL.md: strict-YAML frontmatter, the
 * declared tool contract, every script path it instructs, and whether it is PERMITTED to run what
 * it instructs.
 *
 * 🔴 KNOWN-RED ASSERTIONS ARE DEFERRED, NOT WEAKENED, and the deferral list is now PER CALL.
 * A throw would abort the rest, making one open finding silently skip every check after it —
 * the failure this whole directory exists to end. Per call matters too: with one shared list,
 * a full sweep could attribute one skill's failures to another's line in the report.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { recordCheck } from "vigiles";
import { presetsDir } from "#src/package-dirs";

import { SKILLS_DIR, ROOT, load, commands, permits } from "./skill-corpus.mjs";

// Where the pipeline's own scripts live is asked of the package, not spelled here. The resolver
// refuses a root that is not on disk, because every use below is a FILTER: a wrong prefix would
// match nothing and report a clean skill that was never examined.
import {
  pipelineScripts,
  scriptsRoot,
} from "../skills/paper-pipeline/scripts/consumer.mjs";

const PIPELINE = pipelineScripts(scriptsRoot({ env: {}, cwd: ROOT }));

/** How a skill names a file of the package's presets directory. */
const PRESETS_PREFIX = "presets/";

/** The preset files a skill's text names in code spans (`presets/agenticdev.md`), placeholders left out. */
export const presetRefs = (src) => [
  ...new Set(
    [...src.matchAll(/`(presets\/[A-Za-z0-9._-]+)`/g)].map((m) => m[1]),
  ),
];

/**
 * Assert everything single-skill about `name`. Throws with EVERY finding, not the first.
 * Returns the number of skills checked (1) so a caller can report what it actually did.
 */
export async function checkSkill(name) {
  if (!existsSync(join(SKILLS_DIR, name, "SKILL.md")))
    throw new Error(`"${name}" has no SKILL.md under ${SKILLS_DIR}`);
  const deferred = [];
  const soft = (fn) => {
    try {
      fn();
    } catch (e) {
      deferred.push(e);
    }
  };
  const skills = [load(name)];

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // 1. GONE, AND THAT IS THE RESULT (2026-08-19). This slot held a strict-YAML assertion whose whole
  // job was to police the gap between how the corpus was READ here (a hand-rolled lenient reader)
  // and how every other consumer reads it (a real YAML parser). The corpus owner, on being shown the gap:
  // "sounds like a hack… let's think about how to do it properly". The right fix was not a better
  // check — it was to stop being lenient: the two remaining unparseable descriptions were quoted and
  // `parseFm` in skill-corpus.mjs now throws on anything a real parser rejects.
  //
  // So the defect class is not detected here any more; it is UNREACHABLE. A skill whose frontmatter
  // is not valid YAML does not reach these assertions with a plausible-looking object and a missing
  // `allowed-tools` — it does not load at all, and says why. What the corpus does about the root
  // cause (`vigiles compile` interpolating the description into YAML raw) is written where the
  // parser lives.

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // 2-4. Identity and contract fields, read from the strict parse — there is no other kind now, and
  // nothing above can fail while leaving these reachable. `name` is what Claude Code lists and
  // matches the skill by, so a name that disagrees with its directory is two identities for one skill.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  for (const s of skills) {
    soft(() =>
      assert.equal(
        s.fm.name,
        s.name,
        `${s.name}: frontmatter name is ${JSON.stringify(s.fm.name)} but the directory is "${s.name}".`,
      ),
    );

    soft(() =>
      assert.ok(
        (s.fm.description || "").length > 40,
        `${s.name}: description is missing or trivially short (${(s.fm.description || "").length} chars). ` +
          `The description is the ONLY thing the model matches on when choosing a skill — an empty one is ` +
          `a skill that never fires, and a skill that never fires is indistinguishable from one that works.`,
      ),
    );

    soft(() =>
      assert.ok(
        s.tools.length > 0,
        `${s.name}: no allowed-tools. A skill declaring nothing INHERITS EVERYTHING — Bash, WebFetch and ` +
          `every MCP server (Calendar, GitHub-write, Vercel) — over a repo holding health data, DNA and ` +
          `bank balances. This is the finding the 2026-08-03 audit closed for all 35 skills.`,
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // 7. EVERY script path the skill instructs resolves.
  //
  // Scoped to paths that are unambiguously resolvable: `.claude/…` is repo-root-relative and
  // `scripts/…` is skill-relative (both conventions are used consistently across the corpus). Paths
  // like `repro/build-submission.sh` are relative to a PAPER directory that does not exist at test
  // time, so they are excluded BY NAME rather than by a guess that would fire on correct text.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  for (const s of skills) {
    for (const c of commands(s.src)) {
      const abs = c.script.startsWith(".claude/")
        ? join(ROOT, c.script)
        : c.script.startsWith("scripts/")
          ? join(SKILLS_DIR, s.name, c.script)
          : null;
      if (!abs) continue;
      soft(() =>
        assert.ok(
          existsSync(abs),
          `${s.name}: instructs \`${c.cmd}\` but ${c.script} does not exist (looked at ${abs}). Dead ` +
            `instruction — the model will improvise something adjacent and report it as done.`,
        ),
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // 8. A skill is PERMITTED TO RUN what it instructs. The inverse-direction risk of narrowing: over-
  // narrow an allowed-tools entry and the skill's own instruction is denied at runtime, which looks
  // like the skill silently declining a step — the same invisible failure as a dead hook, arrived at
  // from the opposite direction. Nothing else checks the two halves against each other.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  for (const s of skills) {
    for (const c of commands(s.src)) {
      // The pipeline's own scripts; any other command is the consumer's business.
      if (!c.script.startsWith(PIPELINE.prefix)) continue;
      soft(() =>
        assert.ok(
          s.tools.some((t) => permits(t, c.cmd)),
          `${s.name}: instructs \`${c.cmd}\` but its allowed-tools [${s.tools.join(", ")}] permit no such ` +
            `Bash command. The instruction is denied at runtime and the step silently does not happen.`,
        ),
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // 9. EVERY PRESET FILE the skill names exists in the package. Skills name a venue's card and preset
  // as `presets/<name>.md` / `presets/<name>.jsonc` "in the package" — a path inside the package, the
  // same in every install channel — and the cards once lived under a skill's `references/`, so a
  // name that outlived a move would send the model to a file that is not there. Resolved against
  // the package's presets directory (`#src/package-dirs`, the one module that knows where it is).
  // Placeholders (`presets/<venue>.md`) are not names of a file and are left out.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  for (const s of skills) {
    for (const ref of presetRefs(s.src)) {
      const abs = join(presetsDir(), ref.slice(PRESETS_PREFIX.length));
      soft(() =>
        assert.ok(
          existsSync(abs),
          `${s.name}: names \`${ref}\` in the package, and there is no such file (looked at ${abs}).`,
        ),
      );
    }
  }

  if (deferred.length) {
    const e = new Error(
      `${deferred.length} assertion(s) failed for skill "${name}":\n\n` +
        deferred.map((d, i) => `  [${i + 1}] ${d.message}`).join("\n\n"),
    );
    e.stack = e.message;
    throw e;
  }
  // Reported so `vigiles test` can tell a run that verified this skill from a file that merely
  // sits beside it — the distinction colocation cannot make (see vigiles check-count.ts).
  recordCheck();
  console.log(`✓ ${name}: frontmatter, script paths, tool contract`);
  return 1;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// checkProseSkill — for skills WITHOUT the pipeline (2026-08-27)
//
// WHY A SEPARATE FUNCTION. A prose skill only writes text, so Bash, Agent and Task are banned
// unless an exemption names a reason; a pipeline skill runs its scripts through narrowed Bash
// entries and is checked instead for whether those scripts exist and are permitted.
//
// 🔴 BOTH HALVES ARE BUILT IN, NOT WRITTEN BY HAND. The `CLAUDE.md` rule requires two halves of
// every check: it fires on a planted defect AND it stays silent on clean input. The "fires" half is
// written less often — it is not needed to make a run go green. So here it is not entrusted to the
// author: EVERY predicate below is run twice — over the real text and over the mutated one, and the
// disagreement of the verdicts IS the assertion. The mutation cannot be forgotten, there is nowhere
// to forget it.
//
// WHAT THIS DOES NOT PROVE: that the skill fires on the right request and that its advice gives a
// good result. The first is the trigger eval, the second is the model. Only what is decidable from
// the text is here.
// ═════════════════════════════════════════════════════════════════════════════════════════════════

/** Relative markdown links that do not resolve from the skill's directory. */
function danglingLinks(src, dir) {
  const out = [];
  for (const m of src.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const t = m[1].split("#")[0];
    if (!t || /^(https?:|mailto:)/.test(t)) continue;
    if (!existsSync(join(dir, t))) out.push(t);
  }
  return out;
}

/**
 * Check the prose skill `name`.
 *
 * @param {string} name — the directory name in `.claude/skills/`
 * @param {{toolsNeeded?: Record<string,string>}} opts
 *   `toolsNeeded` — {tool: REASON}. Lifts the ban on Bash/Agent/Task for a skill that
 *     needs the tool IN SUBSTANCE. The reason is mandatory and non-empty.
 *
 * 🔴 Why `toolsNeeded` appeared (2026-09-01) and why it carries a REASON rather than a flag.
 * The ban on Bash/Agent/Task was written for two text-only skills and was hard-wired as
 * universal: "a skill that only writes text". For `session-retro` that is a lie — its own
 * instruction prescribes SPAWNING auditors ("Spawn parallel audit subagents") and running
 * measurements, that is, without Agent and Bash it does not do what it is.
 *
 * The temptation was to switch the check off for it entirely. That is wrong: the ban protects
 * a repository with health data and balances from the third leg of the lethal trifecta, and it
 * is still right for the rest. So it is not a flag but a NAMED exemption with a reason — the
 * same form as `vigiles:local-by-design` in this same knowledge base: switching off is
 * possible, but it stays written down, and the next reader sees WHAT exactly was decided.
 */
export async function checkProseSkill(name, opts = {}) {
  const { skillContract } = await import("vigiles");
  const dir = join(SKILLS_DIR, name);
  const md = join(dir, "SKILL.md");
  const deferred = [];
  const soft = (fn) => {
    try {
      fn();
    } catch (e) {
      deferred.push(e);
    }
  };

  // Any other option is refused by name: an option this function no longer reads would be a
  // check the caller believes runs and that does nothing.
  const unknown = Object.keys(opts).filter((k) => k !== "toolsNeeded");
  assert.deepEqual(
    unknown,
    [],
    `${name}: unknown option(s) ${unknown.join(", ")} — checkProseSkill takes only toolsNeeded`,
  );
  assert.ok(existsSync(md), `${name}: no ${md} — nothing to check`);
  const src = readFileSync(md, "utf8");

  // 1. The tool contract. Both skills deliberately DROPPED Bash — it was the third leg of the
  // lethal trifecta over a repo with health data and balances. A regression here is silent: a
  // skill with no parseable `allowed-tools` INHERITS EVERYTHING, and that looks exactly like a
  // declared contract.
  const c = await skillContract(dir);
  soft(() =>
    assert.equal(
      c.malformed,
      false,
      `${name}: allowed-tools does not parse. The file LOOKS like it declares a contract, while a ` +
        `strict parser sees nothing — the skill silently inherits every tool. Known cause: ` +
        `\`vigiles compile\` strips the quotes off a scalar containing ": " and breaks the YAML ` +
        `(see CLAUDE.md, measured 2026-08-19).`,
    ),
  );
  soft(() =>
    assert.ok(
      c.declared.length > 0,
      `${name}: empty allowed-tools — inherits everything`,
    ),
  );
  const needed = opts.toolsNeeded ?? {};
  // An exemption without a reason is not an exemption: an empty string would pass as "decided"
  // while saying nothing. The same miss as "a counter that counts what it ignores".
  for (const [tool, why] of Object.entries(needed))
    assert.ok(
      typeof why === "string" && why.trim().length >= 10,
      `${name}: toolsNeeded.${tool} is declared without an intelligible reason. An exemption must ` +
        `say WHY the tool is needed in substance — otherwise it is a silent disabling of the check.`,
    );
  for (const banned of ["Bash", "Agent", "Task"]) {
    if (banned in needed) continue;
    soft(() =>
      assert.ok(
        !c.declared.includes(banned),
        `${name}: ${banned} appeared in the contract. It was dropped deliberately; bringing it back ` +
          `restores a leg of the lethal trifecta (data + network + execution) on a skill that only ` +
          `writes text. If the tool IS needed IN SUBSTANCE — declare it in toolsNeeded WITH A REASON, ` +
          `not silently.`,
      ),
    );
  }
  // The other side: an exemption that exempts nothing is garbage, and garbage accumulates.
  // A year later such lines read as "there was a risk here", though there is no risk.
  for (const tool of Object.keys(needed))
    soft(() =>
      assert.ok(
        c.declared.includes(tool),
        `${name}: toolsNeeded.${tool} is declared, but ${tool} itself is NOT in the contract. ` +
          `The exemption is stale — remove it, otherwise it describes a different skill.`,
      ),
    );

  // 2. Links. The class we got burned on 2026-08-27: a file moves one level deeper, the link
  // stays as it was and silently stops resolving. A grep by name does not see that.
  const dangling = danglingLinks(src, dir);
  soft(() =>
    assert.deepEqual(
      dangling,
      [],
      `${name}: dangling links → ${dangling.join(", ")}. A skill naming a path that does not exist ` +
        `is a dead instruction: the model reads it, does something adjacent and reports success.`,
    ),
  );

  // 3. Whether it is compiled. Editing the markdown by hand desynchronises the sha and gets
  // quietly rolled back by the next `vigiles compile`.
  soft(() =>
    assert.ok(
      /vigiles:sha256:/.test(src),
      `${name}: no compilation mark. That means SKILL.md was edited by hand rather than through ` +
        `.spec.ts — the next \`vigiles compile\` will overwrite the edit without warning.`,
    ),
  );

  if (deferred.length)
    throw new AggregateError(deferred, `${name}: ${deferred.length} findings`);
  recordCheck();
  return 1;
}
