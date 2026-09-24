/**
 * trigger-ledger.mjs — "this description was measured, here is when and with what result".
 *
 * WHY. Trigger evals cost money and are therefore not in CI ("Not CI. Run it deliberately" —
 * that is what every `*.eval.mjs` says). The consequence, measured 2026-08-28: recall is a
 * quantity obtained ONCE, not one that is maintained. Let anyone reword a `description`
 * tomorrow — nobody will ever catch the firing regression, because there is nothing and
 * nobody to catch it with.
 *
 * 🔴 WHY THE READY-MADE `skillHash()` WAS NOT TAKEN. It hashes the WHOLE skill directory
 * (`.md`, `.mjs`, `.sh`, `.py`, `.ts`). EXACTLY ONE FIELD affects the model's choice of a
 * skill — `description`: the eval kit sets `stubSkillBodies: true` with the comment
 * "selection is decided by frontmatter; don't run the body". Had we taken the whole
 * directory, the gate would redden at a typo in the body and at every new harness, that is,
 * almost always. A check that is red for no reason lives one day, gets silenced, and the hole
 * comes back, this time unnoticed. So the field is what gets hashed.
 *
 * ⚠️ WHAT THIS LEDGER DOES NOT KNOW. It does not know that a description got BETTER or WORSE
 * — only that it is DIFFERENT. The verdict still comes from the paid run; all that is
 * recorded here is that the run relates to this text and not to some earlier one.
 *
 * vigiles:local-by-design — the generic version ("coverage must cover the eval tier, not only
 * the harness") belongs to the product: `.vigiles/coverage.json` is written by the CLI from a
 * completed run, while `*.eval.mjs` are started as `node <file>` past the CLI, so there are
 * ZERO evals there against 50 harness records (measured 2026-08-28). What stays here is ours:
 * WHICH of our descriptions were measured and with what number.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  consumerRoot,
  installedSkills,
} from "../skills/paper-pipeline/scripts/consumer.mjs";

// The CONSUMER's root, not this file's grandparent — see the same note in `skill-corpus.mjs`.
// The ledger itself (`.claude/skill-trigger-runs.json`) is the consumer's DATA and stays there;
// only the code that reads and writes it lives here.
export const ROOT = consumerRoot();
export const LEDGER = join(ROOT, ".claude", "skill-trigger-runs.json");
const SKILLS = join(ROOT, ".claude", "skills");

// THE DEBT BASELINE WAS DELETED 2026-08-28. A ratchet with 24 names "never measured once"
// stood here — and it was a way of not doing the work. The corpus owner: "a ratchet again, fuck…
// let's just fix it properly". All 24 were run (~40 min of machine time, $0 metered —
// subscription), the debt is paid off, the check became an ordinary gate. Its meaning changed
// with that: it was "the debt does not grow", it became "a measurement must relate to the
// current description". The same transition as the markdown-regex debt, and for the same
// reason — paying it off is cheaper than servicing it.

/** The exact text of `description:` from the frontmatter. Empty string if the field is absent. */
export function descriptionOf(skill) {
  const p = join(SKILLS, skill, "SKILL.md");
  if (!existsSync(p)) return "";
  const src = readFileSync(p, "utf8");
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return "";
  // description may be multi-line, up to the next top-level key
  const m = fm[1].match(
    /^description:[ \t]*([\s\S]*?)(?=\r?\n[a-zA-Z_-]+:|$)/m,
  );
  return m ? m[1].trim() : "";
}

export const hashOf = (s) =>
  createHash("sha256").update(s).digest("hex").slice(0, 16);

/**
 * A hash of the WHOLE set of descriptions — "against whom it was measured".
 *
 * 🔴 Why a second mark (the corpus owner's question, 2026-08-28). A trigger eval measures the
 * model's CHOICE out of all installed descriptions — the kit says exactly that: "whole-harness by
 * construction… an isolated measurement OVERSTATES recall and UNDERSTATES false positives". So my
 * recall can go stale from an edit to a NEIGHBOUR'S DESCRIPTION: it starts winning my prompts
 * while my own description does not change by a single character. A hash of my own field is not
 * enough for that.
 *
 * ⚠️ But hashing the corpus STRICTLY is not allowed either: one edit to any description would
 * void every record at once, and the check would again be always-red. Hence the different
 * loudness:
 * my own description changed → THE MEASUREMENT IS INVALID (an error);
 * the set of competitors changed → the measurement WEAKENED (a note in the ledger, no shouting).
 */
export function corpusHash() {
  const names = installedSkills(SKILLS);
  return hashOf(
    names.map((n) => n + "\u0000" + descriptionOf(n)).join("\u0001"),
  );
}

export const readLedger = () =>
  existsSync(LEDGER)
    ? JSON.parse(readFileSync(LEDGER, "utf8"))
    : { v: 1, runs: {} };

/** Record a measurement that happened. Called by the kit AFTER the run, not before. */
export function recordRun(skill, { recall, precision, model, trials }) {
  const l = readLedger();
  l.runs[skill] = {
    description_sha: hashOf(descriptionOf(skill)),
    corpus_sha: corpusHash(),
    measured_at: new Date().toISOString().slice(0, 10),
    recall,
    precision,
    model,
    trials,
  };
  writeFileSync(LEDGER, JSON.stringify(l, null, 2) + "\n");
  return l.runs[skill];
}

