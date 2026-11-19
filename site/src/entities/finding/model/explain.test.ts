import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readmeContent } from "@/shared/lib/readme";
import { explain, plainByRule } from "./explain.ts";

const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const readme = readFileSync(root + "README.md", "utf8");

describe("explain", () => {
  it("reads a lint line into its level, rule, plain words and the raw line", () => {
    expect(
      explain(
        "    1:1   error    1 column(s), AgenticDev requires 2 — the wrong document class or class option   pdf/geometry",
      ),
    ).toEqual({
      rule: "pdf/geometry",
      level: "error",
      title: "One column; AgenticDev needs two",
      plain:
        "The PDF is set in one column, and AgenticDev requires two. Switch to the venue's document class and build again.",
      raw: "1:1   error    1 column(s), AgenticDev requires 2 — the wrong document class or class option   pdf/geometry",
    });
    expect(explain("  1:1   warning  boom   pdf/fonts").level).toBe("warning");
  });

  it("fails the build on a line it cannot read, and on a rule with no plain words", () => {
    expect(() => explain("papers/my-paper/paper.tex")).toThrow(
      "site: not a lint line — «papers/my-paper/paper.tex»",
    );
    expect(() => explain("  1:1   error    boom   pdf/new-rule")).toThrow(
      "site: no plain words for pdf/new-rule — add them to site/src/entities/finding/model/explain.ts",
    );
  });

  it("has plain words for every rule in the README's first lint output, and for nothing else", () => {
    const rules = readmeContent(readme)
      .lintOutput.filter((l) => /^\s+\d+:\d+/.test(l))
      .map((l) => explain(l).rule);
    expect(rules).toEqual(Object.keys(plainByRule));
  });
});
