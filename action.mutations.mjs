/**
 * Mutation battery over `action.yml` and `scripts/eslint-report-guard.mjs`.
 * Run: `node action.mutations.mjs` (not `vigiles test` — this is not a harness).
 *
 * 🔴 EVERY MUTATION CARRIES A "THE PATCH LANDED" ASSERTION: the target must occur EXACTLY ONCE,
 * the mutant must be present in the file re-read from disk, the original text must be GONE, and
 * after the rollback the contents must return byte for byte. In this corpus a green mutation has
 * three times meant not "the defence holds" but "the patch never applied".
 *
 * A GREEN HARNESS UNDER A MUTATION is a finding about the TEST, not a conclusion about the defence.
 * Rank the causes: the wrong test · the patch did not land · the set is too narrow · THE RUN WAS
 * ALREADY RED BEFORE THE MUTATION. The last is why the baseline runs FIRST and its failure stops
 * the battery.
 *
 * ⚠️ Mutation 1 is the load-bearing one and it is deliberately asymmetric: it sends the step back
 * to calling `npx eslint` directly while LEAVING the words `paperlint lint` in the comments above. A
 * harness that grepped the file would stay green; this one parses the YAML and addresses the step
 * as a node, so it dies. That is the whole argument for the parser, made executable.
 *
 * It replaced a mutation over `--no-config-lookup`, which stopped having a target on 2026-09-18:
 * the flag went away with the eslint call, and the guarantee it carried moved INTO the CLI
 * (`overrideConfigFile: true`). The bypass it protected against is the same one — a consumer's
 * nested config deciding the rule set — so the case moved rather than disappeared.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const HARNESS = "action.harness.mjs";

if (process.env.MUTATIONS_REPORT_COVERAGE) {
  console.log(`MUTATION-COVERS\t${HARNESS}`);
  process.exit(0);
}

const ACTION = "action.yml";
const GUARD = "scripts/eslint-report-guard.mjs";
const PRISTINE = new Map(
  [ACTION, GUARD].map((f) => [f, readFileSync(f, "utf8")]),
);
const restoreAll = () => {
  for (const [f, body] of PRISTINE) writeFileSync(f, body);
};

const M = [
  [
    ACTION,
    "the step goes back around the CLI to eslint (the words `paperlint lint` left in the comments)",
    "reinstate the bypass: rpp.json unread, the directory-structure check absent in CI, and a " +
      "consumer's nested config free to decide the rule set — while a grep still finds `paperlint lint`",
    "npx paperlint lint $RPP_PATHS",
    'npx eslint --config "$RPP_CONFIG" $RPP_PATHS',
  ],
  [
    ACTION,
    "the guard is no longer called",
    "keep the lint run and drop the green-zero check — the job passes loudest when it measured nothing",
    'node "$GITHUB_ACTION_PATH/scripts/eslint-report-guard.mjs" \\',
    "true # MUT \\",
  ],
  [
    ACTION,
    "texcount probed by the installer's exit code instead of by the binary",
    "trust an installer that can put nothing in place and report success",
    "command -v texcount >/dev/null || {",
    "true || {",
  ],
  [
    GUARD,
    "a report of ZERO linted files treated as clean",
    "reinstate the exact indistinguishability the guard exists to break",
    "  if (res.length === 0) {",
    "  if (false) { /* MUT */",
  ],
  [
    GUARD,
    "ESLint's return code masked",
    "swallow a real ESLint failure and report success",
    "  return { code: eslintRc, lines };",
    "  return { code: 0, lines }; /* MUT */",
  ],
  [
    GUARD,
    "an unparsable report treated as clean",
    "let a missing or corrupt report pass — nothing was measured either way",
    "    lines.push(\n      `::error::ESLint wrote no parsable report to ${reportPath} (rc=${eslintRc}). Nothing was measured.`,\n    );\n    return { code: 1, lines };",
    "    return { code: 0, lines }; /* MUT */",
  ],
];

const run = () => {
  try {
    return {
      ok: true,
      out: execFileSync("npx", ["vigiles", "test", HARNESS], {
        encoding: "utf8",
        stdio: "pipe",
      }),
    };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
};

const base = run();
if (!base.ok) {
  console.log(
    "❌ THE HARNESS IS RED BEFORE ANY MUTATION — the battery cannot tell a killed mutation from that:\n" +
      base.out.slice(-1200),
  );
  process.exit(1);
}

let ok = 0;
let bad = 0;
const rows = [];

for (const [file, label, what, from, to] of M) {
  const pristine = PRISTINE.get(file);
  const hits = pristine.split(from).length - 1;
  if (hits !== 1) {
    console.log(
      `❌ ${label}: TARGET ${hits === 0 ? "NOT FOUND" : `NOT UNIQUE (${hits})`} in ${file}`,
    );
    bad++;
    continue;
  }
  writeFileSync(file, pristine.replace(from, to));
  const on = readFileSync(file, "utf8");
  if (!on.includes(to) || on.includes(from)) {
    console.log(
      `❌ ${label}: THE MUTATION DID NOT LAND (checked by re-reading ${file})`,
    );
    bad++;
    restoreAll();
    continue;
  }
  const res = run();
  restoreAll();
  if (readFileSync(file, "utf8") !== pristine) {
    console.log(`❌ ${label}: THE ROLLBACK FAILED on ${file}`);
    bad++;
    continue;
  }
  if (!res.ok) {
    ok++;
    const why =
      (res.out.match(/AssertionError[^\n]*?: ([^\n]*)/) ?? [])[1] ??
      "(the harness died)";
    rows.push([label, what, why.trim().slice(0, 100)]);
  } else {
    console.log(
      `🔴 ${label}: THE HARNESS IS GREEN UNDER THE MUTATION — a finding about the TEST, not a conclusion about the defence`,
    );
    bad++;
  }
}

console.log("\n| property | mutation | what the harness died on |");
console.log("|---|---|---|");
for (const r of rows) console.log(`| ${r[0]} | ${r[1]} | ${r[2]} |`);
console.log(`\n${ok} mutation(s) killed, ${bad} problem(s)`);
process.exit(bad === 0 ? 0 : 1);
