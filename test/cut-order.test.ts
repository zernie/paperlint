/**
 * ONE CUT ORDER (#486). What to spend first when a paper's body overruns its page limit is written
 * once, in `skills/paper-pipeline/references/body-vs-appendix.md`, section "When the body overruns".
 * The skill that cuts for length (`tighten-paper`)
 * points there and keeps no order of its own: when each skill carried its own wording, the one the
 * pass followed ranked a result above a 689-word Threats section and 26 once-cited references.
 *
 * Read from the compiled SKILL.md, the text an agent loads. Every predicate runs twice: over the real
 * text (quiet) and over the same text with the change of #486 reverted in place (fires). The revert
 * asserts its anchor is present first, so a reworded skill fails here by name instead of mutating
 * nothing and passing.
 *
 * What this does not prove: that a model follows the order. That is `cut-order-loud.eval.ts` and
 * `cut-order-quiet.eval.ts` in `skills/tighten-paper/`, which cost money.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import MarkdownIt from "markdown-it";
import { describe, expect, it } from "vitest";

interface Token {
  type: string;
  tag: string;
  level: number;
  content: string;
  children: Token[] | null;
}

const ROOT = join(import.meta.dirname, "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");
const parse = (text: string): Token[] => new MarkdownIt().parse(text, {});
const flat = (s: string): string => s.replace(/\s+/gu, " ");

const REFERENCE = "skills/paper-pipeline/references/body-vs-appendix.md";
const POINTER = "paper-pipeline/references/body-vs-appendix.md";
const SECTION = "When the body overruns";

/** The kinds of cut, in the required order, each known by a phrase of its bold lead. */
const KINDS: readonly (readonly [string, string])[] = [
  ["measure-and-strike", "measure, then strike"],
  ["duplicate", "duplicates another block"],
  ["sentences-about-the-text", "sentences about the text itself"],
  ["bibliography-and-floats", "bibliography format and float layout"],
  ["threats-wording", "wording of threats to validity"],
  ["once-cited-reference", "reference cited once"],
  ["appendix", "to the appendix"],
  ["artifact", "to the artifact"],
  ["drop-claim", "drop a claim"],
];

/** The tokens of the level-2 section titled `title`, heading excluded. */
function section(md: string, title: string): Token[] {
  const tokens = parse(md);
  const start = tokens.findIndex(
    (t, i) =>
      t.type === "inline" && t.content === title && tokens[i - 1]?.tag === "h2",
  );
  if (start === -1) return [];
  const end = tokens.findIndex(
    (t, i) => i > start && t.type === "heading_open" && t.tag === "h2",
  );
  return tokens.slice(start + 1, end === -1 ? undefined : end);
}

/** The bold text a token's inline children open with, or "" when none. */
function boldLead(t: Token): string {
  const kids = t.children ?? [];
  const open = kids.findIndex((k) => k.type === "strong_open");
  const close = kids.findIndex((k) => k.type === "strong_close");
  return open === -1 || close === -1
    ? ""
    : flat(
        kids
          .slice(open + 1, close)
          .map((k) => (k.type === "softbreak" ? " " : k.content))
          .join(""),
      );
}

/** The kinds the first ordered list of the cut-order section names, in its order. */
function cutOrderKinds(md: string): string[] {
  const tokens = section(md, SECTION);
  const list = tokens.findIndex((t) => t.type === "ordered_list_open");
  const open = tokens[list];
  if (open === undefined) return [];
  const close = tokens.findIndex(
    (t, i) =>
      i > list && t.type === "ordered_list_close" && t.level === open.level,
  );
  return tokens
    .slice(list, close)
    .filter(
      (t, i, xs) =>
        t.type === "inline" &&
        xs[i - 2]?.type === "list_item_open" &&
        xs[i - 2]?.level === open.level + 1,
    )
    .map((t) => {
      const lead = boldLead(t).toLowerCase();
      return (
        KINDS.find(([, phrase]) => lead.includes(phrase))?.[0] ??
        `unknown: ${lead}`
      );
    });
}

