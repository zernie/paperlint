// Compiled to skills/CLAUDE.md by `npx vigiles compile`. Edit THIS file, never the markdown.
import { file, guidance, instructionFile, prose } from "vigiles/spec";
import { JOBS } from "./jobs.ts";

/**
 * The owner list of "One Owner Per Job", printed from `JOBS`: the jobs in table order, each with its
 * owners and, where a job is split, the scope after the key's `/`. The prose and the data are one copy.
 */
const named = Object.entries(JOBS).map(([key, owner]) => {
  const [job = key, scope] = key.split("/");
  return {
    job,
    owner:
      scope === undefined
        ? `\`${owner.name}\``
        : `\`${owner.name}\` (${scope})`,
  };
});
const owners = [...new Set(named.map((n) => n.job))]
  .map(
    (job) =>
      `${job} — ${named
        .filter((n) => n.job === job)
        .map((n) => n.owner)
        .join(", ")}`,
  )
  .join("; ");

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
    "one-owner-per-job": guidance(
      `Each job on a paper's text has one owner skill, and the others hand over to it instead of carrying their own instructions for it: ${owners}. The owners are \`skills/jobs.ts\`; who hands work to whom is each skill's \`flow\`, drawn in \`docs/pipeline.md\` and checked by \`test/pipeline.test.ts\`. A skill that finds a problem it does not own names the owner and stops. A second copy of an owner's rule in another skill is a defect: two copies drift, and the reader follows whichever it read last.`,
    ),
    "a-criterion-that-judges-prose": guidance(
      'It follows the five principles in `eslint-rules/CLAUDE.md` ("A rule that judges prose"). A skill does not grep prose for what a rule can count.',
    ),
  },
});
