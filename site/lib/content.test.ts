import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  disclaimer,
  fencedAfter,
  plain,
  readmeContent,
  shortName,
  tableAfter,
} from "./content.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel: string): string => readFileSync(root + rel, "utf8");

const README = `# x

> ⚠️ **An aid, not a guarantee.** A clean run can miss
> something. Provided "as is".

### A new paper

1. Install.

   \`\`\`sh
   npm i -D paperlint
   npx paperlint init
   \`\`\`

   the first run already catches something (output shortened):

   \`\`\`text
   papers/p/paper.tex
     1:1  error  boom  pdf/fonts
   \`\`\`

## 🎯 Supported venues

| preset | venue | format | kinds |
| --- | --- | --- | --- |
| \`paperlint:aisec\` | AISec @ ACM CCS | ACM | 10 pages ([why](docs/rules.md#x)) |
| \`paperlint:acm\` | any ACM conference | ACM | [none](docs/x.md) |

After.
`;

describe("readmeContent", () => {
  it("reads the install block, the lint output and the venue table, indentation removed", () => {
    expect(readmeContent(README)).toEqual({
      install: ["npm i -D paperlint", "npx paperlint init"],
      lintOutput: ["papers/p/paper.tex", "  1:1  error  boom  pdf/fonts"],
      venues: [
        {
          preset: "paperlint:aisec",
          venue: "AISec @ ACM CCS",
          format: "ACM",
          limits: "10 pages",
        },
        {
          preset: "paperlint:acm",
          venue: "any ACM conference",
          format: "ACM",
          limits: "none",
        },
      ],
      disclaimer: "An aid, not a guarantee. A clean run can miss something.",
    });
  });

  it("fails the build when the install block no longer installs", () => {
    expect(() =>
      readmeContent(README.replace("npm i -D paperlint", "echo")),
    ).toThrow(
      "site: no `npm i` in the install block — the README changed; update site/lib/content.ts to match",
    );
  });
});

describe("the readers' edges", () => {
  it("keeps a blank line inside an indented block, and reads a table or a quote that ends the file", () => {
    expect(fencedAfter("A\n  ```sh\n  a\n\n  b\n  ```\n", "A", "sh")).toEqual([
      "a",
      "",
      "b",
    ]);
    expect(tableAfter("## T\n| h |\n| - |\n| `x` |", "## T")).toEqual([["x"]]);
    expect(disclaimer("> **An aid, not a guarantee.** End.")).toBe(
      "An aid, not a guarantee. End.",
    );
  });

  it("fails the build when an anchor, a block or a table is gone", () => {
    expect(() => fencedAfter("text", "### A new paper", "sh")).toThrow(
      'site: no "### A new paper"',
    );
    expect(() =>
      fencedAfter("### A new paper\nno block", "### A new paper", "sh"),
    ).toThrow('site: no ```sh block after "### A new paper"');
    expect(() => fencedAfter("A\n```sh\nnpm\n", "A", "sh")).toThrow(
      'site: an unclosed block after "A"',
    );
    expect(() => tableAfter("x", "## T")).toThrow('site: no "## T"');
    expect(() => tableAfter("## T\nno table", "## T")).toThrow(
      'site: no table after "## T"',
    );
    expect(() =>
      readmeContent(README.replace(/\| `paperlint:[^\n]*\n/g, "")),
    ).toThrow("site: an empty venue table");
  });

  it("fails the build when the disclaimer is gone", () => {
    expect(() => readmeContent(README.replace("An aid", "A help"))).toThrow(
      'site: no "An aid, not a guarantee" quote',
    );
  });

  it("reads the real README: the two install commands the site shows", () => {
    expect(readmeContent(read("README.md")).install).toEqual([
      "npm i -D paperlint",
      "npx paperlint init",
    ]);
  });
});

describe("plain and shortName", () => {
  it("drops the why-link, keeps a link's text, unquotes code", () => {
    expect(plain(" `a` 5 pages ([why](x)) and [b](y) ")).toBe(
      "a 5 pages and b",
    );
  });

  it("names a venue by what precedes @ or (, and none for a format-only preset", () => {
    expect(
      ["AISec @ ACM CCS", "MSR (Technical)", "any IEEE conference"].map(
        shortName,
      ),
    ).toEqual(["AISec", "MSR", null]);
  });
});
