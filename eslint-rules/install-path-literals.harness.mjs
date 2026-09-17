/**
 * `port/md-install-path` and `port/js-install-path` — both halves on real ESLint, plus the
 * ratchet over the live corpus.
 *
 * The ratchet is the load-bearing case and the reason the rule ships at `warn`. There are 76
 * findings on a healthy checkout today: real violations, not deliberate fixtures, and they
 * cannot be removed in the commit that introduces the rule. At `error` the repository would
 * be red on a clean clone, and a rule that is red on a clean clone gets switched off — after
 * which the binary rules beside it stop being read too. So the severity says "known debt"
 * and `npm test` holds the line: the number may go DOWN and never up.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import markdown from "@eslint/markdown";
import { recordCheck } from "vigiles";
import port from "./install-path-literals.mjs";

// Resolved from THIS file, never from the caller's cwd — rule 6, and the mistake this very
// class of bug is about.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const FIX = join(ROOT, "fixtures", "install-path-literals");

const RULE_MD = "port/md-install-path";
const RULE_JS = "port/js-install-path";

const mdLinter = new ESLint({
  cwd: ROOT,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ["**/*.md"],
      plugins: { markdown, port },
      language: "markdown/gfm",
      languageOptions: { frontmatter: "yaml" },
      rules: { [RULE_MD]: "error" },
    },
  ],
});

const jsLinter = new ESLint({
  cwd: ROOT,
  overrideConfigFile: true,
  overrideConfig: [{ files: ["**/*.mjs"], plugins: { port }, rules: { [RULE_JS]: "error" } }],
});

const findings = async (linter, target, ruleId) => {
  const res = await linter.lintFiles([target]);
  return res.flatMap((r) => r.messages).filter((m) => m.ruleId === ruleId);
};

const cases = [];

// ── 1. MARKDOWN FIRES. Three carriers in one fixture: the frontmatter value, the fenced
//      command, and an inline mention. All three are how a real skill names a script.
{
  const m = await findings(mdLinter, join(FIX, "defect.md"), RULE_MD);
  assert.ok(m.length >= 3, `expected at least three findings, got ${m.length}`);
  assert.match(m[0].message, /INSTALLED/, "the message must name what is wrong");
  assert.match(m[0].message, /consumer\.mjs/, "and where the answer belongs");
  const prefixes = new Set(m.map((x) => x.message.match(/'([^']+)'/)?.[1]));
  assert.ok(prefixes.has(".claude/skills/"), "the symlink channel must be named");
  assert.ok(prefixes.has("node_modules/"), "the npm channel must be named");
  cases.push("md fires on frontmatter, fenced command and inline mention");
}

// ── 2. MARKDOWN STAYS QUIET. Same skill written through the substitution, plus a
//      repository-relative path that is identical in every channel.
{
  const m = await findings(mdLinter, join(FIX, "clean.md"), RULE_MD);
  assert.equal(m.length, 0, `clean fixture must be silent, got ${JSON.stringify(m)}`);
  cases.push("md quiet on a skill that uses the substitution");
}

// ── 3. JAVASCRIPT FIRES, in both literal forms. The template case is not decoration: a path
//      assembled from a template is still a path, and reading only `Literal` would miss it.
{
  const m = await findings(jsLinter, join(FIX, "defect.fixture.mjs"), RULE_JS);
  assert.equal(m.length, 2, `expected one plain and one template finding, got ${m.length}`);
  cases.push("js fires on a plain literal AND on a template quasi");
}

// ── 4. JAVASCRIPT STAYS QUIET when the module asks the port.
{
  const m = await findings(jsLinter, join(FIX, "clean.fixture.mjs"), RULE_JS);
  assert.equal(m.length, 0, `clean module must be silent, got ${JSON.stringify(m)}`);
  cases.push("js quiet on a module that asks the port");
}

// ── 5. THE RATCHET. Measured 2026-09-17 on the live corpus.
const BASELINE = 76;
{
  const m = await findings(mdLinter, join(ROOT, "skills"), RULE_MD);
  // EXACT, not `<=`, and the battery is why. A one-directional ratchet passes when the
  // baseline is RAISED, so the number it guards can be loosened without a single test going
  // red — which the mutation `BASELINE = 760` demonstrated on the first run of this file.
  // Equality makes both directions cost a deliberate edit: the debt cannot grow, and paying
  // it down cannot be left half-recorded.
  assert.equal(
    m.length,
    BASELINE,
    m.length > BASELINE
      ? `the skills corpus now has ${m.length} install-specific paths, up from the frozen ` +
        `${BASELINE}: a new one is a new bet on a delivery channel. Fix the path.`
      : `the skills corpus is down to ${m.length} install-specific paths from ${BASELINE} — ` +
        `good. Lower BASELINE to ${m.length} in this file, in the same commit that paid it.`,
  );
  cases.push(`ratchet: ${m.length} install-specific paths in skills, frozen at ${BASELINE}`);
}

// ── 6. THE SHIPPED MODULES HAVE THEIR OWN, SMALLER DEBT — ratcheted separately, because it
//      is a different fix. Measured 2026-09-17: two sites, both TRUE positives and neither
//      reachable by the markdown answer. `lib/skill-checks.mjs` and `lib/trigger-ledger.mjs`
//      print a command for a human to run, and a printed command cannot be fixed by a
//      substitution the skill harness performs — it has to be resolved through the port at
//      runtime. Written down here rather than waved at: the first draft of this harness
//      asserted `lib/` was clean, and the rule proved that wrong on its first run.
const BASELINE_LIB = 2;
{
  const m = await findings(jsLinter, join(ROOT, "lib"), RULE_JS);
  assert.equal(
    m.length,
    BASELINE_LIB,
    `lib/ has ${m.length} install-specific literals against a frozen ${BASELINE_LIB}: ` +
      JSON.stringify(m.map((x) => `${x.line}:${x.column}`)) +
      ` — up means a new bet on a channel, down means lower BASELINE_LIB in this commit.`,
  );
  cases.push(`ratchet: ${m.length} install-specific literals in lib/, frozen at ${BASELINE_LIB}`);
}

for (const c of cases) recordCheck(c);
