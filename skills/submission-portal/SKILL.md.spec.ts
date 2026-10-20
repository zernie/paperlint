// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
import { experimental_skill } from "vigiles/spec";

export default experimental_skill({
  name: "submission-portal",
  description:
    "Create, read or change a paper's submission on the venue's HotCRP portal via `paperlint submission new|show|update`: register the paper, replace the PDF or abstract, mark it submitted, and verify by sha256 that the portal holds the latest build. Use when the paper is not yet on HotCRP, when its PDF or abstract there needs replacing, when asked whether it is truly submitted, or before a deadline. Composes with submit-paper (what to submit).",
  tools: ["Read", "Grep", "Glob", "Bash"],
  // The `npx paperlint submission …` commands in the body are not verified at compile time until
  // zernie/vigiles#395 (cmd() for the package's own CLI): keep them in step with src/cli.ts by hand.
  // Do not re-add a test that re-parses the compiled SKILL.md — that check belongs in vigiles.
  body: `
# submission-portal — create, read and update the submission on the portal, then prove it landed

\`paperlint submission\` creates, reads and updates the paper's submission on the venue's portal.
Only HotCRP is supported; for any other portal the command says so and the upload is done by hand.

## What the command does, and what stays on the site

\`submission new\` creates the submission with the title, the abstract, the authors and the PDF.
Everything else — conflicts, topics, the venue's own fields — is done on the site by the author: the
command prints that list, with the submission's page, after every run.

## Token

One variable per site: \`HOTCRP_TOKEN_MSR2027\` for \`msr2027.hotcrp.com\`; for a site not on
hotcrp.com, its whole host and path. A plain \`HOTCRP_TOKEN\` is not read. When the command reports
a missing, misnamed or refused token, **relay its message to the author verbatim and stop**: it
already says where on the site to make one, which permissions to tick, and which variable to set.
🔴 Never ask for the token in chat, never print it, never write it to a file — the author sets it in
their own environment.

## What must be in place

- **The venue preset declares the portal**: \`"portal": { "kind": "hotcrp", "url": "<the site>" }\`
  (\`paperlint:aidc\` and \`paperlint:msr\` have it).
- **For \`new\`: \`"authors"\` in the paper's \`paperlint.json\`** — \`[{ "name", "email",
  "affiliation" }]\`, every author in the paper's order. The author writes this list; never fill it
  in from the paper, a profile or memory.
- **For \`show\` and \`update\`: \`"submission": { "id": <number> }\`** — \`new --save\` writes it.

A missing key or token stops the command with exit 2 and a line naming what to set — fix exactly that.

## The procedure — always in this order

\`papers/my-paper\` stands for the paper's folder.

0. **Create it, once — only while the paper has no \`submission\` id.**
   \`npx paperlint submission new papers/my-paper\` is a dry run: the portal checks it and keeps
   nothing. It prints the title, the authors and the whole abstract (read from the source's
   \`\\begin{abstract}\`). Read them with the author; an abstract the command cannot read, or one
   that reads wrong, is given as a plain-text file with \`--abstract <file>\`.
1. **Ask the author** for an explicit yes, then \`npx paperlint submission new papers/my-paper --save\`,
   and do the printed "on the site" list with the author.
2. **Read it.** \`npx paperlint submission show papers/my-paper\` — status, the PDF the portal holds,
   and \`match\`: whether it is the local build. Rebuild first if the local PDF is stale.
3. **Dry run the change.** \`npx paperlint submission update papers/my-paper\` (\`--abstract <file>\`,
   \`--submit\` to mark it submitted). Exit 1 means the portal would refuse it — report why, stop.
4. **Ask the author** for an explicit yes, then the same command with \`--save\`.
5. **Prove it landed.** \`show\` again: \`match\` must read \`yes — the portal holds this build\`, and
   the status must be what was intended. Anything else is not done — say so.

🔴 \`--save\` creates or changes a real submission that reviewers will see: never without the
author's yes in this conversation, never "to test", never because a dry run passed.

\`\`\`bash
npx paperlint build papers/my-paper
# only while the paper has no submission id:
npx paperlint submission new papers/my-paper
# … the author reads the dry run and says yes …
npx paperlint submission new papers/my-paper --save
npx paperlint submission show papers/my-paper
npx paperlint submission update papers/my-paper --submit
# … the author reads the dry run and says yes …
npx paperlint submission update papers/my-paper --submit --save
npx paperlint submission show papers/my-paper
\`\`\`

## Reading the answers

- \`match yes\` is the only proof the reviewers get the local build; \`submitted\` alone says nothing
  about WHICH PDF.
- \`portal says: …\` lines are the portal's own words; quote them.
- \`SAVE WITHHELD\` or \`NOTHING CREATED\` — the portal saved nothing.

## What this skill does not do

It does not decide whether the paper is ready (\`harden-paper\`), anonymize it, or set the portal's
other fields — see \`submit-paper\`.`,
});
