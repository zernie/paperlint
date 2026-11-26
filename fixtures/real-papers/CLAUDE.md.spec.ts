// Compiled to fixtures/real-papers/CLAUDE.md by `npx vigiles compile`. Edit THIS file, never the markdown.
import { file, instructionFile, prose } from "vigiles/spec";

export default instructionFile({
  sections: {
    "`fixtures/real-papers/`": prose`Papers written by other people, committed as LaTeX source and linted by the corpus test. Loaded
when working here; what each folder holds and how a paper is added is in ${file("fixtures/real-papers/README.md")}.`,

    "🔴 Licences — critical, read before adding, changing or moving a paper": prose`These papers are someone else's work, published in a public repository. A paper under the wrong
licence is a copyright breach that a revert does not undo: clones and forks keep it.

1. **Only CC BY 4.0, CC BY-SA 4.0 or CC0 1.0**, as arXiv's own record of the paper states it. Never
   arXiv's default licence ("non-exclusive licence to distribute"), never NC (non-commercial), never ND
   (no derivatives): our copies are changed, and ND forbids that. Anonymising a paper does not change
   its licence. Held by: the collector's \`LICENCES\` (${file("scripts/grow-real-papers/rules.ts")}), then
   ${file("fixtures/real-papers/balance.ts")} on the accepted papers' manifest and
   ${file("fixtures/arxiv-manifest.test.ts")} on the preprints'.
2. **Every paper credits its authors, links its source and its licence, and says what we changed**
   (renamed files, rewritten \`\\input\`s, figures dropped): its own \`README.md\`, which
   ${file("scripts/grow-real-papers/paper.ts")} writes. A paper added by hand gets the same lines.
3. **Never relicense.** The repository's MIT licence does not cover this folder (${file("LICENSE")} says
   so). A CC BY-SA paper, changed, stays CC BY-SA. Nothing here may imply its authors endorse paperlint.
4. **The npm package does not carry the corpus**: \`!fixtures/real-papers\` in \`package.json\` \`files\`.
   Keep it out.`,
  },
  rules: {},
});
