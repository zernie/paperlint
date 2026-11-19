import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fencedAfter, readmeContent } from "@/shared/lib/readme";
import { withCaption } from "./captions.ts";

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

  it("fails the build for a command with no caption", () => {
    expect(() => withCaption("npx paperlint doctor")).toThrow(
      "site: no caption for «npx paperlint doctor» — add one to site/src/pages/home/model/captions.ts",
    );
  });

  it("has a caption for every command the README's install and first-run blocks show", () => {
    const commands = [
      ...readmeContent(readme).install,
      ...fencedAfter(readme, "Then check it:", "sh"),
    ];
    expect(commands.map((c) => withCaption(c).command)).toEqual(commands);
  });
});
