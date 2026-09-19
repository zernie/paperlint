/**
 * skill-corpus.mjs — WHAT the pipeline's skills ARE. Derivation and helpers, no assertions.
 *
 * 🔴 THIS FILE MAKES NO CLAIMS AND RUNS NO TESTS. Importing it must be free of verdicts —
 * that is the whole reason it was split out of `skills.harness.mjs` on 2026-08-11. That file
 * held three things under one name: this derivation, the per-skill assertions, and the
 * corpus-wide ones. It answered to no surface (there is no skill called `skills`), so the
 * 21 colocated per-skill harnesses could only reach it by setting an env var and importing
 * a script for its SIDE EFFECTS — 21 wrappers around one bag.
 *
 * Now: this module derives, `skill-checks.mjs` asserts about ONE skill, and
 * `pipeline-corpus.harness.mjs` asserts about the SET. Each colocated file calls a
 * function with its own name in it, and there is no env-var side channel.
 *
 * The ledger is redirected to a scratch path at import time, BEFORE `ledger.mjs` loads, so
 * that an assertion which calls `record()` cannot leave fixture rows in real history. That
 * import order is load-bearing and is the reason this is a module rather than a plain
 * export list. Save-and-restore is not isolation — it lost that race on its first day.
 */
import assert from "node:assert/strict";
// ⚠️ 2026-08-28: `rmSync` and `writeFileSync` were removed from here — nothing called them.
// `rmSync` is NOT a harmless finding here, though: `tmp` below is a `mkdtempSync` that is never
// removed, so every import of this library leaves a directory behind in `/tmp` (two dozen per
// full sweep of the harnesses). Cleanup is DELIBERATELY not added in this edit: it would change
// the lifecycle of the directory that holds `PIPELINE_LEDGER` for every child run, and today's
// edit is about turning the lint on, not about harness behavior. Written down as an open item
// in the report, not swept under an import-that-does-something-silently.
import { existsSync, readFileSync, readdirSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";
import { consumerRoot } from "../skills/paper-pipeline/scripts/consumer.mjs";
import { headings as mdHeadings, requireMarkdown, frontmatterBlock } from "./markdown.mjs";

// Markup is parsed with a real parser (`CLAUDE.md`, 2026-08-11). Here we THROW rather than
// degrade: this module answers the question "what does the skill corpus contain", and an empty
// heading list with no parser would read as "not one skill has a `Record the verdict` block" —
// i.e. as a finding about the corpus. A confident zero has already been mistaken for a fact in
// this repo four times.
requireMarkdown();

export const HERE = dirname(fileURLToPath(import.meta.url));
// 🔴 THE CONSUMER'S ROOT, ASKED FOR — NOT WALKED TO. While this module lived in the consumer's
// own `.claude/lib/`, `resolve(HERE, "..", "..")` WAS the repository root. From inside
// `node_modules/<pkg>/lib/` the same walk lands on the consumer's `node_modules/`, and every path
// below it — the skills directory above all — would be a directory that does not exist. That
// failure is silent in the worst way: `readdirSync` throws while this module is still LOADING, and
// a harness whose module fails to load is reported by `vigiles test` as SKIPPED with exit code 0.
// `consumerRoot()` is the carrier the package already uses for the ledger and the papers root.
export const ROOT = consumerRoot();
export const SKILLS_DIR = join(ROOT, ".claude", "skills");

// Redirected BEFORE ledger.mjs is imported, so a crash cannot leave fixture rows in real history.
// Save-and-restore is not isolation — it lost that race on its first day (see ledger.mjs's comment).
export const tmp = realpathSync(mkdtempSync(join(tmpdir(), "skills-harness-")));
process.env.PIPELINE_LEDGER = join(tmp, "runs.jsonl");
const { KINDS, RETIRED, ABSTENTIONS, record, parseGate } = await import("../skills/paper-pipeline/scripts/ledger.mjs");
export { KINDS, RETIRED, ABSTENTIONS, record, parseGate };
const { EXPECTED_GATES } = await import("../skills/paper-pipeline/scripts/status.mjs");
export { EXPECTED_GATES };
/** The skills EXPECTED_GATES names, with the `skill/check` rows collapsed onto their skill. */
export const GATE_SKILLS = new Set(EXPECTED_GATES.map((g) => parseGate(g).skill));


// The paper-pipeline skills, DERIVED FROM DISK — a skill is one iff its SKILL.md instructs
// `node .claude/skills/paper-pipeline/scripts/announce.mjs <its own name>`. Minus EXCLUDED below.
//
// 🔴 THIS WAS A PINNED ARRAY UNTIL 2026-08-07, AND THE PIN MADE ASSERTION 12b VACUOUS IN THE ONE
// CASE IT EXISTS FOR. That assertion reads "<skill> is a wired pipeline skill but is absent from
// status.mjs EXPECTED_GATES" — and it iterated the pinned array. So it could only ever catch a skill
// present in the array and missing from EXPECTED_GATES. A skill wired on disk and absent from BOTH
// lists — the actual "I added a skill and forgot" failure — was structurally invisible.
//
// Measured, not theorised: `paper-status` is in exactly that state right now. It carries an announce
// command and is in neither list. That is DELIBERATE (see EXCLUDED), but nothing checked that the
// deliberateness was still true, and the old comment asserting it was the only thing holding it.
//
// The mutation driver's case 12b passed the whole time, because it removes a skill from EXPECTED_GATES
// while leaving it in the pinned array. A green mutation proving a narrower property than its own
// error message claims is exactly the vacuity this file was built to hunt, sitting in this file.
//
// The old comment's objection to globbing was real and is answered rather than ignored: `.claude/skills/`
// does hold daily skills (search-krisha, food-log-entry, …) with no pipeline contract, so the filter
// cannot be "every directory". But it need not be a guess either — carrying an announce command that
// names YOURSELF is the pipeline contract, checked below by assertion 5c, and it is a fact on disk.
export const PIPELINE_MARKER = /^\s*node\s+\.claude\/skills\/paper-pipeline\/scripts\/announce\.mjs\s+([a-z0-9-]+)/m;

/**
 * Skills wired into the pipeline but deliberately NOT graded as gates, each with the reason.
 * A reason is required because these are the entries that rot: an exclusion with no argument is
 * indistinguishable from an omission, and the previous version of this file held both in prose.
 *
 * 🔴 UNTIL 2026-08-11 THIS SUBTRACTED FROM THE CHECKED SET, WHICH IS NOT WHAT ITS OWN REASON SAYS.
 * The recorded reason for `paper-status` is "it has no gate row" — a statement about ONE assertion
 * (12b: every checked skill must appear in EXPECTED_GATES). The implementation filtered it out of
 * `SKILLS` entirely, so it received NONE of the structural checks either: not the strict-YAML
 * frontmatter parse, not the tool contract, not "your wiring points at scripts that exist", not
 * "you announce under your OWN identity". A skill was silently unexamined because it lacked a
 * grade — and this file's own governing comment, four lines below, says a defect that shrinks the
 * checked set is worse than the defect itself.
 *
 * Found by the coverage sweep of 2026-08-11: `paper-status` showed as untested, and the reason was
 * not a missing test file but this line. Now the exclusion means what it says — skipped at 12b,
 * checked everywhere else.
 */
export const EXCLUDED = new Map([
  ["paper-status", "reports on the pipeline; produces no verdict ABOUT the paper, so it has no gate row"],
]);

// 🔴 MEMBERSHIP IS THE UNION OF TWO SOURCES, AND THAT IS THE WHOLE POINT. A skill is checked if the
// gate table names it OR its SKILL.md carries pipeline wiring. Either alone is corruptible by the very
// defects this file hunts, and a defect that shrinks the checked set is worse than the defect itself:
// the harness goes green by no longer looking.
//
// Both narrower versions were written and both were killed by the mutation driver within minutes:
//
//   filter `announce.mjs <own name>`  -> case 13 (typo the announced NAME) dropped harden-paper out
//                                        of scope; harness printed "20 pipeline skills", said nothing
//   filter `announce.mjs` path        -> case 5b (typo the announce PATH) dropped camera-ready the
//                                        same way
//
// Each time, the mutation that used to turn the harness red went GREEN because the planted defect
// erased its own subject. Scope decided by a property the defect corrupts is not scope.
//
// The union cannot be shrunk by a single-point edit: break the wiring and the gate table still holds
// the skill; forget the gate table and the disk still does. Only removing it from BOTH — which is
// what actually leaving the pipeline looks like — takes it out of scope, and EXCLUDED makes that
// deliberate and reasoned rather than silent.
const wiredOnDisk = readdirSync(SKILLS_DIR)
  .filter((d) => existsSync(join(SKILLS_DIR, d, "SKILL.md")))
  .filter((d) => PIPELINE_MARKER.test(readFileSync(join(SKILLS_DIR, d, "SKILL.md"), "utf-8")));

// EXCLUDED deliberately does NOT filter here — see its comment. An entry means "no gate row",
// and that is applied at assertion 12b alone; everything structural still looks at it.
export const SKILLS = [...new Set([...GATE_SKILLS, ...wiredOnDisk])]
  .filter((d) => existsSync(join(SKILLS_DIR, d, "SKILL.md"))) // 12a reports a gate with no directory
  .sort();


// The nine that gained Bash ONLY so they could write the ledger, per
// `.claude/skills/ALLOWED-TOOLS-AUDIT-2026-08-03.md`. PINNED because the property is not derivable:
// from the frontmatter alone a plain `Bash` on `render-paper` (pdflatex, bibtex, apt-get — it needs
// it) is indistinguishable from a plain `Bash` on `argument-arc` (which would be a regression). The
// audit decided that per skill by reading each one's text; this list is that decision, made checkable.
// A skill moving off this list is a deliberate act and should require editing this line.
export const LEDGER_ONLY_BASH = new Set([
  "argument-arc", "tighten-paper", "grade-paper-writing", "paper-adversarial-review", "draft-paper",
  "extend-paper", "research-ideate", "find-venue", "plan-paper-timeline",
]);

// ── parsing ────────────────────────────────────────────────────────────────────────────────────

/** Raw text between the opening `---` and the next `---`. Null if there is no frontmatter at all. */
export function frontmatter(src) {
  return frontmatterBlock(src);
}

/**
 * THE frontmatter reader. One parser, and it is a real one.
 *
 * 🔴 THIS USED TO BE A HAND-ROLLED LENIENT READER, AND THE REASON IT IS GONE IS THE POINT
 * (2026-08-19). The old comment here defended leniency: four skills did not parse as strict YAML —
 * an unquoted `description:` containing ": ", which YAML reads as opening a nested mapping — and a
 * strict parser would have failed them on assertion 1 and then SKIPPED assertions 2, 3, 4 and 9 on
 * exactly the files most likely to carry other defects. So the corpus was read one way and shipped
 * another, and a whole assertion existed to police the gap.
 *
 * That is compensating for our own tolerance. The corpus owner's call: fix the defect by construction instead.
 * The two remaining offenders were quoted, so the corpus now parses strictly — measured, all 40
 * SKILL.md files, zero failures — and this reader became the check. A file that is not valid YAML
 * no longer produces a plausible-looking object with a missing `allowed-tools`; it throws, here,
 * naming itself. The failure mode that mattered — "any consumer with a real parser sees NO
 * allowed-tools, so the skill inherits every tool" — is not reachable from a reader that refuses
 * to guess.
 *
 * ⚠️ The root cause is upstream and is being fixed there too: `vigiles compile` emits
 * `description: ${spec.description}` by raw interpolation (core/compile.js:634 and :841,
 * core/compile-generator.js:297), so a description with a colon regenerates the bad file on the
 * next compile. Until that ships, this reader is what notices — loudly, and on the next run rather
 * than months later.
 */
export function parseFm(fmText, where = "frontmatter") {
  try {
    const out = yaml.load(fmText);
    if (out === null || typeof out !== "object" || Array.isArray(out))
      throw new Error(`parsed to ${Array.isArray(out) ? "a list" : typeof out}, not a mapping`);
    return out;
  } catch (e) {
    throw new Error(
      `${where}: frontmatter is not valid YAML — ${String(e.message).split("\n")[0]}. ` +
      `Almost always an unquoted \`description:\` containing ": " — quote the value. ` +
      `Nothing reads this file until it parses: a lenient fallback here is what previously let a ` +
      `skill ship with no readable allowed-tools and inherit every tool.`,
      // `cause` is not decoration: the message above takes `.split("\n")[0]`, i.e. it throws
      // away the line and column that js-yaml prints as its second paragraph. Without the
      // cause, debugging a broken frontmatter starts with locating it by hand (2026-08-28,
      // `preserve-caught-error`).
      { cause: e },
    );
  }
}

/**
 * `allowed-tools` as a list, accepting BOTH shapes the corpus now contains.
 *
 * Hand-written skills carry a comma scalar (`Bash, Read`); a skill compiled from a
 * `SKILL.md.spec.ts` carries a real YAML flow sequence (`[Bash, Read]`) — which is the
 * MORE correct form, because a scalar parses as one string and loses the contract on a
 * round trip (vigiles #107). This split understood only the scalar, so on 2026-08-17
 * adopting five pipeline skills turned four harnesses red: the checker read the whole
 * bracketed list as a single entry named `[Bash` and reported that the skill's own
 * `Bash(node …announce.mjs:*)` instruction was denied. The skills were fine; the reader
 * was not.
 *
 * Entries themselves carry no commas (`Bash(node …:*)` has none), so a plain split is
 * still exact once the flow brackets are off.
 */
export const toolList = (v) =>
  // 2026-08-19: with a real YAML parser upstream, the flow form `[Bash, Read]` now arrives as an
  // ACTUAL array, not the string "[Bash, Read]". It survived the switch only because
  // `String(["Bash","Read"])` happens to produce "Bash,Read" and the split put it back — a correct
  // answer by coincidence, which stops being correct the day an entry contains a comma. Handle the
  // array as an array; the scalar branch stays for hand-written skills.
  (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : String(v ?? "")
    .trim()
    .replace(/^\[(.*)\]$/s, "$1")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean));

