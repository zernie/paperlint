/**
 * Named rule sets (src/rule-sets.ts): what `paperlint:writing` holds, that it holds only rules off by
 * default, and how the parser of the `rules` key expands it — in place, so a later entry wins. What
 * the set does to a paper through `paperlint lint` is in `rule-cases.test.ts` («the writing set») and
 * `lint-fix.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { OPTIONAL_RULES, SHIPPED_RULES } from "./cli.ts";
import { presetProblemText } from "./presets.ts";
import { parseRuleBlocks, parseRuleEntries } from "./rules-config.ts";
import {
  REVISION_PLAN_SET,
  RULE_SETS,
  setMembers,
  WRITING_SET,
} from "./rule-sets.ts";

const parse = (v: unknown) => parseRuleEntries(v, "S", SHIPPED_RULES);
const atWarn = Object.fromEntries(WRITING_SET.map((id) => [id, "warn"]));

describe("paperlint:writing", () => {
  it("holds the writing-preference rules, and only those", () => {
    expect(setMembers("paperlint:writing")).toEqual([
      "paper/section-word",
      "paper/leading-zero",
      "paper/figure-ref-style",
      "tex/claim-provenance",
      "tex/register",
      "tex/contrast-frames",
      "tex/claim-emphasis",
      "tex/relation-markers",
      "tex/negated-sentences",
      "tex/max-paragraph-words",
      "tex/max-paragraph-numbers",
      "tex/max-sentence-words",
      "tex/max-caption-words",
    ]);
    expect([...RULE_SETS.keys()]).toEqual([
      "paperlint:writing",
      "paperlint:revision-plan",
    ]);
  });

  it.each(WRITING_SET)(
    "%s is a shipped rule that is off by default — turning the set off gives back the default set",
    (id) => {
      expect(SHIPPED_RULES.has(id)).toBe(true);
      expect(OPTIONAL_RULES.has(id)).toBe(true);
    },
  );

  it("a name that is no set has no members", () => {
    expect(setMembers("paperlint:strict")).toBeNull();
    expect(setMembers("constructor")).toBeNull();
  });
});

describe("paperlint:revision-plan", () => {
  it("holds the rules that read a paper's revision plan", () => {
    expect(setMembers("paperlint:revision-plan")).toEqual([
      "revision-plan/record",
    ]);
  });

  it.each(REVISION_PLAN_SET)(
    "%s is a shipped rule that is off by default",
    (id) => {
      expect(SHIPPED_RULES.has(id)).toBe(true);
      expect(OPTIONAL_RULES.has(id)).toBe(true);
    },
  );
});

describe("a set in the `rules` key expands where it is written", () => {
  it("one line turns every member on at the set's severity", () => {
    expect(parse({ "paperlint:writing": "warn" })).toEqual({
      ok: true,
      value: atWarn,
    });
  });

  it("an entry after the set wins: one member off, another with its options", () => {
    expect(
      parse({
        "paperlint:writing": "warn",
        "tex/register": "off",
        "tex/max-sentence-words": ["error", { max: 40 }],
      }),
    ).toEqual({
      ok: true,
      value: {
        ...atWarn,
        "tex/register": "off",
        "tex/max-sentence-words": ["error", { max: 40 }],
      },
    });
  });

  it("the set after an entry wins over it, as a later ESLint entry does", () => {
    expect(
      parse({ "tex/register": "off", "paperlint:writing": "error" }),
    ).toEqual({
      ok: true,
      value: Object.fromEntries(WRITING_SET.map((id) => [id, "error"])),
    });
  });

  it('"off" turns every member off — how a paper undoes the root\'s set', () => {
    expect(parse({ "paperlint:writing": "off" })).toEqual({
      ok: true,
      value: Object.fromEntries(WRITING_SET.map((id) => [id, "off"])),
    });
  });
});

describe("what a set refuses, and where else it is written", () => {
  it("a set takes a severity alone: options would be one member's, so they are refused", () => {
    expect(parse({ "paperlint:writing": ["warn", { max: 40 }] })).toEqual({
      ok: false,
      error:
        'S["paperlint:writing"]: ["warn",{"max":40}] — a rule set takes a severity alone ("off", "warn" or "error"); give one member its options in its own entry after the set',
    });
  });

  it("a name that is neither a rule nor a set is refused, and the message names the sets", () => {
    const r = parse({ "paperlint:strict": "warn" });
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error).toMatch(
      /^S: "paperlint:strict" is not a rule paperlint ships — known: .*; rule sets: paperlint:writing$/,
    );
  });

  it("in a block of the list form too", () => {
    expect(
      parseRuleBlocks(
        [{ files: ["papers/a/**"], rules: { "paperlint:writing": "warn" } }],
        "S",
        SHIPPED_RULES,
        "/consumer",
      ),
    ).toEqual({
      ok: true,
      value: [{ basePath: "/consumer", files: ["papers/a/**"], rules: atWarn }],
    });
  });
});

describe('"extends" naming a set', () => {
  it("says the set goes in `rules`", () => {
    expect(
      presetProblemText({
        kind: "not-found",
        spec: "paperlint:writing",
        file: "/pkg/presets/writing.jsonc",
        shipped: ["aisec"],
      }),
    ).toBe(
      '"extends": "paperlint:writing" names no preset (/pkg/presets/writing.jsonc); shipped presets (paperlint:<name>): aisec. paperlint:writing is a rule set, not a venue: turn it on in "rules": { "paperlint:writing": "warn" }',
    );
  });

  it("any other unknown name gets the list alone", () => {
    expect(
      presetProblemText({
        kind: "not-found",
        spec: "paperlint:nope",
        file: "/pkg/presets/nope.jsonc",
        shipped: ["aisec"],
      }),
    ).toBe(
      '"extends": "paperlint:nope" names no preset (/pkg/presets/nope.jsonc); shipped presets (paperlint:<name>): aisec',
    );
  });
});