/** Whether the cut-order section asks a results cut to show the earlier kinds spent. */
const hasLedgerRule = (md: string): boolean =>
  section(md, SECTION).some(
    (t) =>
      t.type === "inline" &&
      ["result", "abstract", "exhausted"].every((w) =>
        flat(t.content).includes(w),
      ),
  );

/** Whether a paragraph of the cut-order section contains every one of `phrases`. */
const sectionSays = (md: string, phrases: readonly string[]): boolean =>
  section(md, SECTION).some(
    (t) =>
      t.type === "inline" &&
      phrases.every((p) => flat(t.content).toLowerCase().includes(p)),
  );

/** The ledger's definition of exhausted, the spend rule, and the closing rule of short last lines. */
const hasSpendRule = (md: string): boolean =>
  sectionSays(md, [
    "spend in this order until the measured overflow is covered",
  ]);
const hasLedgerDefinition = (md: string): boolean =>
  sectionSays(md, ["n candidates, m taken, reason for each left"]);
const hasClosingRule = (md: string): boolean =>
  sectionSays(md, ["short last lines", "text is frozen", "#489"]);

/** Whether one paragraph or list item names the reference in a code span AND its section. */
const pointsToCutOrder = (md: string): boolean =>
  parse(md).some(
    (t) =>
      t.type === "inline" &&
      (t.children ?? []).some(
        (c) => c.type === "code_inline" && c.content === POINTER,
      ) &&
      flat(t.content).includes(SECTION),
  );

/** The old name of the step about sentences on the text itself: in an agentic-coding paper it means the harness. */
const OLD_NAME = /scaffolding/iu;

/** Orderings of their own the three skills carried before #486, so none comes back unnoticed. */
const RETIRED = [
  "PRIMARY length lever",
  "Make a fold list first, before any sentence-level cutting",
  "Lead with the highest-impact",
  "Trim the reference list to the essential subset",
  "lean ~10 refs",
];
const ownOrderings = (md: string): string[] =>
  RETIRED.filter((r) => flat(md).includes(r));

/** What a skill's text gets wrong about the cut order. */
const skillFindings = (md: string): string[] => [
  ...(pointsToCutOrder(md) ? [] : [`no pointer to ${POINTER}, "${SECTION}"`]),
  ...ownOrderings(md).map((r) => `own ordering: "${r}"`),
];

/** `text` with `now` put back to `before`; throws when `now` is not there. */
function revert(text: string, now: string, before: string): string {
  if (!text.includes(now))
    throw new Error(`the text no longer holds: ${now.slice(0, 60)}…`);
  return text.replace(now, before);
}

describe("the cut order lives in body-vs-appendix.md", () => {
  const md = read(REFERENCE);
  const SEVEN_KIND_LIST = [
    "1. **Cut a whole block that duplicates another block.** Free.",
    "2. **Cut scaffolding**: signposts.",
    "3. **Shorten the wording of Threats to validity, related work and discussion.**",
    "4. **Cut a reference cited once, in a sentence that is not a claim**: background.",
    "5. **Move a whole block to the appendix**, leaving a one-clause statement.",
    "6. **Move a measurement to the artifact** and cite it.",
    "7. **Drop a claim.** An honest reduction in scope.",
    "",
    "",
  ].join("\n");
  const OLD_LIST = [
    "1. **Cut a whole block that duplicates another block.** Free.",
    "2. **Cut scaffolding**: signposts.",
    "3. **Move a whole block to the appendix**, leaving a one-clause statement.",
    "4. **Move a measurement to the artifact** and cite it.",
    "5. **Drop a claim.** An honest reduction in scope.",
    "",
    "",
  ].join("\n");
  const listNow = md.slice(
    md.indexOf("0. **Measure, then strike"),
    md.indexOf("🔴 **Never pay by trimming"),
  );
  const ledgerNow = md.slice(
    md.indexOf("🔴 **Before proposing to cut"),
    md.indexOf("A qualification that narrows a number in the body has no rank"),
  );

  it("measures first, spends layout before prose and prose before references, and moves a block last", () => {
    expect(cutOrderKinds(md)).toEqual(KINDS.map(([id]) => id));
  });

  it("fires on the seven-kind list it had before the measure step", () => {
    expect(cutOrderKinds(revert(md, listNow, SEVEN_KIND_LIST))).toEqual([
      "duplicate",
      "unknown: cut scaffolding",
      "threats-wording",
      "once-cited-reference",
      "appendix",
      "artifact",
      "drop-claim",
    ]);
  });

  it("fires on the five-kind list it had before", () => {
    expect(cutOrderKinds(revert(md, listNow, OLD_LIST))).toEqual([
      "duplicate",
      "unknown: cut scaffolding",
      "appendix",
      "artifact",
      "drop-claim",
    ]);
  });

  it("asks a results or abstract cut to show the earlier kinds exhausted, and fires without it", () => {
    expect([
      hasLedgerRule(md),
      hasLedgerRule(revert(md, ledgerNow, "")),
    ]).toEqual([true, false]);
  });
});