/**
 * Does `entry` permit `cmd`? Mirrors Claude Code's rule: bare `Bash` permits everything;
 * `Bash(prefix:*)` permits any command starting with `prefix`; an inner `*` is a wildcard.
 */
export function permits(entry, cmd) {
  if (entry === "Bash") return true;
  const m = entry.match(/^Bash\((.*)\)$/);
  if (!m) return false;
  const pat = m[1].replace(/:\*$/, "");
  const rx = new RegExp("^" + pat.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*"));
  return rx.test(cmd);
}

/** Every `node|bash|python3 <script>` line the SKILL.md instructs, with its full command text. */
export function commands(src) {
  return [...src.matchAll(/^\s*(node|bash|python3?) +([A-Za-z0-9_./@-]+\.(?:mjs|js|sh|py))(.*)$/gm)]
    .map((m) => ({ runner: m[1], script: m[2], cmd: `${m[1]} ${m[2]}${m[3]}`.trim(), args: m[3].trim().split(/\s+/).filter(Boolean) }));
}

/**
 * The `Record the verdict` block: from its heading to the next heading of the same or higher level.
 *
 * 🔴 The first version of this sliced `rest.slice(1).search(/^#{1,3} /m)` and `^` matched at offset 0
 * of the slice, so every block came back as the single character "#". Assertions 10 and 11 then read
 * an empty block, found no verdicts, and 10 fired on all 21 skills while 11 checked nothing at all —
 * a checker firing on clean input and a checker that is vacuous, from one off-by-one. Caught by
 * running it, not by reading it. Matching on `\n#` rather than `^#` is the fix.
 *
 * 2026-08-11 — switched to a real parser (`CLAUDE.md`: "markdown is parsed with a parser"). The
 * same off-by-one is now INEXPRESSIBLE: a heading from the parser already carries the offset of
 * its line start, so the block boundary no longer has to be computed from a newline's position.
 * Along with it went two defects the old expression carried silently: `#{1,3}` counted a hash
 * inside a ``` block as a heading (a skill QUOTING someone else's `## Run me` in an example cut
 * its own block short at the quote), and `\n#{1,3} ` did not see a heading indented by 1-3
 * spaces, which CommonMark still counts as a heading. The block boundary is preserved byte for
 * byte: end = start of the next heading.
 */
export function recordBlock(src) {
  const hs = mdHeadings(src);
  const i = hs.findIndex((h) => h.depth <= 3 && /record the verdict/i.test(h.text));
  if (i < 0) return null;
  const next = hs.slice(i + 1).find((h) => h.depth <= 3);
  return src.slice(hs[i].offset, next ? next.offset : src.length);
}

// Three extractors, because they answer different questions and a single one would be wrong for one.
//
//   `allBold`  — every all-caps bolded token, whatever it is. The raw material for the other two.
//                Bold-only on purpose: several blocks write a retired word in prose ("There is no
//                PASS") or in backticks, and a looser match would read those DENIALS as claims —
//                which is the exact reading error that would make the turned-around assertion below
//                fire on every correct file.
//   `namedKinds`   — bolded tokens that are live constructors. Used to ask "can this check report a
//                    finding at all?".
//   `namedRetired` — bolded tokens from the DELETED vocabulary. Used to ask "does this block still
//                    instruct something `record()` refuses?".
export const allBold = (blk) => [...new Set([...blk.matchAll(/\*\*`?([A-Z][A-Z-]{2,})`?\*\*/g)].map((m) => m[1]))];
export const namedKinds = (blk) => allBold(blk).filter((v) => KINDS.includes(v));
export const namedRetired = (blk) => allBold(blk).filter((v) => RETIRED.has(v));
export const definedKinds = (blk) =>
  [...new Set([...blk.matchAll(/\*\*`?([A-Z][A-Z-]{2,})`?\*\*\s*(?=[—(:]| \()/g)].map((m) => m[1]))];

// The abstention reasons a block names, as backticked tokens: `no-witness`, `blocked`, …
export const namedReasons = (blk) =>
  [...new Set([...blk.matchAll(/`([a-z][a-z-]{3,})`/g)].map((m) => m[1]))].filter((r) => ABSTENTIONS.has(r));

// The honest-admission escape hatch, for a skill whose nature is to generate rather than judge.
// `draft-paper` is the designed case: it will abstain nearly always and its text says so, in the
// terms status.mjs uses. The regex matches that ARGUMENT, not a keyword, so an admission cannot be
// satisfied by pasting the word "smell".
export const ADMISSION = /(almost always record|never returned a (negative|finding)|a generator is not a gate|only honest negative)/i;

export const load = (name) => {
  const path = join(SKILLS_DIR, name, "SKILL.md");
  assert.ok(existsSync(path), `${name}: no SKILL.md at ${path} — it is listed as a pipeline skill and does not exist`);
  const src = readFileSync(path, "utf8");
  const fmText = frontmatter(src);
  assert.ok(fmText !== null, `${name}: SKILL.md has no --- frontmatter block; the skill cannot be loaded at all`);
  const fm = parseFm(fmText, name);
  return { name, path, src, fmText, fm, tools: toolList(fm["allowed-tools"]) };
};

// One-skill mode, for the COLOCATED per-skill harness files that sit next to each
// SKILL.md. Coverage is decided by placement (vigiles, 2026-08-11: a test that only
// NAMES a surface no longer counts), so each skill needs a file inside its own
// directory. Rather than copy these assertions 21 times — the drift this file was
// built to avoid — each colocated file sets ONLY and imports this one.
//
// 🔴 2026-08-28: THERE USED TO BE TWO MORE LINES BELOW, AND THEY WERE DEAD LOGIC, NOT CLUTTER.
//
//     const skills = (ONLY ? [ONLY] : SKILLS).map(load);
//     const skillDirs = new Set(readdirSync(SKILLS_DIR).filter((d) => existsSync(…)));
//
// Both were computed and read by NOBODY — not here, not on export. This is a leftover from the
// 2026-08-11 split, when the cross-skill checks moved into `pipeline-corpus.harness.mjs`: the
// bodies of the checks were carried over, and their inputs were forgotten. The paragraph above
// about "cross-skill assertions below" described exactly that block, now gone; after the move
// there is NOT A SINGLE CHECK below it, i.e. the comment promised a mechanism that does not
// exist — exactly what this base's "prose isn't policy" rule exists to catch.
//
// The second, less obvious cost: `.map(load)` is not an inert computation. `load()` carries an
// `assert.ok`, so this line was an UNDECLARED check of the whole corpus, run as a side effect of
// `import` and costing a read of all 22 `SKILL.md` files on every import of the library. This is
// exactly the kind of "via an import's side effect" coupling the file was moving away from (see
// the header of `skill-checks.mjs`). The real, declared carrier of this check is `checkSkill()`,
// which does it one skill at a time and with a legible message.
//
// `ONLY` stays: it is read by the check one line up — the only thing here that survived.
const ONLY = process.env.PIPELINE_SKILL_ONLY ?? "";
if (ONLY && !SKILLS.includes(ONLY))
  throw new Error(
    `PIPELINE_SKILL_ONLY="${ONLY}" is not a wired pipeline skill. Known: ${SKILLS.join(", ")}`
  );