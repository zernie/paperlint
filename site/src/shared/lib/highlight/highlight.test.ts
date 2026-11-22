import { describe, expect, it } from "vitest";
import { highlight, highlightCommand, toTone } from "./highlight.ts";

describe("highlight", () => {
  it("tells a shell command's program, options, quoted strings and comment apart; arguments stay plain", () => {
    expect(
      highlight(`npx paperlint new p --venue "a b" # note`, "shellscript"),
    ).toEqual([
      [
        { content: "npx", tone: "command" },
        { content: " ", tone: "plain" },
        { content: "paperlint", tone: "plain" },
        { content: " ", tone: "plain" },
        { content: "new", tone: "plain" },
        { content: " ", tone: "plain" },
        { content: "p", tone: "plain" },
        { content: " ", tone: "plain" },
        { content: "--venue", tone: "flag" },
        { content: " ", tone: "plain" },
        { content: `"a b"`, tone: "string" },
        { content: " ", tone: "plain" },
        { content: "# note", tone: "comment" },
      ],
    ]);
  });

  it("gives a JSON file one line per line, its values as strings", () => {
    const lines = highlight(`{ "a": "b",\n  "c": "d" }`, "json");
    expect(lines).toHaveLength(2);
    expect(lines.flat().filter((t) => t.tone === "string")).toEqual([
      { content: `"b"`, tone: "string" },
      { content: `"d"`, tone: "string" },
    ]);
  });

  it("gives a one-line command as one line of tokens", () => {
    expect(highlightCommand("npx paperlint init")).toEqual(
      highlight("npx paperlint init", "shellscript")[0],
    );
  });

  it("reads an unknown or missing colour as plain", () => {
    expect(toTone("#123456")).toBe("plain");
    expect(toTone(undefined)).toBe("plain");
    expect(toTone("FLAG")).toBe("flag");
  });
});
