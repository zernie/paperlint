// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
import { experimental_skill } from "vigiles/spec";

export default experimental_skill({
  name: "submission-portal",
  description:
    "Create, read or change a paper's submission on the venue's HotCRP portal via `paperlint submission new|show|update|topics`: register the paper, choose its topics and PC conflicts, replace the PDF or abstract, mark it submitted, and verify by sha256 that the portal holds the latest build. Use when the paper is not yet on HotCRP, when its topics or conflicts are unset, when its PDF or abstract there needs replacing, when asked whether it is truly submitted, or before a deadline. Composes with submit-paper (what to submit).",
  tools: ["Read", "Grep", "Glob", "Bash", "Edit", "AskUserQuestion"],
  // The `npx paperlint submission …` commands in the body are not verified at compile time until
  // zernie/vigiles#395 (cmd() for the package's own CLI): keep them in step with src/cli.ts by hand.
  // Do not re-add a test that re-parses the compiled SKILL.md — that check belongs in vigiles.
  body: `
# submission-portal — create, read and update the submission on the portal, then prove it landed

\`paperlint submission\` creates, reads and updates the paper's submission on the venue's portal.
Only HotCRP is supported; for any other portal the command says so and the upload is done by hand.

## What the command does, and what stays on the site

\`submission new\` creates the submission with the title, the abstract, the authors and the PDF;
\`new\` and \`update\` also send the paper's \`"fields"\` — its answers to the venue's own form
fields (topics, PC conflicts, a corresponding author …), which the venue preset records in
\`"submission_fields"\` (\`paperlint:msr\` does). A value the form does not offer is refused before
anything is sent; a topic the portal did not take prints \`NOT TAKEN\` and fails the command. What
the preset records no field for stays on the site: the command prints that list, with the
submission's page, after \`new\`.

## Token

One variable per site: \`HOTCRP_TOKEN_MSR2027\` for \`msr2027.hotcrp.com\`; for a site not on
hotcrp.com, its whole host (with a port other than the default) and path. A plain \`HOTCRP_TOKEN\` is not read. When the command reports
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
- **\`"fields"\` in the paper's \`paperlint.json\`**, keyed as the preset's \`"submission_fields"\`
  names them: \`{ "topics": ["<an option, spelled as listed>"], "pc_conflicts": { "<pc email>":
  "<conflict type>" }, "ACMCorAut": "<an author's email>" }\`. Written only with the author's
  choices, below.

A missing key or token stops the command with exit 2 and a line naming what to set — fix exactly that.

## The procedure — always in this order

\`papers/my-paper\` stands for the paper's folder.

0. **Topics, chosen with the author.** \`npx paperlint submission topics papers/my-paper\` reads the
   topics the portal offers and marks each against the preset (exit 1 when they differ — then the
   preset is stale: say so, and record the portal's list). Read the paper's abstract and
   contribution, pick the topics that fit, and **ask with \`AskUserQuestion\`** (\`multiSelect: true\`,
   your proposed topics first, each with one line on why it fits; the author may pick others).
   Write only the chosen ones into \`"fields": { "topics": [...] }\`, spelled exactly as listed.
   The same for every other field the preset records (\`ACMCorAut\`: ask which author).
1. **Create it, once — only while the paper has no \`submission\` id.**
   \`npx paperlint submission new papers/my-paper\` is a dry run: the portal checks it and keeps
   nothing. It prints the title, the authors, the whole abstract (read from the source's
   \`\\begin{abstract}\`) and each \`field\` it sends. Read them with the author; an abstract the
   command cannot read, or one that reads wrong, is given as a plain-text file with
   \`--abstract <file>\`.
2. **Send it.** Show the author the dry run's venue check (its lint findings, or "venue rules: no
   errors") and what goes (title, authors, abstract, each field), then run
   \`npx paperlint submission new papers/my-paper --save\` — the \`submission-confirm\` hook makes
   Claude Code ask the author before it runs. Then the printed "still to do" list with the author.
3. **Read it.** \`npx paperlint submission show papers/my-paper\` — status, the PDF the portal holds,
   and \`match\`: whether it is the local build. Rebuild first if the local PDF is stale.
4. **Dry run the change.** \`npx paperlint submission update papers/my-paper\` (\`--abstract <file>\`,
   \`--submit\` to mark it submitted); it sends the paper's \`"fields"\` too. Exit 1 means the portal
   would refuse it, or did not take a topic — report why, stop.
5. **Send it.** Show the author the dry run's venue check and what changes, then run the same
   command with \`--save\`; the \`submission-confirm\` hook makes Claude Code ask the author before
   any send. A refusal (exit 2) means the last build is not of this PDF: rebuild, dry run again.
6. **Prove it landed.** \`show\` again: \`match\` must read \`yes — the portal holds this build\`, and
   the status must be what was intended. Anything else is not done — say so.

🔴 \`--save\` creates or changes a real submission that reviewers will see: never without the
author's own yes to the permission prompt, never "to test", never because a dry run passed.

\`\`\`bash
npx paperlint build papers/my-paper
npx paperlint submission topics papers/my-paper
# … AskUserQuestion: which topics; the chosen ones into "fields" …
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
- \`portal says: pc_conflicts: You may have missed conflicts of interest with …\` — HotCRP guesses
  these from the authors' and the PC's profiles, chiefly an affiliation string they share (two
  "Independent Researcher"s are flagged though they are strangers). Show each name to the author with
  that explanation and ask; **never** mark a conflict from the warning alone. A real conflict goes
  into \`"fields": { "pc_conflicts": { "<their email>": "<type>" } }\` with the author's word.
- \`NOT TAKEN\` — the portal kept none of that field's options: the spelling is not the portal's.
  Run \`submission topics\` and fix the value.
- \`SAVE WITHHELD\` or \`NOTHING CREATED\` — the portal saved nothing.

## What this skill does not do

It does not decide whether the paper is ready (\`harden-paper\`), anonymize it, or set the fields the
venue preset does not record — see \`submit-paper\`.`,
});
