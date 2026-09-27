/**
 * pipeline-edges.mjs admits each edge on a SENTENCE from a skill's own SKILL.md, quoted in the
 * table so the judgement stays auditable. A quote is only evidence while the skill still says it,
 * so every quote is looked up in the SKILL.md it names. A skill reworded since — or a quote that
 * was never verbatim — fails here, naming the edge.
 *
 * Matching tolerates what quoting legitimately changes: runs of whitespace, `**` emphasis, and an
 * elision `…`, which splits a quote into fragments that must each appear. The values are prose,
 * so reading them with a pattern is reading prose, not parsing a format.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { CANONICAL_INPUTS, NOT_EDGES, UNEXPRESSED } from "./pipeline-edges.mjs";

const SKILLS = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const norm = (s) => s.replace(/\*\*/g, "").replace(/\s+/g, " ");

/** [edge, skill, quote] for every `<skill>/SKILL.md…: "<quote>"` in the three tables. */
function quotes() {
  const cells = [
    ...Object.entries(CANONICAL_INPUTS).flatMap(([row, { requires }]) =>
      Object.entries(requires).map(([input, why]) => [
        `${row} ← ${input}`,
        why,
      ]),
    ),
    ...UNEXPRESSED,
    ...NOT_EDGES,
  ];
  return cells.flatMap(([edge, why]) =>
    quotesIn(why).map(([skill, quote]) => [edge, skill, quote]),
  );
}

/** [skill, quote] for every `<skill>/SKILL.md…: "<quote>"` in one cell. */
function quotesIn(why) {
  return [...why.matchAll(/([a-z-]+)\/SKILL\.md[^"]*"((?:[^"\\]|\\.)*)"/g)].map(
    (m) => [m[1], m[2]],
  );
}

// Guards: the pattern below is not vacuous — a cell that names a SKILL.md yields its quote.
test("every cell that names a SKILL.md yields a quote to check", () => {
  const cells = [
    ...Object.values(CANONICAL_INPUTS).flatMap((v) =>
      Object.values(v.requires),
    ),
    ...UNEXPRESSED.map(([, why]) => why),
    ...NOT_EDGES.map(([, why]) => why),
  ];
  const unparsed = cells.filter(
    (why) => why.includes("/SKILL.md") && quotesIn(why).length === 0,
  );
  assert.deepEqual(unparsed, []);
});

test("every quoted sentence is still in the SKILL.md it is attributed to", () => {
  const stale = quotes().flatMap(([edge, skill, quote]) => {
    const file = join(SKILLS, skill, "SKILL.md");
    if (!existsSync(file))
      return [{ edge, skill, missing: "the skill itself" }];
    const text = norm(readFileSync(file, "utf8"));
    return norm(quote)
      .split("…")
      .map((f) => f.trim())
      .filter((f) => f.length > 0 && !text.includes(f))
      .map((missing) => ({ edge, skill, missing }));
  });
  assert.deepEqual(stale, []);
});
