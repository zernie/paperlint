import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { INIT } from "@/shared/config";
import { fencedAfter } from "@/shared/lib/readme";
import { perPaperSteps, withCaption } from "./captions.ts";

const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const readme = readFileSync(root + "README.md", "utf8");

describe("withCaption", () => {
  it("pairs a command with the caption its start names", () => {
    expect(withCaption("npx paperlint build papers/my-paper")).toEqual({
      command: "npx paperlint build papers/my-paper",
      caption:
        "Turns paper.tex into paper.pdf, measures its pages and fonts, and checks each reference online. Needs TeX Live.",
    });
  });

  it("shows the install command the README's install block runs", () => {
    expect(fencedAfter(readme, "### A new paper", "sh")).toContain(
      INIT.command,
    );
  });

  it("fails the build for a command with no caption", () => {
    expect(() => withCaption("npx paperlint doctor")).toThrow(
      "site: no caption for «npx paperlint doctor» — add one to site/src/pages/home/model/captions.ts",
    );
  });

  it("has a caption for every command the README's first-run block shows", () => {
    const commands = fencedAfter(readme, "Then check it:", "sh");
    expect(commands.map((c) => withCaption(c).command)).toEqual(commands);
  });

  it("gives each paper the README's steps in order: create it, then build and check it", () => {
    const create = fencedAfter(readme, "Create a paper.", "sh");
    const check = fencedAfter(readme, "Then check it:", "sh");
    expect(create).toHaveLength(1);
    expect(create[0]).toMatch(/^npx paperlint new /);
    expect(perPaperSteps(readme)).toEqual(
      [...create, ...check].map(withCaption),
    );
    expect(withCaption(create[0] ?? "").caption).toBe(
      "Creates a folder for one paper. --venue names its venue, --kind which of its page limits applies.",
    );
  });
});
