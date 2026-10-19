// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
import { experimental_skill } from "vigiles/spec";

export default experimental_skill({
  name: "submission-portal",
  description:
    "Create, read or change a paper's submission on the venue's HotCRP portal via `paperlint submission new|show|update`: register the paper, replace the PDF or abstract, mark it submitted, and verify by sha256 that the portal holds the latest build. Use when the paper is not yet on HotCRP, when its PDF or abstract there needs replacing, when asked whether it is truly submitted, or before a deadline. Composes with submit-paper (what to submit).",
  tools: ["Read", "Grep", "Glob", "Bash"],
  body: `
# submission-portal — create, read and update the submission on the portal, then prove it landed

\`paperlint submission\` talks to the venue's submission portal through its API. Only HotCRP is
supported; for any other portal the command says so and the upload is done by hand.

## What the API does, and what stays on the site

\`submission new\` CREATES the submission through HotCRP's API: \`POST /api/paper\` with \`p=new\`
(HotCRP's own documentation: «Setting \`p=new\` will create a new submission; the response will contain
the chosen submission ID»). It sends the title, the abstract, the authors and the PDF — nothing else.
**Done on the site, by the author:** PC conflicts, topics, and every field the venue adds (paper
type, artifact, consent boxes). The command prints that list with the submission's page after every
run; HotCRP's own complaints about a missing required field arrive as \`portal says:\` lines.

## Token

One variable per HotCRP site: \`HOTCRP_TOKEN_<first label of the host, upper-cased>\` (the last path
segment instead, for a site served under a path) —
\`HOTCRP_TOKEN_MSR2027\` for \`msr2027.hotcrp.com\`, \`HOTCRP_TOKEN_AIDC\` for \`aidc.submit.acsac.org\`. A
token works only on the site it was made on, so two venues take two variables. A plain
\`HOTCRP_TOKEN\` is NOT read: set alone, the command stops and says to rename it.

When the command reports a missing token, a refused one (HTTP 401 or 403) or the rename, **relay its
message to the author verbatim and stop.** The message already names the site's token page, the
scopes to tick and the variable to set. 🔴 Never ask for the token in chat, never print it, never
write it to a file: the author sets it in their own environment, and the command sends it only as
the \`Authorization\` header.

## What must be in place

- **The venue preset declares the portal**: \`"portal": { "kind": "hotcrp", "url": "<the site>" }\`
  (\`paperlint:aidc\` and \`paperlint:msr\` have it). For your own venue preset, add it there.
- **The site's token variable**, as above.
- **For \`new\`: the paper's \`paperlint.json\` declares the authors** — \`"authors": [{ "name": "…",
  "email": "…", "affiliation": "…" }]\`, every author in the paper's order, the email the portal knows
  each by. The author writes this list; never fill it in from the paper, a profile or memory.
- **For \`show\` and \`update\`: the paper's \`paperlint.json\` names its submission** —
  \`"submission": { "id": <number> }\` (in the open cycle, with \`cycles\`). \`new --save\` writes it.

A missing key stops the command with exit 2 and a line naming the file and key — fix exactly that
and run again.

## The procedure — always in this order

0. **Create it, once — only when the paper has no \`submission\` id.** Build first
   (\`npx paperlint build papers/<paper>\`): the abstract is read from that build's PDF text.
   \`npx paperlint submission new papers/<paper>\` is a DRY RUN (\`dry_run=1\`): it prints the title,
   the authors and the whole abstract it would send, then HotCRP's verdict, and keeps nothing. Read
   them with the author; an abstract paperlint cannot delimit, or one that reads wrong, is given as a
   plain-text file with \`--abstract <file>\`. Then ask for an explicit yes, and only after it run
   \`npx paperlint submission new papers/<paper> --save\`. 🔴 \`--save\` CREATES A REAL SUBMISSION:
   never without the author's yes in this conversation, never "to test". The new id is written into
   \`paperlint.json\`; then do the "on the site" list with the author.
1. **Read it.** \`npx paperlint submission show papers/<paper>\` — status, title, type, topics,
   abstract length, the PDF the portal holds, and \`match\`: whether that PDF's sha256 equals the
   local \`paper.pdf\`. Rebuild first if the local PDF is stale.
2. **Dry run.** \`npx paperlint submission update papers/<paper>\` — sends the PDF (add
   \`--abstract <file>\` for a plain-text abstract, \`--submit\` to mark it submitted) with HotCRP's
   \`dry_run=1\`: the portal checks the change and **keeps nothing**. Read \`valid\`, \`changes\` and every
   \`portal says:\` line. Exit 1 means the portal would refuse it — report why, do not go on.
3. **Ask the author.** Show the dry run's output and ask for an explicit yes to change the real
   submission.
4. **Save — only after that yes.** \`npx paperlint submission update papers/<paper> --save\` (same
   flags as the dry run). 🔴 \`--save\` CHANGES A REAL SUBMISSION that reviewers will see. Never run it
   without the author's explicit yes in this conversation, never "to test", and never because a
   dry run was valid.
5. **Prove it landed.** \`npx paperlint submission show papers/<paper>\` again: \`match\` must read
   \`yes — the portal holds this build\`, and the status must be what was intended (\`submitted\` if
   \`--submit\` was sent). Anything else is not done — say so.

The same steps as commands, in order (\`<paper>\` is the paper's folder):

\`\`\`bash
npx paperlint build papers/<paper>
# only while the paper has no submission id:
npx paperlint submission new papers/<paper>
# … the author reads the dry run and says yes …
npx paperlint submission new papers/<paper> --save
npx paperlint submission show papers/<paper>
npx paperlint submission update papers/<paper> --submit
# … the author reads the dry run and says yes …
npx paperlint submission update papers/<paper> --submit --save
npx paperlint submission show papers/<paper>
\`\`\`

## Reading the answers

- \`match yes\` is the only proof the reviewers get the local build; a status of \`submitted\` alone
  says nothing about WHICH PDF.
- \`the portal refused (HTTP 401): …\` followed by \`<variable> was used; …\` — the token is from
  another site, revoked or expired; \`403\` — the token lacks the scope, or the deadline has passed for
  this change. The text after the colon is HotCRP's own; quote it, and relay the steps under it.
- \`SAVE WITHHELD by the portal\` or \`NOTHING CREATED\` — HotCRP did not save; nothing changed.

## What this skill does not do

It does not decide whether the paper is ready (that is \`harden-paper\`), anonymize it, or set the
portal's other fields (conflicts, topics) — see \`submit-paper\`.`,
});
