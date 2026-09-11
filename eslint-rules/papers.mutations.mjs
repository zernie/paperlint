/**
 * Mutation battery for `eslint-rules/papers.mjs`.
 * Run: `node eslint-rules/papers.mutations.mjs` (not `vigiles test` — this is not a harness).
 *
 * 🔴 EVERY MUTATION CARRIES A "THE PATCH LANDED" ASSERTION: the file is re-read FROM DISK, the
 * mutant must be in it, and after the rollback the contents must return byte for byte. In this
 * project a green mutation has repeatedly meant not "the defence holds" but "the patch never
 * landed" / "the test is looking somewhere else".
 *
 * WHAT A GREEN HARNESS UNDER A MUTATION MEANS: a finding about the TEST, not a conclusion
 * about the defence. Rank the causes in this order — the test greps PROSE ABOUT a value
 * instead of the value · the test looks in the wrong place · the test is the wrong test · the
 * patch did not land · the set is too narrow · the run was already red BEFORE the mutation.
 * The last one is closed by the baseline run below.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const RULES = "eslint-rules/papers.mjs";
const HARNESS = "eslint-rules/papers.harness.mjs";
const PRISTINE = readFileSync(RULES, "utf8");

const M = [
  [
    "existsSync/the central refusal",
    "stop checking that the root is on disk — a wrong root stops being an error and becomes a " +
      "run that lints zero files and exits 0, which reads exactly like a clean pass",
    "  if (!existsSync(resolve(baseDir, root)))",
    "  if (false)",
  ],
  [
    "baseDir/ignored in favour of cwd",
    "resolve against `process.cwd()` instead of the given base — passes every run started from " +
      "the repository root and fails in a worktree or from an editor started elsewhere",
    "  if (!existsSync(resolve(baseDir, root)))",
    "  if (!existsSync(resolve(process.cwd(), root)))",
  ],
  [
    "default/absence",
    "drop the default — a consumer that declares nothing gets `undefined` instead of `papers`",
    "  const root = declared === undefined ? DEFAULT_PAPERS_ROOT : declared;",
    "  const root = declared;",
  ],
  [
    "declared === undefined/null read as absence",
    "go back to `??` — an explicit `\"papers\": null` is read as «nothing was declared» and " +
      "silently falls back to the default, i.e. a typed keystroke treated as an absence",
    "  const root = declared === undefined ? DEFAULT_PAPERS_ROOT : declared;",
    "  const root = declared ?? DEFAULT_PAPERS_ROOT;",
  ],
  [
    "type guard/empty string",
    "accept any string, including the empty one — every glob becomes `/*/paper.tex`, rooted at " +
      "the filesystem, matching nothing, silently",
    "  if (typeof root !== \"string\" || root.length === 0)",
    "  if (typeof root !== \"string\")",
  ],
  [
    "return shape/absolute path",
    "return the RESOLVED root — ESLint interprets `files:` globs relative to the config, so an " +
      "absolute path there is a different pattern, and the breakage shows up as silence",
    "  return root;\n}",
    "  return resolve(baseDir, root);\n}",
  ],
  [
    "message/which value was declared",
    "drop the declared value from the error — the reader is told something is missing but not " +
      "which of several candidate paths the tool was looking at",
    'the papers root "${root}" does not exist under ${baseDir}.',
    "the papers root does not exist.",
  ],
  [
    "message/default vs declared",
    "collapse the two failures into one message — «you declared the wrong thing» and «you " +
      "declared nothing and the default does not fit» have different fixes",
    "        (declared === undefined",
    "        (false",
  ],
  [
    "paperFiles/one glob set stops interpolating the root",
    "hard-code the `tex` set — the block keeps matching whatever layout the author had in mind",
    "    tex: [`${root}/*/paper.tex`],",
    "    tex: [`docs/papers/*/paper.tex`],",
  ],
  [
    "paperFiles/a set disappears",
    "drop `status` — a consumer's block named it, so that block now lints nothing at all",
    "    status: [`${root}/*/PIPELINE-STATUS.md`],",
    "",
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

// 🔴 A BASELINE RUN BEFORE ANY MUTATION. A red harness makes EVERY mutation look "killed", and
// the battery would print a confident green verdict about a defence that is not there.
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
    console.log(
      `❌ ${label}: TARGET ${hits === 0 ? "NOT FOUND" : `NOT UNIQUE (${hits})`} — ${from.slice(0, 70)}`,
    );
    bad++;
    continue;
  }
  writeFileSync(RULES, PRISTINE.replace(from, to));
  const on = readFileSync(RULES, "utf8");
  if (!on.includes(to) || on.includes(from)) {
    console.log(`❌ ${label}: THE MUTATION DID NOT LAND (checked by re-reading the file)`);
    bad++;
    writeFileSync(RULES, PRISTINE);
    continue;
  }
  const { failed, out } = runHarness();
  writeFileSync(RULES, PRISTINE);
  if (readFileSync(RULES, "utf8") !== PRISTINE) {
    console.log(`❌ ${label}: THE ROLLBACK FAILED`);
    bad++;
    continue;
  }
  // The verdict carries the HARNESS LINE and the assertion text: "killed" without saying by
  // what is half an answer. The battery must show that each mutation died on ITS OWN assertion.
  const at = (out.match(/papers\.harness\.mjs:(\d+)/) ?? [])[1];
  const msg =
    (out.match(/AssertionError[^:]*: ([^\n]+)/) ?? [])[1] ??
    // Not every mutation dies on an assertion: removing the `try/catch` crashes the linter
    // itself, and then "what it died on" is a thrown error. Without this branch the column
    // would come out EMPTY — "killed by something unknown", which is the half-answer this
    // battery forbids.
    (out.match(/((?:Error|ENOENT)[^\n]*)/) ?? [])[1] ??
    (out.match(/([^\n]*(?:must|the wrong|drifted|was lost|did not fire)[^\n]*)/) ?? [])[1] ??
    "";
  const where = (at ? `harness:${at} · ` : "") + msg;
  if (failed) {
    ok++;
    rows.push([label, what, where.trim().slice(0, 130)]);
  } else {
    console.log(`🔴 ${label}: THE HARNESS IS GREEN UNDER THE MUTATION — a finding about the TEST, not a conclusion about the defence`);
    bad++;
  }
}
console.log("\n| property | mutation | what the harness died on |");
console.log("|---|---|---|");
for (const [a, b, c] of rows) console.log(`| \`${a}\` | ${b} | ${c.replace(/\|/g, "\\|")} |`);
console.log(`\n${ok} mutation(s) killed, ${bad} problem(s)`);
process.exit(bad ? 1 : 0);
