import { describe, expect, it } from "vitest";
import { isReferencesHeading, referencesStart } from "./body-pages.ts";

describe("isReferencesHeading", () => {
  it.each([
    "References",
    "REFERENCES",
    "R EFERENCES",
    "Bibliography",
    "7 References",
    "VII. REFERENCES",
    "  References  ",
  ])("%j is a heading", (line) => {
    expect(isReferencesHeading(line)).toBe(true);
  });

  it.each(["See the references below", "References to prior work", "Refs", ""])(
    "%j is not",
    (line) => {
      expect(isReferencesHeading(line)).toBe(false);
    },
  );
});

describe("referencesStart", () => {
  it("the body is every page before the heading's page", () => {
    expect(
      referencesStart([
        "Intro\nbody",
        "more body",
        "end\nReferences\n[1] A.",
        "Appendix",
      ]),
    ).toEqual({ kind: "found", page: 3, bodyPages: 2 });
  });

  it("a later statement or appendix after the references is not counted", () => {
    expect(
      referencesStart([
        "body",
        "R EFERENCES\n[1] x\nLLM Usage Statement",
        "Appendix A",
      ]),
    ).toEqual({ kind: "found", page: 2, bodyPages: 1 });
  });

  it("no heading on any page is said, not guessed", () => {
    expect(referencesStart(["body", "more"])).toEqual({ kind: "missing" });
    expect(referencesStart([])).toEqual({ kind: "missing" });
  });
});
