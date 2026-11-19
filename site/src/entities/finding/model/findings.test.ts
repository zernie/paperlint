import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { all, render, type Finding } from "./findings.ts";

const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const read = (rel: string): string => readFileSync(root + rel, "utf8");

describe("findings", () => {
  const fake: Finding = {
    rule: "r",
    level: "error",
    template: "\\`${s.a}\\` {{b}} {{c}} ${s.z}",
    values: { a: "x", b: "y" },
    source: "",
  };

  it("fills both placeholder syntaxes, leaves an unknown one, unescapes backticks", () => {
    expect(render(fake)).toBe("`x` y {{c}} ${s.z}");
  });

  it.each(all.map((f) => [f.rule, f] as const))(
    "quotes %s verbatim from its source, and docs/rules.md lists it",
    (rule, f) => {
      expect(read(f.source)).toContain(f.template);
      expect(read("docs/rules.md")).toContain("`" + rule + "`");
    },
  );

  it("a reworded message is caught", () => {
    expect(read("README.md")).not.toContain("1 column(s), AgenticDev wants 2");
  });
});
