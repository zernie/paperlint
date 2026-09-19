/**
 * `port/md-install-path` and `port/js-install-path` — both halves on real ESLint.
 *
 * 🔴 NO RATCHET HERE, AND THAT IS THE POINT (Erni, 2026-09-17). The first draft of this file
 * froze the corpus at 76 findings and `lib/` at 2, so the debt could not grow. That reads like
 * caution and is not: a ratchet does not say "correct", it says "at least not worse", and this
 * repository's own rule calls it debt rather than a fix. Freezing a number the same day the
 * rule is written turns "we will remove these paths" into "we have decided to keep them".
 *
 * So the rule reports and nothing freezes. The debt is an issue with an owner, not a constant
 * in a test; the count lives in `docs/incidents.md` as a measurement with a date, where it can
 * go stale honestly instead of looking maintained.
 */import assert from "node:assert/strict";
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

for (const c of cases) recordCheck(c);
