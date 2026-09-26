/**
 * Colocated test for `eslint-rules/papers.mjs`.
 * Run: `npx vigiles test eslint-rules/papers.harness.mjs`
 *
 * FOUR PARTS:
 *   I.   THE DEFAULT AND THE DECLARATION — the two ways a root is chosen.
 *   II.  THE REFUSALS — every input this module must NOT quietly accept, each checked for the
 *        message a person will actually read, not only for the fact that something threw.
 *   III. PROPERTIES NOBODY SEES, WITHOUT WHICH THE GLOBS SILENTLY CHANGE MEANING:
 *        the returned root is RELATIVE, and `baseDir` — not `process.cwd()` — decides where it
 *        is looked for.
 *   IV.  THE ACCEPTANCE CRITERION OF THE WHOLE EXTRACTION: no consumer-specific path anywhere
 *        in this package. This is the assertion that makes the package reusable, and it is the
 *        one that will fail first when someone "just hard-codes it for now".
 *
 * 🔴 Assertions live at MODULE TOP LEVEL: `vigiles test` imports the file and treats "it did
 * not throw" as success; an exported `tests` object is run by nothing.
 */
import assert from "node:assert/strict";
import { PAPERS_DIR_FIELD } from "../lib/paper-config.mjs";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_PAPERS_ROOT, paperFiles, papersRoot } from "./papers.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const TMP = realpathSync(mkdtempSync(join(tmpdir(), "papers-root-")));
// Registered immediately, not at the end: assertions throw, and cleanup at the bottom of a
// file never runs in exactly the runs that are red.
process.on("exit", () => rmSync(TMP, { recursive: true, force: true }));

/** A throwaway repository with the given directories already on disk. */
const repoWith = (...dirs) => {
  const base = mkdtempSync(join(TMP, "repo-"));
  for (const d of dirs) mkdirSync(join(base, d), { recursive: true });
  return base;
};
/** The root `paperlint.json`, parsed, declaring `papers`. */
const declaring = (papers) => ({ [PAPERS_DIR_FIELD]: papers });

// ═════════════════════════════════════════════════════════════════════════════
// I. THE DEFAULT AND THE DECLARATION
// ═════════════════════════════════════════════════════════════════════════════
{
  const repo = repoWith(DEFAULT_PAPERS_ROOT);
  for (const [label, pkg] of [
    ["no paperlint.json at all", undefined],
    ["an empty paperlint.json", {}],
    ["a paperlint.json with only other keys", { kind: "short", rules: {} }],
  ])
    assert.equal(
      papersRoot(pkg, repo),
      DEFAULT_PAPERS_ROOT,
      `${label}: a consumer that declares nothing must get the default "${DEFAULT_PAPERS_ROOT}"`,
    );
}