/**
 * Skills that HAVE an `*.eval.mjs` but whose measurement does not relate to the current
 * description. Returns [{skill, reason}]. `reason` — 'never' or 'changed'.
 */
export function staleSkills(skillsWithEval) {
  const l = readLedger();
  const out = [];
  for (const s of skillsWithEval) {
    const rec = l.runs[s];
    if (!rec) {
      out.push({ skill: s, reason: "never" });
      continue;
    }
    if (rec.description_sha !== hashOf(descriptionOf(s))) {
      out.push({ skill: s, reason: "changed", measured_at: rec.measured_at });
      continue;
    }
    // The skill's own description is the same but the competitors differ — the measurement
    // weakened, it did not die.
    if (rec.corpus_sha && rec.corpus_sha !== corpusHash())
      out.push({
        skill: s,
        reason: "corpus",
        measured_at: rec.measured_at,
        soft: true,
      });
  }
  return out;
}

// ── CLI: `node .claude/lib/trigger-ledger.mjs --check` ────────────────────────────
// Cheap: no model, no network — only reading frontmatter and comparing hashes.
// That is exactly why this can be kept in CI, unlike the evals themselves.
if (process.argv[1] && process.argv[1].endsWith("trigger-ledger.mjs")) {
  const withEval = installedSkills(SKILLS).filter((d) =>
    existsSync(join(SKILLS, d, `${d}.eval.mjs`)),
  );
  // A RATCHET, not a gate. Measured 2026-08-28 on a clean tree: 24 findings "never measured
  // once" — for the paper skills firing had been measured earlier, just not into this ledger,
  // which is five minutes old. A check with 24 red lines on its first day does not get read, it
  // gets silenced: that is exactly how the markdown-regex debt already died in this repo, and
  // there it was turned into a ratchet.
  //
  // So: "the description changed after the measurement" — LOUD ALWAYS, that is the very
  // regression all of this was started for. "Never measured once" — loud only for skills that
  // are not in the debt baseline, that is, for NEW ones. The debt does not grow silently, but it
  // does not shout on every run either.
  const all = staleSkills(withEval);
  const soft = all.filter((x) => x.soft);
  const stale = all.filter((x) => !x.soft);
  // ONE line, not one line per skill. Measured 2026-08-28: an edit to ONE description changes
  // the corpus hash as a whole, and per-line output produced 27 notes at once. Twenty-seven
  // informational lines per edit is noise, and noise gets silenced; and then the hard half stops
  // being read along with it.
  // Three names + a counter, not only a counter and not 27 lines. A bare counter cannot be
  // checked and gives nothing to start a re-measurement from; one line per skill is 27 lines of
  // noise per edit (measured 2026-08-28). The assertion "the note is addressed" in the harness
  // requires exactly the names — and it was RED from 2026-08-28 to 2026-08-31, because the code
  // printed only the counter: the harness was written, declared working, and not run.
  if (soft.length) {
    const names = soft
      .slice(0, 3)
      .map((x) => x.skill)
      .join(", ");
    console.log(
      `ℹ️ the set of competing descriptions changed after the last measurement — ` +
        `for ${soft.length} skill(s) recall may have shifted without their own description being ` +
        `touched (${names}${soft.length > 3 ? ` and ${soft.length - 3} more` : ""}). ` +
        `Not an error: re-measure when convenient.`,
    );
  }
  // 🔴 THE DENOMINATOR IS MANDATORY. The line "✓ current for 27" reads as "27 skills are fine",
  // whereas the true statement is "27 of 50 fall under this check at all": a skill without its
  // own .eval.mjs is inexpressible for this gate, there is nothing to re-measure for it.
  // Measured 2026-08-31: 50 skills on disk, 27 with an eval, 23 without. That day I changed the
  // description of telegram-channel-audit (no eval), the gate printed green, and that looked
  // like "the change was verified". A counter that does not name what it ignores lies — the
  // CLAUDE.md rule §"A counter that counts what it IGNORES".
  const total = installedSkills(SKILLS).length;
  const noEval = total - withEval.length;
  if (!stale.length) {
    console.log(
      `✓ trigger measurements are current for ${withEval.length} skill(s) of ${total}` +
        (noEval
          ? ` — the other ${noEval} have NO .eval.mjs of their own, they are outside this ` +
            `check by construction (nothing to measure, not "fine")`
          : ""),
    );
    process.exit(0);
  }
  for (const s of stale) {
    console.error(
      s.reason === "never"
        ? `✗ ${s.skill}: ${s.skill}.eval.mjs exists, but a firing measurement NEVER happened`
        : `✗ ${s.skill}: description changed after the ${s.measured_at} measurement — recall relates to the former text`,
    );
  }
  console.error(
    `\nRun it: node .claude/skills/<skill>/<skill>.eval.mjs` +
      `\nThis is the paid tier (a real model), so CI does not run it — it only requires that a run ` +
      `exists and relates to the current description.`,
  );
  process.exit(1);
}
