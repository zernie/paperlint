/**
 * round-diff.mjs beyond its harness: the manifest reader's edge lines, `*` coverage, the census of
 * an empty text, and — in real git repositories — manifests without a round number, a first base
 * that does not resolve, a removed section that is declared, more than eight new numbers, and the
 * command with no git on PATH, no paper.md, and no directory argument.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { runNode, useTempDir, writeTree } from "../../../test/support.mjs";
import { census, check, covers, parseManifest } from "./round-diff.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "round-diff.mjs");
const root = useTempDir("round-diff-");
let n = 0;

/** A git repo whose HEAD holds `base` as paper.md; the working tree then holds `now`. */
function repo(base, now = base, rounds = {}) {
  const dir = join(root, `r${String(n++)}`, "paper");
  writeTree(dir, { "paper.md": base });
  const g = (...a) => spawnSync("git", a, { cwd: dir, encoding: "utf8" });
  g("init", "-q");
  g(
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "commit",
    "-qm",
    "base",
    "--allow-empty",
  );
  g("add", "paper.md");
  g("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "paper");
  const head = g("rev-parse", "HEAD").stdout.trim();
  writeTree(dir, {
    "paper.md": now,
    ...Object.fromEntries(
      Object.entries(rounds).map(([f, body]) => [
        `rounds/${f}`,
        body.replaceAll("HEAD_SHA", head),
      ]),
    ),
  });
  return dir;
}
const kinds = (r) => r.findings.map((f) => f.kind);

test("manifest: no frontmatter, comments and blanks, a list item before any key, lists both ways", () => {
  assert.deepEqual(parseManifest("no frontmatter", "m.md"), {
    error: "no frontmatter block",
    path: "m.md",
  });
  assert.deepEqual(
    parseManifest(
      [
        "---",
        "- stray item",
        "# a comment",
        "",
        "base: abc # the base",
        "touches:",
        "  - 1",
        "  - Intro",
        "allows: [new-number, 'new-citation']",
        "not a key line",
        "notes:",
        "---",
        "",
      ].join("\n"),
      "m.md",
    ),
    {
      path: "m.md",
      touches: ["1", "Intro"],
      allows: ["new-number", "new-citation"],
      base: "abc",
      notes: [],
    },
  );
});

test("`*` covers every heading; an empty text has no hedge density", () => {
  assert.equal(covers("*", "7. Anything"), true);
  assert.equal(census("").hedgeDensity, 0);
});

const P = (...secs) => secs.map(([h, t]) => `## ${h}\n\n${t}\n`).join("\n");
// Untouched sections, so a round that touches one or two is not an over-broad scope.
const REST = ["3. Three", "4. Four", "5. Five", "6. Six"].map((h) => [
  h,
  "Same.",
]);
const round = (r, base, touches, extra = "") =>
  `---\n${r === null ? "" : `round: ${r}\n`}base: ${base}\ntouches: [${touches}]\nbudget: 1000\n${extra}---\n`;

test("a manifest without a round number is named by its file, not as `round undefined`; its unresolvable base is named", () => {
  const text = P(["1. Intro", "Words here."], ...REST);
  const dir = repo(text, text, {
    "a.md": round(null, "deadbeef", "1", "closed: true\n"),
    "b.md": round(null, "HEAD_SHA", "1"),
  });
  const r = check(dir);
  assert.deepEqual(kinds(r), ["unresolvable-base"]);
  assert.match(
    r.findings[0].msg,
    /^paper\/rounds\/a\.md's base `deadbeef` does not resolve/,
  );
});

test("a removed section the round declares is not a finding; more than eight new numbers are elided", () => {
  const base = P(["1. Intro", "Words."], ["2. Gone", "Old words."], ...REST);
  const now = P(["1. Intro", "Words 1 2 3 4 5 6 7 8 9 10."], ...REST);
  const dir = repo(base, now, { "a.md": round(1, "HEAD_SHA", "1, 2") });
  const r = check(dir);
  assert.deepEqual(kinds(r), ["unauthorised-number"]);
  assert.match(
    r.findings[0].msg,
    /^10 numeric literal\(s\) new to the body this round \(1, 2, 3, 4, 5, 6, 7, 8, …\)/,
  );
});

test("the command: no paper.md is a note; no git on PATH is 'not a git repository'; no argument is the cwd", () => {
  const empty = writeTree(join(root, "empty"), { "x.txt": "" });
  const none = runNode(SCRIPT, [], { cwd: empty });
  assert.equal(none.status, 0);
  assert.match(none.stdout, new RegExp(`^ {3}no paper\\.md in ${empty}$`, "m"));
  const dir = writeTree(join(root, "nogit"), { "paper.md": P(["1. A", "x"]) });
  const r = runNode(SCRIPT, [dir, "--json", "--since=HEAD"], {
    env: { PATH: dirname(process.execPath) },
  });
  assert.deepEqual(JSON.parse(r.stdout), [
    {
      kind: "unresolvable-base",
      msg: "cannot read paper.md at `HEAD`: not a git repository. A round whose base does not resolve is a round with no gate, and it must not read as a clean run.",
    },
  ]);
});
