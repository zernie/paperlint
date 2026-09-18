/**
 * THE GUARD AGAINST A GREEN ZERO.
 *
 * 🔴 The defect it exists for, measured 2026-09-10 on the source corpus: a lint rule whose glob
 * matches NO file is never invoked. The run exits 0 with no findings — byte-identical to the
 * run of a rule that examined everything and passed. In that corpus a fresh clone produced
 * RC=0 and 652 findings, and NINETEEN rules had seen no file at all. Nothing in the output said
 * so, because there is nothing for a rule to say when it is not called.
 *
 * ── WHY THIS CANNOT LIVE INSIDE A RULE ──────────────────────────────────────
 * A rule cannot report that it was not invoked; not being invoked is precisely the state in
 * which it has no opportunity to report anything. The check therefore has to stand OUTSIDE the
 * rules, look at the config and at the files on disk, and answer a question no individual rule
 * can ask: "was anything actually handed to you?"
 *
 * ── WHAT IT CHECKS, AND WHY THAT AND NOT "THE GLOB IS NON-EMPTY" ────────────
 * Per RULE, not per glob. The unit that goes silent is a rule, and a rule can be enabled in one
 * block whose glob is empty while a completely different block is busy — a non-empty glob
 * somewhere in the config is not evidence about the rule you care about. So: collect every rule
 * declared at a severity other than `off`, lint the repository, and for each linted file ask
 * ESLint what the effective config is. A rule enabled for zero linted files is BLIND.
 *
 * Run: `node scripts/rules-see-files.mjs`  (exit 1 and a named rule when something is blind)
 * Tested by: `scripts/rules-see-files.harness.mjs` — both halves, quiet here and firing on a
 * planted empty glob.
 */
import { ESLint } from "eslint";
import { isMain } from "../skills/paper-pipeline/scripts/consumer.mjs";

/** ESLint accepts severities as strings and as numbers; `off` and `0` are the same thing. */
const isOff = (v) => {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "off" || s === 0;
};

/**
 * @param {{cwd: string}} options
 * @returns {Promise<{rules: {rule: string, files: number}[], linted: number, blind: string[]}>}
 */
export async function rulesSeeFiles({ cwd }) {
  const configPath = new URL("eslint.config.mjs", `file://${cwd.endsWith("/") ? cwd : cwd + "/"}`);
  const config = (await import(configPath.href)).default;

  const declared = new Set();
  for (const block of config)
    for (const [id, severity] of Object.entries(block.rules ?? {}))
      if (!isOff(severity)) declared.add(id);

  const eslint = new ESLint({ cwd });
  // `errorOnUnmatchedPattern: false` is NOT set on purpose. A repository where `.` matches
  // nothing at all is a different failure, and it should be loud in its own words rather than
  // arrive here disguised as "every rule is blind".
  const results = await eslint.lintFiles(["."]);

  const seen = new Map([...declared].map((id) => [id, 0]));
  for (const result of results) {
    const effective = await eslint.calculateConfigForFile(result.filePath);
    for (const id of declared)
      if (effective.rules?.[id] && !isOff(effective.rules[id])) seen.set(id, seen.get(id) + 1);
  }

  const rules = [...seen].map(([rule, files]) => ({ rule, files })).sort((a, b) => a.rule.localeCompare(b.rule));
  return { rules, linted: results.length, blind: rules.filter((r) => r.files === 0).map((r) => r.rule) };
}

// CLI entry. Guarded so the harness can import the function without running the process exit.
// 🔴 `isMain`, NOT `import.meta.url === `file://${process.argv[1]}``. Node resolves the entry
// point to its REAL path for `import.meta.url` but leaves `process.argv[1]` as typed, so through
// a symlink the two are not equal and the CLI silently does not run — the process exits 0 having
// done nothing. The consumer reaches these scripts through exactly such a symlink. Observed 14.09
// on run 34784079821: `extract-pdf-facts.mjs --strict` returned RC=0 and created no facts file.
if (isMain(import.meta.url)) {
  const { rules, linted, blind } = await rulesSeeFiles({ cwd: process.cwd() });
  for (const { rule, files } of rules) console.log(`${String(files).padStart(4)}  ${rule}`);
  console.log(`\n${rules.length} rule(s) declared, ${linted} file(s) linted.`);
  if (blind.length) {
    console.log(
      `\n✗ ${blind.length} rule(s) saw NO file and were never invoked:\n` +
        blind.map((r) => `    ${r}`).join("\n") +
        "\n\n  A rule that is never invoked reports exactly what a rule that passed reports.\n" +
        "  Fix the glob it is declared on, or delete the declaration — do not leave it green.",
    );
    process.exit(1);
  }
  console.log("✓ every declared rule was enabled for at least one file on disk.");
}
