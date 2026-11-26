---
name: add-venue
description: Create or update a conference or workshop edition in paperlint. Use for venue presets and cards (presets/<series>-<year>.jsonc and .md), including verifying changed deadlines against the call for papers and submission portal. Record the source and date for each reading. For venue selection use find-venue; for submission use submit-paper.
allowed-tools: [Read, Write, Edit, Grep, Glob, Bash, WebFetch]
---

<!-- vigiles:sha256:9e5785b5dd9b565a compiled from .claude/skills/add-venue/SKILL.md.spec.ts -->

# add-venue — a call for papers becomes a preset and a card, with the proof beside every number

Done for `agent-2027`, `agentverify-2027` and `nlbse-2027`. A shipped venue is one edition, a pair,
`presets/<series>-<year>.jsonc` and `.md`; the series is lowercase, with no publisher or
parent-conference prefix. A venue of your own project, not shipped, is `./venues/<series>-<year>.jsonc` and `.md` (`docs/rules.md`, "Writing your
own venue preset"); steps 1 to 7 are the same.

For an existing edition, start with its preset and card. Recheck the affected facts using steps
2–5, update the card and preset together, and run the checks in step 9.

1. **Copy the closest pair.** `aidc-2026` for an IEEE workshop, `agenticdev-2026` for ACM. Read
   `presets/venue-profile.schema.json`: a key outside it fails the lint. The template family
   (`extends: paperlint:ieee-conference` or `acm-sigconf`) already holds page, columns and fonts.
2. **Fetch the call yourself**, and the venue's dates page. `WebFetch` summarizes: it said «not
   stated» about lines that were on the page, so also `curl` the raw HTML and read the text. Read the
   portal's own `/deadlines` page (HotCRP: `"sub":<unix>`, `"blind":true`). Note each URL and the day.
3. **A quote and a URL beside every number**, as a comment in the preset; the fetch day as `read` in
   `deadlines`. `at` is UTC: an AoE day ends at 11:59:59Z of the next day. The page limit says
   whether references count: «including references» is `pages_max`; a body limit is
   `body_pages_max` with `ref_pages_max` (pages, or `"unlimited"`), and the schema refuses one without it.
4. **Sources disagree: keep both.** An organizer's email beats a dates page, the portal beats the
   call. Quote each in the card with its source and date («organizers' email, 2026-10-23»); never
   pick silently.
5. **A fact you could not verify gets no key** in the preset. The card's «Not verified» section names
   it (remote presentation, an AI policy, an archival choice, a class line the call does not give).
6. **Write the card**: sources with the fetch day, the facts, the kinds table in the call's words,
   «Not verified». Leave the generated section empty between its `paperlint:preset-rules` markers and
   run `npx eslint --fix presets/`. Never edit between the markers; the fix also rewrites the family's
   card. One file per EDITION: `presets/<series>-<year>.jsonc` and `.md`, the year in four digits; a
   workshop is its own series (`nlbse-2027`, not `icse-nlbse`). `name` and `aliases` carry no year
   (`AGENT`, not `AGENT 2027`): the year is the id's. A workshop sets `"workshop": true` and
   `"parent": "paperlint:<conference>-<year>"` of its own year; a parent not shipped yet gets a
   minimal preset (name, aliases, url, the family its call names, no limits) whose card says only
   the format is checked. A conference also sets `"field"` (one of the schema's enum); a workshop
   takes its parent's. Then `npm run catalog` rewrites `presets/catalog.json`, which paperlint.dev
   reads.
7. **Register the name where shipped presets are listed**, or tests fail: its label and year in
   `test/shipped-venues.ts`, `src/presets.test.ts`, `src/preset-card-rule.test.ts`,
   `src/venue-rules.test.ts`, `src/paper-settings-commands.test.ts`, the count in
   `test/preset-cards.test.ts`, and its row in `docs/venues.md` (checked by
   `test/venues-doc.test.ts`). A venue records the call's `scope` (its scope sentences and topic
   list, verbatim, with the URL and the day); a call that states none puts the edition in
   `WITHOUT_SCOPE` in `src/presets-scope.test.ts`. Then `npx prettier --write` on what you wrote.
8. **A portal's form fields** (`"submission_fields"`): record them only from a logged-in read of
   the form, never from memory or from another venue's preset. Each field gets the kind that matches
   its control (`docs/submission.md` lists them: `checkbox`, `choice` for a dropdown or radio
   buttons, `checkboxes`, `integer`, `number`, `text`, `multiline_text`, `email`, `pc_conflicts`,
   `document`, `attachments`) and `"required": true` when the form marks it required; a choice
   lists its options spelled as the form spells them.
9. **Run**: `npx eslint presets/`, then `npx vitest run` on those files plus `scripts/refresh-deadlines`
   and `src/folder-venue-rule.test.ts`. `npm run refresh-deadlines -- --presets <copy of presets/>`
   shows whether the portal agrees with the preset; it also rewrites portal readings, so run it on a
   copy. Not the full `npm run check`.

Do not commit or push for the user. Report each venue's facts with source URLs, any disagreement,
the exit codes, and what stayed unverified.
