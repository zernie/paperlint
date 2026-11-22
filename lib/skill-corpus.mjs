/**
 * skill-corpus.mjs — the strict reader of a SKILL.md frontmatter block. It reads nothing on import:
 * the caller passes the text it already has.
 */
import * as yaml from "js-yaml";

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