describe("the rules around the cut order", () => {
  const md = read(REFERENCE);

  it("spends in order until the measured overflow is covered, not at the first that fits", () => {
    expect(flat(md)).not.toContain("Stop at the first one that fits");
    expect([
      hasSpendRule(md),
      hasSpendRule(
        revert(
          md,
          "Spend in this order until the measured overflow is covered.",
          "Stop at the first one that fits.",
        ),
      ),
    ]).toEqual([true, false]);
  });

  it("defines exhausted as candidates, taken and the reason for each left, and fires without it", () => {
    expect([
      hasLedgerDefinition(md),
      hasLedgerDefinition(
        revert(md, "N candidates, M taken, reason for each left", "the words"),
      ),
    ]).toEqual([true, false]);
  });

  it("closes with short last lines as a rule outside the steps, and fires without it", () => {
    const closing = md.slice(
      md.indexOf("**Closing rule"),
      md.indexOf("🔴 **Never pay by trimming"),
    );
    expect([
      hasClosingRule(md),
      hasClosingRule(revert(md, closing, "")),
    ]).toEqual([true, false]);
  });
});

/** Each skill, with one passage of #486 and what that passage said before it. */
const SKILLS = {
  "tighten-paper": {
    now: "- **The ORDER in which kinds of content are spent has one owner:**",
    before:
      '- **"Fold to the artifact" is the PRIMARY length lever for a measurement/benchmark paper.** Make a fold list first, before any sentence-level cutting.\n- **Ranking:**',
    expected: [
      `own ordering: "PRIMARY length lever"`,
      `own ordering: "Make a fold list first, before any sentence-level cutting"`,
    ],
  },
} as const;

describe.each(Object.entries(SKILLS))(
  "%s",
  (name, { now, before, expected }) => {
    const md = read(`skills/${name}/SKILL.md`);

    it("points to the cut order and keeps none of its own", () => {
      expect(skillFindings(md)).toEqual([]);
    });

    it("fires when its own ordering comes back", () => {
      expect(skillFindings(revert(md, now, before))).toEqual(expected);
    });

    it("fires when the pointer is gone", () => {
      const stripped = md.split(POINTER).join("the-reference.md");
      expect(skillFindings(stripped)).toEqual([
        `no pointer to ${POINTER}, "${SECTION}"`,
      ]);
    });
  },
);

describe("the old name of step 2 is gone", () => {
  it.each([REFERENCE, ...["tighten-paper"].map((n) => `skills/${n}/SKILL.md`)])(
    "%s does not call sentences about the text scaffolding",
    (path) => {
      const md = read(path);
      expect([
        OLD_NAME.test(md),
        OLD_NAME.test(`${md} Cut scaffolding.`),
      ]).toEqual([false, true]);
    },
  );
});

describe("tighten-paper's own changes of #486", () => {
  const md = flat(read("skills/tighten-paper/SKILL.md"));
  it("keeps the limitation and weighs its wording, and puts the bibliography in the shape", () => {
    expect(
      [
        "KEEP the item, SHORTEN the prose",
        "Then the bibliography, as a row of its own",
      ].filter((s) => !md.includes(s)),
    ).toEqual([]);
  });
});
