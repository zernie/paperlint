/**
 * osf-artifact-upload — the free, deterministic tier. No model, no network, no OSF.
 *
 * WHY THIS ONE IS NOT A `checkSkill()` ONE-LINER. It carries no
 * `announce.mjs <self>` line, so by the pipeline's own membership contract it is
 * not a stage — it is a utility `submit-paper` composes with, and the shared
 * per-skill checks would (correctly) reject it.
 *
 * WHAT IT CHECKS: the two rules this skill states about its OWN commands, in its
 * own §gotchas — that every `curl` carries `-g` (bracketed OSF params glob and
 * the request fails SILENTLY: empty body, no status) and `--cacert` (this
 * environment's proxy). The rule and its violation would live in the same file
 * three paragraphs apart, with nothing comparing them. That is `prose isn't
 * policy` at its smallest, applied to us.
 *
 * 🔴 THIS FILE WAS ~100 LINES ON 2026-08-11 AND IS NOW ~30. The difference is not
 * cleverness, it is that the parsing moved into vigiles (`commandsIn` /
 * `mustInclude`, shipped the same day for this reason). What remains is the rule
 * itself. That is the whole test of "mechanism in vigiles, data here": the
 * markdown parsing, the prose-vs-command distinction and the message formatting
 * are the same for anyone; the flags are ours.
 *
 * What it does NOT prove: that an upload works. That needs a live OSF project
 * and a real token, deliberately out of scope.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// ⚠️ `commandsIn`/`mustInclude` shipped AFTER vigiles 15.0.2. A test that simply
// threw on the import would read as "this skill is broken"; the honest state is
// "the check exists and its library is not here yet", so it SKIPS with exit 77 —
// the documented convention, which the runner surfaces as a loud ⊘ rather than a
// silent ✓. The guard stays even though 16.0.1 ships all three: it is what turns a
// future removal into a legible message instead of a stack trace.
//
// The subpath was `vigiles/testing` until v16 split the exports BY COST (#149) —
// free deterministic testing is now the root barrel, and anything that spends money
// lives in `vigiles/eval` behind a `paid_` prefix. These three are free.
const testing = await import("vigiles");
const { commandsIn, mustInclude, mustNotInclude, assertChecks, recordCheck } =
  testing;
if (typeof commandsIn !== "function") {
  console.log(
    "⊘ SKIP osf-artifact-upload: needs `commandsIn`/`mustInclude` from vigiles " +
      "(newer than the installed 15.0.2). The rules below are the test; only the " +
      "library that evaluates them is missing.",
  );
  process.exit(77);
}

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "SKILL.md"),
  "utf-8",
);
const curls = commandsIn(src, /(^|[|;&]\s*)curl\b/);

assertChecks(curls, [
  mustInclude(
    "-g",
    "the skill's own §gotchas: bracketed OSF params (?page[size]=50) glob and the " +
      "request fails SILENTLY — empty body, no status code. Silent is why this is " +
      "asserted rather than trusted.",
  ),
  mustInclude(
    "--cacert",
    "the skill's own §gotchas: this environment's proxy needs the CA bundle on every curl.",
  ),
  // Not stated in the file, and it should never need to be: this skill sends an
  // OSF bearer token, so an example that disabled TLS verification would teach
  // the agent to leak it on any hostile network.
  mustNotInclude(
    "-k",
    "this skill sends a bearer token; -k/--insecure disables verification and hands it to any proxy.",
  ),
]);

// The token check has no home in the command vocabulary — it is about the file's
// prose, not its commands. The skill's own instruction is "NEVER commit it,
// never echo it", and this file IS committed.
const literal = /\b[0-9a-fA-F]{40,}\b/.exec(src);
if (literal)
  throw new Error(
    `a literal credential-shaped string is present (${literal[0].slice(0, 12)}…). ` +
      `This skill's own text says "NEVER commit it, never echo it".`,
  );

// 🔴 WITHOUT THIS THE RUNNER READS THIS FILE AS DOING NOTHING, and says so:
// `∅ 0 CHECKS (it ran clean and verified nothing)` — and exits 1 on it, which is
// the whole job red. Everything above DOES assert; it just asserts through
// `assertChecks` and a thrown Error, neither of which increments the counter the
// runner reads. So the file was simultaneously the strictest thing here (it is the
// only guard standing between a bearer token and `-k`) and the reason CI was red.
//
// `recordCheck` exists for exactly this — its own doc says to call it "when you
// assert some OTHER way … instead of leaving it to conclude the file did nothing".
// Counted, not guessed: three command properties (-g, --cacert, no -k) across the
// curls, plus the one credential check over the file.
recordCheck(3 * curls.length + 1);

console.log(
  `✓ osf-artifact-upload: ${String(curls.length)} curl command(s) carry -g and --cacert, ` +
    `none disable TLS, no pasted credential`,
);
