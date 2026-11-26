// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
import { experimental_skill } from "vigiles/spec";

export default experimental_skill({
  name: "grow-real-papers",
  description:
    "Grow the real-papers test corpus (fixtures/real-papers/accepted) by running the collector, scripts/grow-real-papers/main.ts. Use on 'grow the corpus', 'add more real papers', 'raise the quotas', or to resume a collector run that stopped. Not for adding one paper by hand or for venue presets (add-venue).",
  tools: ["Read", "Edit", "Bash"],
  body: `
# grow-real-papers: raise the quotas, run the collector, check the result

The collector does the mechanical work and prints what to do next: follow its last line.
The rules a staged paper must meet are in \`fixtures/real-papers/accepted/README.md\`; this
skill does not restate them.

1. **See where the corpus stands**: \`node scripts/grow-real-papers/main.ts --summary\`. It
   prints each field's total against its quota and each venue edition against its cap, from
   the manifest and the probe log, with no network.
2. **Choose the new quotas** in \`fixtures/real-papers/accepted/sampling/queries.json\`. This is
   the one judgement here, and it is the author's: propose the numbers and ask. A field can
   never pass its slots × 5 (five papers per edition), so a quota near that ceiling will come
   up short; say which. Commit the file before the run: \`--write\` refuses an uncommitted one.
3. **Run in the background**:
   \`node scripts/grow-real-papers/main.ts --minutes 150 --write fixtures\`. arXiv asks for a
   pause between requests, so a run takes an hour or more. A run that prints
   \`not finished\` exits 1: rerun the same command and it resumes from the log.
4. **Run the command its last line names** (the balance and input tests), then
   \`npx vitest run scripts/grow-real-papers\`.
5. **Ship one PR** with the quotas, the staged papers, the manifest and the log. Its
   description gives the corpus size before and after and the \`--summary\` table. The
   title starts with \`test:\`, because fixtures are not released.
`,
});