// A declared root wins, including a nested one — the first consumer's is two levels deep, and
// a helper that only handled a single path segment would work on every fixture and fail there.
for (const declared of ["papers", "docs/papers", "writing/drafts", "a/b/c/d"]) {
  const repo = repoWith(declared);
  assert.equal(
    papersRoot(declaring(declared), repo),
    declared,
    `a declared root must be returned as declared: ${declared}`,
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// II. THE REFUSALS — and the message each one carries
// ═════════════════════════════════════════════════════════════════════════════
// 🔴 THE CENTRAL ONE. A root that is not on disk must STOP the config from loading, because
// the alternative is not "wrong findings" but NO findings — and a run with no findings is
// byte-identical to a run that checked everything and passed.
{
  const repo = repoWith("somewhere-else");
  assert.throws(
    () => papersRoot(declaring("writing/drafts"), repo),
    (e) =>
      /does not exist/.test(e.message) &&
      // names WHAT was declared, so the reader does not have to guess which of several
      // candidate paths the tool was looking at,
      e.message.includes('"writing/drafts"') &&
      // names WHERE it looked,
      e.message.includes(repo) &&
      // tells the reader it came from paperlint.json rather than from a default,
      /declared in paperlint\.json/.test(e.message) &&
      // and says WHY this is fatal instead of ignorable.
      /indistinguishable/.test(e.message),
    "a declared-but-missing root must throw, and the message must name the value, the place " +
      "it looked, its source, and why silence was not an option",
  );

  // The SAME failure reached by defaulting carries a DIFFERENT message, and that difference is
  // the whole usefulness of it: "you declared the wrong thing" and "you declared nothing and
  // the default does not fit you" have different fixes, and a shared message would hide which.
  assert.throws(
    () => papersRoot({}, repo),
    (e) =>
      /does not exist/.test(e.message) &&
      /Nothing was declared/.test(e.message) &&
      e.message.includes(`{ "${PAPERS_DIR_FIELD}": "path/to/papers" }`),
    "a missing root reached by DEFAULTING must say so and show the declaration to add",
  );
}

// Shapes that are present but unusable. Left unchecked, `""` is the worst of them: it makes
// every glob `"/*/paper.tex"` — rooted at the filesystem, matching nothing, silently.
for (const bad of ["", null, 0, false, [], {}, 42])
  assert.throws(
    () => papersRoot(declaring(bad), TMP),
    (e) => e instanceof TypeError && /non-empty string/.test(e.message),
    `a "papers" of ${JSON.stringify(bad)} must be refused as a type error, not coerced`,
  );

// ═════════════════════════════════════════════════════════════════════════════
// III. PROPERTIES NOBODY SEES
// ═════════════════════════════════════════════════════════════════════════════
// 🔴 THE RETURNED ROOT MUST STAY RELATIVE. ESLint resolves `files:` globs against the config's
// directory; an absolute path there is a different pattern with different behaviour, and the
// breakage would show up as "the rule stopped matching", i.e. as silence.
{
  const repo = repoWith("writing/drafts");
  const got = papersRoot(declaring("writing/drafts"), repo);
  assert.equal(
    isAbsolute(got),
    false,
    "the root must be returned relative, not resolved",
  );
  assert.equal(
    got.includes(repo),
    false,
    "the root must not carry the base directory",
  );
}

// 🔴 `baseDir` DECIDES, NOT `process.cwd()`. This is the assertion that pins the reason the
// parameter exists: cwd is wherever the editor, the CI step or the hook runtime happened to
// start, and in a git worktree it can be an entirely different checkout. A helper that quietly
// used cwd would pass every test run from the repository root and fail in exactly the setups
// nobody runs tests in.
{
  const real = repoWith("writing/drafts");
  const empty = repoWith("unrelated");
  assert.equal(papersRoot(declaring("writing/drafts"), real), "writing/drafts");
  assert.throws(
    () => papersRoot(declaring("writing/drafts"), empty),
    /does not exist/,
    "baseDir must be what is consulted — the same declaration must fail against a base that " +
      "does not contain the root",
  );
}

// Every glob set is derived from the root, and NONE of them is spelled out independently: a
// set that forgot to interpolate would keep matching the previous consumer's layout.
{
  const sets = paperFiles("R");
  const names = Object.keys(sets).sort();
  assert.deepEqual(
    names,
    ["all", "md", "pdfFacts", "refFacts", "status", "tex", "venue"],
    "the glob set changed — a consumer's config enumerates these by name, and a renamed or " +
      "dropped key is a block that silently lints nothing",
  );
  for (const [name, globs] of Object.entries(sets)) {
    assert.ok(
      Array.isArray(globs) && globs.length > 0,
      `${name}: must be a non-empty array`,
    );
    for (const g of globs)
      assert.ok(
        g.startsWith("R/"),
        `${name}: glob "${g}" does not start at the given root`,
      );
  }
  // Two roots must produce two disjoint sets — proof the root is interpolated everywhere and
  // not merely present in the first glob of each list.
  const other = paperFiles("Q");
  for (const name of names)
    assert.deepEqual(
      sets[name].map((g) => g.replace(/^R\//, "")),
      other[name].map((g) => g.replace(/^Q\//, "")),
      `${name}: the two roots did not produce the same shapes — something is hard-coded`,
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// IV. THE ACCEPTANCE CRITERION OF THE EXTRACTION
// ═════════════════════════════════════════════════════════════════════════════
// 🔴 NO CONSUMER-SPECIFIC PATH ANYWHERE IN THIS PACKAGE. This is the assertion the whole
// extraction exists for, and the reason it is here rather than in a plan document: a plan is
// read once, a test runs every time. The forbidden word is the first consumer's own directory
// name; it may appear ONLY in this file (as the value under test) and in prose that documents
// the decision.
{
  // ⚠️ THE ONLY LEGITIMATE OCCURRENCE OF THIS WORD IN THE PACKAGE, and it is here out of
  // necessity: it is the SUBJECT of the assert. The fixtures above deliberately use neutral
  // paths (`writing/drafts`) — until 2026-09-12 they carried the consumer's real directory name,
  // and the pre-publication audit found eleven occurrences where the meaning called for one.
  // ⚠️ THIS LIST HOLDS PATH TOKENS ONLY, AND THE PERSONAL NAMES ARE DELIBERATELY ABSENT.
  // Extending it to the owner's name was tried on 2026-09-12 and reverted the same hour by the
  // consumer-side audit that reads this repository before it is published: to GUARD against a
  // string a checker must SPELL it, so the extension put a private personal name into a public
  // source file and into a public commit message — a leak created by the leak detector. A
  // directory name is a layout fact and is safe to spell here; a person is not.
  //
  // The personal half therefore lives in the CONSUMER, where those strings already are, and runs
  // over `node_modules/<this package>` from there. That is rule T3 of the extraction plan, and
  // this is the measurement that made it non-negotiable rather than merely tidy.
  const FORBIDDEN = ["migratsiya"];
  const SELF = fileURLToPath(import.meta.url);
  const skipDirs = new Set(["node_modules", ".git", "fixtures"]);
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (skipDirs.has(entry)) continue;
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      if (p === SELF) continue;
      if (!/\.(mjs|js|ts|json|tex|sh)$/.test(entry)) continue;
      let text;
      try {
        text = readFileSync(p, "utf8");
      } catch {
        continue;
      }
      const hit = FORBIDDEN.find((w) => text.includes(w));
      if (hit) offenders.push(`${p.slice(ROOT.length + 1)} (${hit})`);
    }
  };
  walk(ROOT);
  assert.deepEqual(
    offenders,
    [],
    `this package names the first consumer's own directory ("${FORBIDDEN.join(", ")}") in: ` +
      `${offenders.join(", ")}. A package that hard-codes one consumer's layout has exactly ` +
      `one possible user, which is the thing the extraction exists to undo. The root belongs ` +
      `in the consumer's package.json — see eslint-rules/papers.mjs`,
  );
}
