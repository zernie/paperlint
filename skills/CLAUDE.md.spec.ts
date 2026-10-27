// Compiled to skills/CLAUDE.md by `npx vigiles compile`. Edit THIS file, never the markdown.
import { file, guidance, instructionFile, prose } from "vigiles/spec";

export default instructionFile({
  sections: {
    "`skills/`": prose`The skills this package ships. Loaded when working under \`skills/\`. The consumer's root and the
package's location come from ${file("skills/paper-pipeline/scripts/consumer.mjs")}; the links are made by
${file("src/link-skills.ts")}; install-specific paths are flagged by ${file("eslint-rules/install-path-literals.ts")}.`,
  },
  rules: {
    "skills-ship-in-skills": guidance(
      "Skills ship in `skills/`, never `.claude/skills/`. `paperlint init` symlinks each one into the consumer's `.claude/skills/<name>`; the link's directory name is the skill's name. `skills/` is the npm layout: of 855 packages scanned, 336 shipped `skills/` against 15 `.claude/skills/`. Rejected: leaving the skills for Claude Code to find inside `node_modules` (`docs/install.md`); a symlink loads at startup, deterministically. A skill for working on paperlint itself (it edits this repository's presets, tests or source) does not ship: it lives in `.claude/skills/<name>/` as a real directory, outside `files`, and no shipped skill or user doc names it (`add-venue`).",
    ),
    "a-criterion-that-judges-prose": guidance(
      'It follows the five principles in `eslint-rules/CLAUDE.md` ("A rule that judges prose"). A skill does not grep prose for what a rule can count.',
    ),
  },
});
