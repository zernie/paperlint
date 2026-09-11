/**
 * Mutation battery for the guard against a green zero, `scripts/rules-see-files.mjs`.
 * Run: `node scripts/rules-see-files.mutations.mjs` (not `vigiles test` — not a harness).
 *
 * 🔴 WHY THIS GUARD NEEDS A MUTATION BATTERY MORE THAN ANYTHING ELSE HERE. Its success state
 * is an empty list, which is the exact state it was built to distrust. A guard that has only
 * been observed quiet is indistinguishable from a guard that does nothing — that is the whole
 * premise of the thing being guarded, applied to the guard itself.
 *
 * BOTH DIRECTIONS, one mutation each, and they must die on DIFFERENT assertions:
 *   - `under-report` makes the guard incapable of ever calling a rule blind. The quiet half of
 *     its harness stays green; the FIRING half must go red.
 *   - `over-report` makes it call everything blind. The firing half stays green (it still names
 *     `probe/dead`, among others); the QUIET half must go red.
 * A battery in which both mutations died on the same assertion would prove only that one of the
 * two halves exists.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GUARD = "scripts/rules-see-files.mjs";
const HARNESS = "scripts/rules-see-files.harness.mjs";
const PRISTINE = readFileSync(GUARD, "utf8");

const M = [
  [
    "under-report",
    "never call a rule blind — the guard becomes the silent green it exists to catch",
    "blind: rules.filter((r) => r.files === 0).map((r) => r.rule)",
    "blind: [] /* MUT */",
  ],
  [
    "over-report",
    "call every rule blind — the guard becomes noise, and noise gets switched off within a day",
    "      if (effective.rules?.[id] && !isOff(effective.rules[id])) seen.set(id, seen.get(id) + 1);",
    "      if (false) seen.set(id, seen.get(id) + 1); /* MUT */",
  ],
];

const runHarness = () => {
  try {
    execFileSync("npx", ["vigiles", "test", HARNESS], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { failed: false, out: "" };
  } catch (e) {
    return { failed: true, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
};

{
  const base = runHarness();
  if (base.failed) {
    console.log(
      "❌ THE HARNESS IS RED BEFORE ANY MUTATION — the battery cannot tell a killed mutation " +
        "from that:\n" + base.out.slice(-1500),
    );
    process.exit(1);
  }
}

let ok = 0;
let bad = 0;
const rows = [];
for (const [label, what, from, to] of M) {
  const hits = PRISTINE.split(from).length - 1;
  if (hits !== 1) {
    console.log(`❌ ${label}: TARGET ${hits === 0 ? "NOT FOUND" : `NOT UNIQUE (${hits})`} — ${from.slice(0, 70)}`);
    bad++;
    continue;
  }
  writeFileSync(GUARD, PRISTINE.replace(from, to));
  const on = readFileSync(GUARD, "utf8");
  if (!on.includes(to) || on.includes(from)) {
    console.log(`❌ ${label}: THE MUTATION DID NOT LAND (checked by re-reading the file)`);
    bad++;
    writeFileSync(GUARD, PRISTINE);
    continue;
  }
  const { failed, out } = runHarness();
  writeFileSync(GUARD, PRISTINE);
  if (readFileSync(GUARD, "utf8") !== PRISTINE) {
    console.log(`❌ ${label}: THE ROLLBACK FAILED`);
    bad++;
    continue;
  }
  const at = (out.match(/rules-see-files\.harness\.mjs:(\d+)/) ?? [])[1];
  const msg = (out.match(/AssertionError[^:]*: ([^\n]+)/) ?? [])[1] ?? "";
  if (failed) {
    ok++;
    rows.push([label, what, ((at ? `harness:${at} · ` : "") + msg).trim().slice(0, 130)]);
  } else {
    console.log(`🔴 ${label}: THE HARNESS IS GREEN UNDER THE MUTATION — a finding about the TEST, not a conclusion about the guard`);
    bad++;
  }
}
console.log("\n| direction | mutation | what the harness died on |");
console.log("|---|---|---|");
for (const [a, b, c] of rows) console.log(`| \`${a}\` | ${b} | ${c.replace(/\|/g, "\\|")} |`);
// The two must die on DIFFERENT lines, or only one half of the guard is actually tested.
const lines = rows.map(([, , where]) => (where.match(/harness:(\d+)/) ?? [])[1]);
if (rows.length === 2 && lines[0] && lines[0] === lines[1]) {
  console.log("\n🔴 BOTH mutations died on the SAME assertion — only one half of the guard is tested");
  bad++;
}
console.log(`\n${ok} mutation(s) killed, ${bad} problem(s)`);
process.exit(bad ? 1 : 0);
