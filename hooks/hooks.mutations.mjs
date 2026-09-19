/**
 * Mutation battery for the three shipped hooks and their tool.
 * Run: `node hooks/hooks.mutations.mjs` (not `vigiles test` — this is not a harness).
 *
 * 🔴 EVERY MUTATION CARRIES A "THE PATCH LANDED" ASSERTION: the file is re-read FROM DISK, the
 * mutant must be in it, and after the rollback the contents must return byte for byte. A green
 * mutation in this repository has repeatedly meant not "the defence holds" but "the patch never
 * landed" / "the test is looking somewhere else".
 *
 * WHAT A GREEN HARNESS UNDER A MUTATION MEANS: a finding about the TEST, not a conclusion about
 * the defence. Rank the causes in this order — the test greps PROSE ABOUT a value instead of the
 * value · the test looks in the wrong place · the test is the wrong test · the patch did not
 * land · the set is too narrow · the run was already red BEFORE the mutation. The last is closed
 * by the baseline run below.
 *
 * ⚠️ WHY THESE HOOKS ARE WORTH A BATTERY MORE THAN MOST. Two of the three are ADVISORY — silence
 * is their success state — and the third is a `PreToolUse` gate whose failure mode is to refuse
 * EVERYTHING. In both directions the broken state resembles the working one from outside: a
 * silent nudge looks like a clean edit, and a gate that refuses everything looks like a gate
 * doing its job until you notice `echo hi` is also blocked. The harness is the only instrument
 * that tells them apart, so the harness itself needs one.
 *
 * 🔴 ONE MUTATION IS DELIBERATELY ABSENT, and naming it is part of the record: replacing
 * `require.resolve("<this package>/hooks/paper-status-gates.sh")` with a hard-coded
 * `node_modules/<name>/hooks/…` path is NOT KILLABLE here, because the harness's fixture
 * consumer installs this package at exactly that path (a symlink, which is what `npm install`
 * of a local package produces). The mutant would be wrong for a consumer using an install alias
 * or a pnpm layout, and right for every fixture. Rather than assert it with a test that cannot
 * fail, it is left out and written down.
 *
 * 🔴 A SECOND ABSENCE, and this one CHANGED THE SOURCE. The nudge used to normalise the papers
 * root to one trailing slash, with a comment claiming `under()` needed it. The mutation that
 * removed the normalise left the harness GREEN — and the cause was none of the six ranked above:
 * the CLAIM was false. vigiles normalises a prefix itself (`normalizePrefix` →
 * `trimTrailingSeparators`), so the line defended nothing. It was deleted rather than given a
 * test, because a line no mutation can kill is a line documenting a defence that does not exist.
 * The guard keeps ITS normalise — that one hand-writes `startsWith(p + "/")` and is killable,
 * and the mutation for it is below.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const HARNESS = "hooks/hooks.harness.mjs";
const GUARD = "hooks/paper-edit-guard.hook.mjs";
const NUDGE = "hooks/paper-skills-nudge.hook.mjs";
const GATES = "hooks/paper-status-gates.hook.mjs";
const SH = "hooks/paper-status-gates.sh";

// Coverage mode — see `scripts/run-mutations.mjs` guard 2. Says what this battery can kill,
// without touching a file.
if (process.env.MUTATIONS_REPORT_COVERAGE) {
  console.log(`MUTATION-COVERS\t${HARNESS}`);
  process.exit(0);
}

/** [file, label, what it would break, from, to] */
const M = [
  // ── the carrier, in the GATE, where an unreadable root must REFUSE ──────────
  [
    GUARD,
    "guard carrier/null read as absence",
    "go back to `??` — an explicit `\"papers\": null` is read as «nothing was declared» and " +
      "silently falls back to the default, i.e. a typed keystroke treated as an absence",
    "  const root = declared === undefined ? DEFAULT_PAPERS_ROOT : declared;\n  if (typeof root !== \"string\" || root.length === 0)\n    return deny(",
    "  const root = declared ?? DEFAULT_PAPERS_ROOT;\n  if (typeof root !== \"string\" || root.length === 0)\n    return deny(",
  ],
  [
    GUARD,
    "guard carrier/empty root accepted",
    "accept any string including the empty one — every prefix test becomes vacuous and the gate " +
      "passes every paper write while still looking installed",
    '  if (typeof root !== "string" || root.length === 0)\n    return deny(',
    '  if (typeof root !== "string")\n    return deny(',
  ],
  [
    GUARD,
    "guard carrier/parse failure DEFAULTS instead of denying",
    "treat an unreadable package.json as «nothing declared» — the measured failure: the provider " +
      "hands back the EMPTY STRING in silence, so the gate quietly re-roots at the default",
    "  } catch {\n    return deny(\n      `${CONFIG_KEY}: this gate could not read",
    "  } catch {\n    pkg = {};\n    void deny(\n      `${CONFIG_KEY}: this gate could not read",
  ],
  [
    GUARD,
    "guard carrier/trailing slash not normalised",
    "keep the slash the consumer typed — `prefix + \"/\"` becomes `//`, which matches NOTHING, " +
      "and the gate is a silent no-op (this exact defect shipped once)",
    '  return root.replace(/\\/+$/, "");\n};',
    "  return root;\n};",
  ],
  // ── the guard's four measured bypasses ──────────────────────────────────────
  [
    GUARD,
    "guard/redirection targets invisible",
    "stop scanning redirections — `echo x > paper.md` is the canonical write and its target is " +
      "not an argv token, so `touches` cannot see it",
    "    const hits = writesViaArgv || redirectsInto(e.command.raw, PAPER_SOURCES);",
    "    const hits = writesViaArgv;",
  ],
  [
    GUARD,
    "guard/quoted path deleted instead of unquoted",
    "go back to DELETING quoted spans — a quoted path vanishes before it can be matched, and the " +
      "gate was one quote from open",
    '    .replace(/\'([^\']*)\'/g, "$1")\n    .replace(/"((?:[^"\\\\]|\\\\.)*)"/g, "$1");',
    '    .replace(/\'([^\']*)\'/g, "")\n    .replace(/"((?:[^"\\\\]|\\\\.)*)"/g, "");',
  ],
  [
    GUARD,
    "guard/the mutator list loses `sed -i`",
    "drop the commonest in-place editor from MUTATORS — the write is no longer recognised as a " +
      "write, so `sed -i` on a paper sails past the gate that exists for it",
    'const MUTATORS = ["sed -i", ',
    'const MUTATORS = [',
  ],
  [
    GUARD,
    "guard/the whole subtree guarded, not just sources",
    "drop the extension filter — copying a script into a paper's repro bundle is denied, which is " +
      "ordinary work being refused, and a guard that refuses ordinary work gets muted",
    // 🔴 The target moved on 09-16: `isPaperSource` was split into "not a snapshot" AND "has a
    // source extension" once `versions/` got its carve-out. This mutation targets exactly the
    // EXTENSION FILTER — removing the carve-out is a different property with its own mutation
    // below.
    "const hasSourceExtension = (p) =>\n  p.endsWith(\".tex\") || /\\/(paper|draft)\\.md$/.test(p) || /^(paper|draft)\\.md$/.test(p);",
    "const hasSourceExtension = (p) => p.length > 0;",
  ],
  [
    GUARD,
    "guard/manifest read goes relative again",
    "drop the anchor to the project root — the read fails once cwd drifts, and under the rule " +
      "\"an unreadable declaration denies\" the guard blocks ANY Bash command, including the one " +
      "that would fix it",
    "needs: [provide(\"pkg\", 'cat \"${CLAUDE_PROJECT_DIR:-.}/package.json\"')],",
    "needs: [provide(\"pkg\", \"cat package.json\")],",
  ],
  [
    "hooks/paper-skills-nudge.hook.mjs",
    "nudge/manifest read goes relative again",
    "the same defect in the SIBLING, and the failure there is the OPPOSITE one: a PostToolUse " +
      "hook does not deny, it returns `nothing()` — i.e. it just quietly stops firing. Silence " +
      "is exactly what a nudge's success state looks like, so a dead hook is indistinguishable " +
      "from a working one except by this mutation",
    "needs: [provide(\"pkg\", 'cat \"${CLAUDE_PROJECT_DIR:-.}/package.json\"')],",
    "needs: [provide(\"pkg\", \"cat package.json\")],",
  ],
  [
    GUARD,
    "guard/versions/ carve-out stops exempting",
    "remove the exemption for frozen snapshots — an archival record under `versions/` is denied " +
      "again, and there is nothing left to restore the paper's source from: the gate locks down " +
      "an immutable artifact while leaving the live `paper.tex` it exists to protect open",
    "const isPaperSource = (p) => !isFrozenSnapshot(p) && hasSourceExtension(p);",
    "const isPaperSource = (p) => hasSourceExtension(p);",
  ],
  [
    GUARD,
    "guard/versions/ carve-out becomes WIDER than it should",
    "declare anything a snapshot — the carve-out swallows the live `paper.tex`, and the guard " +
      "stops being a guard while still looking installed. Paired with the previous one: one " +
      "proves the exemption EXISTS, the other proves it does not overreach into what it " +
      "protects",
    "const isFrozenSnapshot = (p) => /(^|\\/)versions\\/[^/]+$/.test(p);",
    "const isFrozenSnapshot = () => true;",
  ],
  [
    GUARD,
    "guard/the read-vs-write conjunct dropped",
    "remove `runsMutator` — `cat <root>/x/paper.tex` touches a paper and names a paper source, so " +
      "a plain READ is denied (this happened, and it cost real work)",
    "      runsMutator(e.command) &&\n      (e.command.writesTo(PAPER_SOURCES)",
    "      (e.command.writesTo(PAPER_SOURCES)",
  ],
  // ── the nudge: it must LAND, and only for a paper ───────────────────────────
  [
    NUDGE,
    "nudge/fires on everything",
    "drop the path test — the checklist lands on every Edit anywhere, which is how an advisory " +
      "hook gets muted and then stays muted when it matters",
    "    return e.path.under([root]) && isPaperSource(e.path.raw) ? notice(CHECKLIST) : nothing();",
    "    return notice(CHECKLIST);",
  ],
  [
    NUDGE,
    "nudge/every file under the root is a paper",
    "drop the source-shape test — a README or a note under the papers root gets the pre-submit " +
      "checklist",
    "    return e.path.under([root]) && isPaperSource(e.path.raw) ? notice(CHECKLIST) : nothing();",
    "    return e.path.under([root]) ? notice(CHECKLIST) : nothing();",
  ],
  [
    NUDGE,
    "nudge carrier/null read as absence",
    "`??` again, in this hook's own copy of the carrier — the nudge starts firing about the " +
      "default tree the consumer never named",
    "  const root = declared === undefined ? DEFAULT_PAPERS_ROOT : declared;\n  if (typeof root !== \"string\" || root.length === 0) return null;",
    "  const root = declared ?? DEFAULT_PAPERS_ROOT;\n  if (typeof root !== \"string\" || root.length === 0) return null;",
  ],
  // ── the gates hook: anchors, escaping, and the name that reaches a shell ────
  [
    GATES,
    "gates/the root is not regex-escaped",
    "interpolate the declared root raw — a `.` in it becomes a wildcard, so the hook fires about " +
      "a sibling tree whose name merely resembles the declared one",
    "`(?:^|/)${root.replace(/[.*+?^${}()|[\\]\\\\]/g, \"\\\\$&\")}/([A-Za-z0-9._-]+)/",
    "`(?:^|/)${root}/([A-Za-z0-9._-]+)/",
  ],
  [
    GATES,
    "gates/the `(?:^|/)` boundary removed",
    "anchor with a bare `^` — the live harness sends ABSOLUTE paths, so the hook would be dead in " +
      "production and green in any test that builds relative ones",
    '    `(?:^|/)${root.replace(',
    '    `^${root.replace(',
  ],
  [
    GATES,
    "gates/the directory charclass widened",
    "accept any non-slash directory name — a name carrying `;` or a space reaches a `run()` " +
      "command string, and `run()` goes through a shell",
    "/([A-Za-z0-9._-]+)/(?:[^/]*",
    "/([^/]+)/(?:[^/]*",
  ],
  [
    GATES,
    "gates carrier/null read as absence",
    "`??` in the third copy of the carrier — the hook surfaces a status file from the default tree",
    "  const root = declared === undefined ? DEFAULT_PAPERS_ROOT : declared;\n  if (typeof root !== \"string\" || root.length === 0) return null;",
    "  const root = declared ?? DEFAULT_PAPERS_ROOT;\n  if (typeof root !== \"string\" || root.length === 0) return null;",
  ],
  // ── the tool ───────────────────────────────────────────────────────────────
  [
    SH,
    "sh/the papers root hard-coded again",
    "put the literal back — the tool serves exactly one consumer's layout, which is the thing the " +
      "extraction exists to undo",
    'papers_root="$(read_key papers papers)"',
    'papers_root="papers"',
  ],
  [
    SH,
    "sh/the defence-in-depth name check removed",
    "trust the hook's validation — the file stops being safe to call directly, and it is a " +
      "documented entry point",
    "  *[!A-Za-z0-9._-]* | \"\" | . | ..) exit 0 ;;",
    '  "") exit 0 ;;',
  ],
  [
    SH,
    "sh/answers to being called as a hook",
    "drop the usage branch — the file silently does nothing when misused instead of saying it is " +
      "a tool, which is how it was misregistered as a hook before",
    '  echo "paper-status-gates.sh: a tool, not a hook. Use --surface <paper-dir>." >&2',
    "  : >&2",
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
for (const [file, label, what, from, to] of M) {
  const pristine = readFileSync(file, "utf8");
  const hits = pristine.split(from).length - 1;
  if (hits !== 1) {
    console.log(
      `❌ ${label}: TARGET ${hits === 0 ? "NOT FOUND" : `NOT UNIQUE (${hits})`} in ${file} — ${from.slice(0, 70)}`,
    );
    bad++;
    continue;
  }
  writeFileSync(file, pristine.replace(from, to));
  const on = readFileSync(file, "utf8");
  if (!on.includes(to) || on.includes(from)) {
    console.log(`❌ ${label}: THE MUTATION DID NOT LAND (checked by re-reading ${file})`);
    bad++;
    writeFileSync(file, pristine);
    continue;
  }
  const { failed, out } = runHarness();
  writeFileSync(file, pristine);
  if (readFileSync(file, "utf8") !== pristine) {
    console.log(`❌ ${label}: THE ROLLBACK FAILED on ${file}`);
    bad++;
    continue;
  }
  // The verdict carries the assertion text: "killed" without saying by what is half an answer.
  const at = (out.match(/hooks\.harness\.mjs:(\d+)/) ?? [])[1];
  const msg =
    (out.match(/AssertionError[^:]*: ([^\n]+)/) ?? [])[1] ??
    (out.match(/((?:Error|ENOENT|SyntaxError)[^\n]*)/) ?? [])[1] ??
    "";
  const where = (at ? `harness:${at} · ` : "") + msg;
  if (failed) {
    ok++;
    rows.push([label, what, where.trim().slice(0, 130)]);
  } else {
    console.log(
      `🔴 ${label}: THE HARNESS IS GREEN UNDER THE MUTATION — a finding about the TEST, not a ` +
        `conclusion about the defence`,
    );
    bad++;
  }
}
console.log("\n| property | mutation | what the harness died on |");
console.log("|---|---|---|");
for (const [a, b, c] of rows) console.log(`| \`${a}\` | ${b} | ${c.replace(/\|/g, "\\|")} |`);
console.log(`\n${ok} mutation(s) killed, ${bad} problem(s)`);
process.exit(bad ? 1 : 0);
