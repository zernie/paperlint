// Compiled to SKILL.md by `vigiles compile`. Edit THIS file, never the markdown.
import { experimental_skill } from "vigiles/spec";
import { COMMANDS } from "./scripts/label-page-commands.ts";

export default experimental_skill({
  name: "build-label-page",
  description:
    'Build a phone labelling page published as a claude.ai Artifact with a shared answer store, and export the answers into the paper\'s study folder. Use when a study needs a person to label items (gold labels, a blind review of model outputs, "is this a real boundary case"), or on "a page to label these", "a gold-labelling page", "a blind review page". Carries the eight rules that keep such a page honest, the last one a check that the labeller understands each question before the real items. Composes with build-benchmark and draft-paper.',
  tools: [
    "Read",
    "Write",
    "Edit",
    "Grep",
    "Glob",
    "Bash",
    "Artifact",
    "ArtifactData",
  ],
  body: `
# build-label-page — a page the person labels on a phone, and the labels back in the repo

When a study needs a person to decide something about each of many items, a chat thread is the wrong
tool: it loses answers, shows the model's own output next to the question and gives no count of what
is left. Build a page instead. The agent generates it from the items, publishes it as an Artifact with
a shared answer store (the \`db\` capability), the person answers on a phone, and the agent exports the
answers into the study's \`data/\` folder. The labels are data the paper's numbers trace to, so they are
committed, not left in the store.

**Not for** an LLM judge (no person answers), a questionnaire about the person, or a form that collects
anything but labels.

## Which page you need

| the labeller… | page |
| --- | --- |
| looks at one item and picks from a closed list: gold labels, a blind review of model outputs, fits / text silent / contradicts, an approval (keep / drop, and why), with an optional reason box and code blocks | **the generator** of this skill |
| compares two outputs side by side, ranks several items, marks parts (spans) of a text — a recall audit, reading a whole file and marking every rule in it —, gives a number on a slider, or writes free text | **written by the agent** |

- **The generator** is \`scripts/label-page.js\`, run from the skill (commands in the procedure):
  a core with no page layout (\`label-page-core.ts\`: the \`items.json\` checks, the leak guard, the
  neutral ids, the key, the export) and the one closed-choice page built from the core's payload
  (\`label-page-html.ts\`). How to write its \`items.json\` — examples, practice, \`ask_why\`, the
  approval page — is
  [\`references/closed-choice-generator.md\`](references/closed-choice-generator.md).
- **A page written by the agent** meets the same eight rules, and each rule's **Check** line in
  [\`references/checklist.md\`](references/checklist.md) is its acceptance list: every one verified,
  and stated in the hand-over, before the link is sent. It also looks the way the generator's pages
  look: one dark palette, one column, answer buttons as full-width rows with space between them,
  icons rather than coloured side stripes, code shown as code with its whitespace visible, built for
  a phone first, and screenshotted at 400px and 1280px wide and looked at before publishing.
  It can still take its blindness and its export from the core: \`prepareBuild\` checks
  \`items.json\`, gives the items their neutral ids, writes \`key.json\` and returns the blind
  payload to lay out, and \`export\` reads any store that keeps the generator's collections.
- A second generator, for another page shape, is added only after that shape has been built by
  hand, following the eight rules, twice without its fields changing. Until then the agent writes
  such a page itself.
- The other ways to build pages that were considered (a JS kit plus an automatic page check; rules
  only; one growing generator), and when to switch: #335.

## The eight rules

They hold for every labelling page, generated or written by hand. The full text, each with its
reason and its check, is [\`references/checklist.md\`](references/checklist.md). Read it before
building. In one line each:

1. **Test it in the claude.ai phone viewer before sending the link.** The viewer can size the frame to
   the page, so the page cannot scroll itself and a fixed toast may be off-screen. A plain browser
   passing proves nothing about this.
2. **Navigation never relies on in-page scrolling or toasts.** "Next unanswered" is a filter: it hides
   every finished item and group, and a note at the top lists what is left and what each still needs.
3. **An item is done only when every question on it is answered.** The card asks the missing
   question; the progress counter counts complete items only.
4. **Blind.** Neutral ids (\`G001\`…), order shuffled with a fixed seed, no model answers, verdicts or
   source labels on the page. The generator refuses to build when an item carries a field outside an
   allow-list; a page written by hand checks its items against the same list.
5. **Ask only what the labeller can answer.** Only the languages and tools they know; one "how well do
   you know it" question per group when the study filters on it (\`"familiarity": true\`; left
   out, none is asked, as on an approval page, whose author has not seen those repositories); "clear-cut or real boundary"
   is the labeller's judgement, not the designer's.
6. **Export into the repository right away**, one JSON per page into the study's \`data/\` with the
   export date, commit it, and record answers given in chat with \`source: "chat"\`. If the page fails,
   take the last answers in chat; patch the page blind at most once.
7. **Save on click**, no submit button; "Saved <time>" on every card; survive a reload; render
   readable, with a banner, when the store is unavailable.
8. **The labeller understands each question first.** Every answer option carries one real example,
   shown on the first screen; 3 or more practice items with known answers come before the real
   items, and the page shows the expected answer after each; one question per screen. A practice
   miss means the question is reworded and the practice taken again; practice answers never reach
   the labels. A miss leaves the real items open, unless \`items.json\` sets
   \`"practice_gate": "matched"\`: then they stay closed until every practice item of the current
   \`practice_round\` is answered as expected the first time.

## Procedure

1. **Decide the labelling and the page.** What exactly does the labeller decide per item (the
   questions, each with its answers)? Which page that takes (the table above)? Which groups
   (languages, tools) does the labeller know? How many items fit the time they have on a phone? Who
   is the labeller: a page with a store opens only for people with access to the artifact, so the
   labeller is the owner or has been shared as a Contributor. If the study design is not written
   yet, \`build-benchmark\` comes first. If the items come from a drawn sample, the study's
   \`plan.json\` declares the population and its draw before the sample is frozen, and its
   \`author_check\` records that the author has been shown the drawn **units** (the rules or cases,
   not the items) — on an approval page, not on the labelling page, where items made from easy units
   each look fine on their own.
2. **Make the study folder.** \`<paper-dir>/repro/<id>-<slug>/\`, made by \`npx paperlint studies new
   <paper-dir> "Gold labels" --kind data\` when the labelling is a study of its own: the command
   writes its \`README.md\`, its \`plan.json\` and its row in \`repro/studies.json\`, and
   \`repro/study-registered\` checks them; fill the plan before the first label. When the labels are
   in, update the row (\`status\`, \`result\`, \`result_file\`) and run \`npx paperlint studies index
   <paper-dir>\`. Where this sits in stage 3: \`docs/layout.md\` in the paperlint package.
3. **Build the page.** With the generator, write \`items.json\`
   ([\`references/closed-choice-generator.md\`](references/closed-choice-generator.md)) and, from the
   study folder:

   \`\`\`bash
   node \${CLAUDE_SKILL_DIR}/scripts/label-page.js ${COMMANDS.build} items.json label-page
   \`\`\`

   It writes \`label-page/page.html\` and \`label-page/key.json\` (the only link from \`G001\` to the
   source id; it never goes on the page). \`kind\` (\`approval\`, \`witness\`, \`labels\`) is required,
   and each kind requires its card fields on every item and practice card. Any card may also carry
   the generic content blocks (a code excerpt with a marked line, a note under it and an extra
   gutter column; the words asked about as a quote; tap-to-see notes on its terms; a sub-line under
   each answer; references, a list, a table, none of them folded), every word on them from
   \`items.json\`, with the question right under the excerpt. \`"preset":
   "linter-config-witness"\` is a narrow preset for comparing linter configs; the blocks underneath
   are generic. Written by hand, the page meets the requirements above.
4. **Read it as the labeller, then look at it.** Read the page text once as a person who knows
   nothing about the source: if anything on it tells the answer, take it out. Read each question as
   someone who did not design the study: can they tell what each answer means from the question, its
   examples and nothing else? If not, reword. Then screenshot it at 400px and at 1280px wide with the
   pre-installed Chromium (Playwright), once before any answer and once after the practice, open both
   images, and fix what they show. A page that only passed its tests has not been seen.
5. **Publish.** Load \`artifact-design\` and \`artifact-capabilities\`, then publish \`page.html\` with
   \`capabilities: {db: {}}\`. Use a title of two to four words. Do not ask the page for \`user\` or
   anything else it does not use.
6. **Test in the viewer (rule 1)** and list the store once with \`ArtifactData\` (\`list\` of
   \`answers\`) to confirm the test answer arrived. \`ArtifactData\` can be a deferred tool: load it with
   \`ToolSearch\` first. Then delete the test answer's document, or tell the person which one it is
   and keep it out of the export.
7. **Send the link** with one line on how it works: start with the practice; tap an answer, it saves;
   "Next unanswered" shows what is left. Say what you tested and what you could not. **Check the
   practice before the real answers count** (rule 8): list the store's \`practice\` collection. A
   miss means a question was unclear: ask the labeller which one and why, reword it and its
   examples, rebuild, republish, and have them take the practice again. Write one line per round in
   the study's README: what was reworded and why.
8. **Export when the person is done, or stops** (rule 6). Save the store's collections as
   \`dump.json\` (answers given in chat go in with \`"source": "chat"\`). With the generator:

   \`\`\`bash
   node \${CLAUDE_SKILL_DIR}/scripts/label-page.js ${COMMANDS.export} dump.json label-page/key.json data
   \`\`\`

   It writes \`data/<study>-labels-<date>.json\`, scores the practice into
   \`data/<study>-practice-r<round>-<date>.json\` beside it, and prints every item it could not count. A page
   written by hand exports to the same two files, practice kept out of the labels. Commit both in the
   same pass, and add the line "labels → \`data/<study>-labels-<date>.json\`" to the paper's
   \`NOTES.md\` for the numbers that use them.

## Two answerers, and a time on screen

Two optional top-level keys of \`items.json\`, both left out by default:

- \`"answerers": ["author", "second"]\` — two or more people answer the same published page, each
  under their own name (picked on the page) and without seeing the other's answers; an item's own
  \`answerers\` shows it to that subset only. The store's ids become \`<answerer>~<id>\`, and the
  labels file keeps each answerer's answers under \`by_answerer\`.
- \`"min_seconds": 30\` — a card's answer saves only after the card has been on screen that long;
  the seconds at its first save are stored and exported as \`seconds\`.

Details and the export's shape: [\`references/closed-choice-generator.md\`](references/closed-choice-generator.md),
"Two answerers, and a minimum time on screen".

## A second language

A labeller who reads another language better gets the page's own words in it: \`"translations": {"ru":
{…}}\` (and \`"lang"\`, the page's own, \`en\` by default) adds a switch under the title. The questions,
answers, examples, reason prompts, intro and labels change; the quote, the code and every note never
do, because those words are what is judged. The build refuses a translation that leaves out or
invents a question or an answer; the ids and \`key.json\` are the same with or without it.
[\`references/closed-choice-generator.md\`](references/closed-choice-generator.md), "A second
language for the page's own words".

## A source tag above each block

When the labeller must tell where a block's text came from (copied from a repository, written by the
model under test, restated by an earlier labelling model, counted by the script), the page's
\`"sources": {"repo": "From the repository", …}\` names the tags, in colour order (at most five), and
\`from\` on a \`quote\`, a \`situation\` (its summary) or an \`excerpt\` (\`caption_from\` for its caption,
\`annotation_from\` for its annotation, tagged inside the annotation's box) puts one above that block. The build refuses an unknown id, a dead entry and a tag over a text the card
lacks. [\`references/closed-choice-generator.md\`](references/closed-choice-generator.md), "A source tag
above each block".

## When the page misbehaves

Look at what the store holds (\`ArtifactData\` \`list\`) before changing anything: the page may be fine
and the person may have opened it without access. One fix to the page is allowed. If it fails again,
ask for the remaining answers in chat, write them into the dump with \`"source": "chat"\`, and export.
Do not iterate on a page you cannot see.

## Compose with

- **build-benchmark** — owns the study design and the inter-rater rule: agreement with the person who
  wrote the codebook measures trainability, not reliability, so the labeller for gold labels is
  someone who did not write the scheme.
- **label-agent-runs** — when the items are the runs of an agent grid: the codebook, which runs need
  a hand label, the second rater and the label file this page's answers go into.
- **draft-paper** — the exported labels, the familiarity filter and the complete-item count feed the
  Methods and the threats.
- **submit-paper** — a published artifact page is not anonymous. Do not link it from an anonymized
  submission; the exported JSON is what goes into the reproduction artifact.`,
});
