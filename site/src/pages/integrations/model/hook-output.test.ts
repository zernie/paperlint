import { describe, expect, it } from "vitest";
import { hookExample, hookLines } from "./hook-output.ts";

describe("hookLines", () => {
  it("splits the hook's output into the file, each finding, blanks and its own words", () => {
    expect(
      hookLines(
        "p/paper.tex\n  7:14  error  boom here  tex/x\n  1:1  warning  hm  tex/y\n\nthe end.",
      ),
    ).toEqual([
      { kind: "file", text: "p/paper.tex" },
      {
        kind: "finding",
        at: "7:14",
        level: "error",
        message: "boom here",
        rule: "tex/x",
      },
      {
        kind: "finding",
        at: "1:1",
        level: "warning",
        message: "hm",
        rule: "tex/y",
      },
      { kind: "blank" },
      { kind: "text", text: "the end." },
    ]);
  });

  it("fails the build when the example holds no finding", () => {
    expect(() => hookLines("p/paper.tex\nnothing")).toThrow(
      "site: the lint-edited example holds no finding — update site/src/pages/integrations/model/hook-example.json",
    );
  });

  it("reads the stored example: it starts with the file the edit wrote, and holds a finding", () => {
    expect(hookExample.lines[0]).toEqual({
      kind: "file",
      text: hookExample.file,
    });
    expect(hookExample.lines.some((l) => l.kind === "finding")).toBe(true);
  });
});
