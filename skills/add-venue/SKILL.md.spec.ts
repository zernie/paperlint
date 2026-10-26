// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
import { experimental_skill } from "vigiles/spec";

export default experimental_skill({
  name: "add-venue",
  description:
    "Add a venue paperlint does not ship: turn a conference or workshop call for papers into a venue preset (presets/<name>.jsonc) and its card (presets/<name>.md), every number with its quote and URL. Use when asked to add a venue, write a preset or a card for a conference or workshop, or turn a call for papers into a preset. NOT for choosing which venue to submit to (find-venue), NOT for submitting (submit-paper, submission-portal).",
  tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash", "WebFetch"],
  body: `
# add-venue — a call for papers becomes a preset and a card, with the proof beside every number

Done for \`agent\`, \`agentverify\` and \`nlbse\`. A shipped venue is a pair, \`presets/<name>.jsonc\` and
\`presets/<name>.md\`; the name is lowercase, with no publisher or parent-conference prefix. A venue of
your own project, not shipped, is \`./venues/<name>.jsonc\` and \`.md\` (\`docs/rules.md\`, "Writing your
own venue preset"); steps 1 to 7 are the same.

1. **Copy the closest pair.** \`aidc\` for an IEEE workshop, \`agenticdev\` for ACM. Read
   \`presets/venue-profile.schema.json\`: a key outside it fails the lint. The template family
   (\`extends: paperlint:ieee-conference\` or \`acm-sigconf\`) already holds page, columns and fonts.
2. **Fetch the call yourself**, and the venue's dates page. \`WebFetch\` summarizes: it said «not
   stated» about lines that were on the page, so also \`curl\` the raw HTML and read the text. Read the
   portal's own \`/deadlines\` page (HotCRP: \`"sub":<unix>\`, \`"blind":true\`). Note each URL and the day.
3. **A quote and a URL beside every number**, as a comment in the preset; the fetch day as \`read\` in
   \`deadlines\`. \`at\` is UTC: an AoE day ends at 11:59:59Z of the next day. The page limit says
   whether references count; no key gates a total, so say in the card what the rule cannot catch.
4. **Sources disagree: keep both.** An organizer's email beats a dates page, the portal beats the
   call. Quote each in the card with its source and date («organizers' email, 2026-10-23»); never
   pick silently.
5. **A fact you could not verify gets no key** in the preset. The card's «Not verified» section names
   it (remote presentation, an AI policy, an archival choice, a class line the call does not give).
6. **Write the card**: sources with the fetch day, the facts, the kinds table in the call's words,
   «Not verified». Leave the generated section empty between its \`paperlint:preset-rules\` markers and
   run \`npx eslint --fix presets/\`. Never edit between the markers; the fix also rewrites the family's
   card. A venue name that is an ordinary word is not the bare word (\`AGENT 2027\`, alias \`AGENT'27\`):
   folder names are matched by words, and \`mentions: "with-year"\` reaches only the text rules.
7. **Register the name where shipped presets are listed**, or tests fail: \`src/presets.test.ts\`,
   \`src/preset-card-rule.test.ts\`, \`src/tex-venue-rules.test.ts\`, \`src/venue-rules.test.ts\`,
   \`src/paper-settings-commands.test.ts\`, the count in \`test/preset-cards.test.ts\`. Then
   \`npx prettier --write\` on what you wrote.
8. **Run**: \`npx eslint presets/\`, then \`npx vitest run\` on those files plus \`scripts/refresh-deadlines\`
   and \`src/folder-venue-rule.test.ts\`. \`npm run refresh-deadlines -- --presets <copy of presets/>\`
   shows whether the portal agrees with the preset; it also rewrites portal readings, so run it on a
   copy. Not the full \`npm run check\`.

Do not commit or push for the user. Report each venue's facts with source URLs, any disagreement,
the exit codes, and what stayed unverified.
`,
});
