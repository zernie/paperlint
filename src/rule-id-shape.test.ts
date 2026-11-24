/**
 * "A Rule Id Names Its Subject" (eslint-rules/CLAUDE.md): every rule id paperlint registers is
 * `<family>/<rule>`, one slash, kebab-case. The ids are read off the registry `paperlint lint`
 * builds (`rulePlugins`), every family, so a rule registered tomorrow is judged the day it exists.
 */
import { describe, expect, it } from "vitest";
import { rulePlugins } from "./cli.ts";

/** One slash, a kebab-case family and a kebab-case rule. */
const SHAPE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

/** Every id the registry holds, `<plugin>/<rule>`. */
const registered = Object.entries(rulePlugins()).flatMap(([plugin, p]) =>
  Object.keys(p.rules ?? {}).map((rule) => `${plugin}/${rule}`),
);

describe("every registered rule id has the one-slash kebab-case shape", () => {
  it("the registry is read in full: several families, many rules", () => {
    // Guards: an empty registry would make the shape test below pass for nothing.
    expect([...new Set(registered.map((id) => id.split("/")[0]))]).toEqual(
      expect.arrayContaining(["paper", "tex", "corpus", "pdf", "cycle"]),
    );
  });

  it("no id breaks the shape", () => {
    expect(registered.filter((id) => !SHAPE.test(id))).toEqual([]);
  });

  it.each([
    "tex",
    "corpus/a/b",
    "Corpus/record",
    "corpus/Record",
    "corpus/rec_ord",
    "corpus/-record",
    "corpus/record-",
    "corpus/",
    "/record",
  ])("the shape refuses %s", (id) => {
    expect(SHAPE.test(id)).toBe(false);
  });
});
