/**
 * skill-corpus.mjs — what a skill IS, read from its directory: the frontmatter, the tool contract,
 * the commands its text instructs. Derivation and helpers, no assertions — `skill-checks.mjs`
 * asserts about one skill by calling these.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";
import { consumerRoot } from "../skills/paper-pipeline/scripts/consumer.mjs";
import { requireMarkdown, frontmatterBlock } from "#lib/markdown";

// Markup is parsed with a real parser. Here we THROW rather than degrade: with no parser every
// frontmatter would read as absent, which is a finding about the corpus, not about the install.
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
      throw new Error(
        `parsed to ${Array.isArray(out) ? "a list" : typeof out}, not a mapping`,
      );
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
  Array.isArray(v)
    ? v.map((x) => String(x).trim()).filter(Boolean)
    : String(v ?? "")
        .trim()
        .replace(/^\[(.*)\]$/s, "$1")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

/**
 * Does `entry` permit `cmd`? Mirrors Claude Code's rule: bare `Bash` permits everything;
 * `Bash(prefix:*)` permits any command starting with `prefix`; an inner `*` is a wildcard.
 */
export function permits(entry, cmd) {
  if (entry === "Bash") return true;
  const m = entry.match(/^Bash\((.*)\)$/);
  if (!m) return false;
  const pat = m[1].replace(/:\*$/, "");
  const rx = new RegExp(
    "^" +
      pat
        .split("*")
        .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*"),
  );
  return rx.test(cmd);
}

/** Every `node|bash|python3 <script>` line the SKILL.md instructs, with its full command text. */
export function commands(src) {
  return [
    ...src.matchAll(
      /^\s*(node|bash|python3?) +([A-Za-z0-9_./@-]+\.(?:mjs|js|sh|py))(.*)$/gm,
    ),
  ].map((m) => ({
    runner: m[1],
    script: m[2],
    cmd: `${m[1]} ${m[2]}${m[3]}`.trim(),
    args: m[3].trim().split(/\s+/).filter(Boolean),
  }));
}

export const load = (name) => {
  const path = join(SKILLS_DIR, name, "SKILL.md");
  assert.ok(
    existsSync(path),
    `${name}: no SKILL.md at ${path} — it is listed as a pipeline skill and does not exist`,
  );
  const src = readFileSync(path, "utf8");
  const fmText = frontmatter(src);
  assert.ok(
    fmText !== null,
    `${name}: SKILL.md has no --- frontmatter block; the skill cannot be loaded at all`,
  );
  const fm = parseFm(fmText, name);
  return { name, path, src, fmText, fm, tools: toolList(fm["allowed-tools"]) };
};
