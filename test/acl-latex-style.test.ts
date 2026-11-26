/**
 * `tex/template` under the ACL family (`presets/acl-latex.jsonc`): the class is plain `article`, so
 * what makes a paper ACL's is the style it loads, `acl.sty` (#556).
 */
import { describe, expect, it } from "vitest";
import { lint } from "./venue-rules-lint.ts";

const ACL_VENUES = [
  { extends: "paperlint:acl-latex" },
  { extends: "paperlint:realm-2026", kind: "long" },
  { extends: "paperlint:emnlp-2026" },
  { extends: "paperlint:naacl-2027" },
  { extends: "paperlint:langcode-2027", kind: "long" },
];

/** The `tex/template` findings on an 11pt `article` paper with `preamble`. */
const template = (preamble: string, settings: Record<string, string>) =>
  lint(
    `\\documentclass[11pt]{article}\n${preamble}\n\\begin{document}\nText.\n\\end{document}\n`,
    settings,
  )
    .filter((f) => f.rule === "tex/template")
    .map((f) => f.messageId);

describe("tex/template — ACL's acl.sty", () => {
  // Guards: plain article without acl.sty passed every ACL venue (#556).
  it("🔴 without acl.sty, or with NeurIPS's style instead, fails every ACL preset", () => {
    for (const v of ACL_VENUES) {
      expect(template("\\usepackage{amsmath}", v)).toEqual(["missingStyle"]);
      expect(template("\\usepackage{neurips_2026}", v)).toEqual(["wrongStyle"]);
    }
  });

  // Guards: the family names no option, so the kit's review, final and preprint lines all pass.
  it("acl.sty with the review, final or preprint option, or none, passes every ACL preset", () => {
    for (const v of ACL_VENUES)
      for (const option of ["[review]", "[final]", "[preprint]", ""])
        expect(template(`\\usepackage${option}{acl}`, v)).toEqual([]);
  });
});
