import { expect, test } from "vitest";
import { latexReader } from "./index.ts";

const NUMBERS = [
  "\\newcommand{\\nRepos}{63}",
  "\\newcommand*{\\pctPass}{ 41.2\\% }",
  "\\def\\nRuns{7}",
  "\\renewcommand\\nRepos{64}",
  "\\newcommand{\\twice}[1]{#1#1}",
  "% \\newcommand{\\commented}{1}",
].join("\n");

test("macroValues: each argument-less definition with its body as written, in source order", () => {
  // Guards: \newcommand, \newcommand*, \def and \renewcommand read; one with arguments and one in a comment not.
  expect(latexReader.macroValues(NUMBERS)).toEqual([
    { name: "nRepos", value: "63" },
    { name: "pctPass", value: "41.2\\%" },
    { name: "nRuns", value: "7" },
    { name: "nRepos", value: "64" },
  ]);
});

test("macrosUsed: a name counts where it is used, not where it is defined", () => {
  const src =
    "\\newcommand{\\local}{x}\\newcommand{\\pct}{\\nRuns\\%}\n\\begin{document}\nWe saw \\nRepos{} repos, \\pct.\n% \\pctPass\n\\end{document}\n";
  // Guards: \local is only defined; \nRuns counts through \pct's body; a comment holds no use;
  // the definers and \% are macros too, which no numbers file defines.
  expect([...latexReader.macrosUsed(src)].sort()).toEqual(
    ["%", "nRepos", "nRuns", "newcommand", "pct"].sort(),
  );
});
