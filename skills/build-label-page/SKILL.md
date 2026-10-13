---
name: build-label-page
description: Build a phone labelling page published as a claude.ai Artifact with a shared answer store, and export the answers into the paper's study folder. Use when a study needs a person to label items (gold labels, a blind review of model outputs, "is this a real boundary case"), or on "a page to label these", "a gold-labelling page", "a blind review page". Carries the seven rules that keep such a page honest. Composes with build-benchmark and draft-paper.
allowed-tools: [Read, Write, Edit, Grep, Glob, Bash, Artifact, ArtifactData]
---

<!-- vigiles:sha256:894d8a2df3f5c319 compiled from skills/build-label-page/SKILL.md.spec.ts -->

# build-label-page — a page the person labels on a phone, and the labels back in the repo

When a study needs a person to decide something about each of many items, a chat thread is the wrong
tool: it loses answers, shows the model's own output next to the question and gives no count of what
is left. Build a page instead. The agent generates it from the items, publishes it as an Artifact with
a shared answer store (the `db` capability), the person answers on a phone, and the agent exports the
answers into the study's `data/` folder. The labels are data the paper's numbers trace to, so they are
committed, not left in the store.

**Not for** an LLM judge (no person answers), a questionnaire about the person, or a form that collects
anything but labels.

## The seven rules

The full text, each with its reason and its check, is
[`references/checklist.md`](references/checklist.md). Read it before building. In one line each:

1. **Test it in the claude.ai phone viewer before sending the link.** The viewer can size the frame to
   the page, so the page cannot scroll itself and a fixed toast may be off-screen. A plain browser
   passing proves nothing about this.
2. **Navigation never relies on in-page scrolling or toasts.** "Next unanswered" is a filter: it hides
   every finished item and group, and a note at the top lists what is left and what each still needs.
3. **An item is done only when every question on it is answered.** The card names the missing
   question; the progress counter counts complete items only.
4. **Blind.** Neutral ids (`G001`…), order shuffled with a fixed seed, no model answers, verdicts or
   source labels on the page. The generator refuses to build when an item carries a field outside an
   allow-list; new question wording is added to the allow-list on purpose.
5. **Ask only what the labeller can answer.** Only the languages and tools they know; one "how well do
   you know it" question per group, used later as an analysis filter; "clear-cut or real boundary"
   is the labeller's judgement, not the designer's.
6. **Export into the repository right away**, one JSON per page into the study's `data/` with the
   export date, commit it, and record answers given in chat with `source: "chat"`. If the page fails,
   take the last answers in chat; patch the page blind at most once.
7. **Save on click**, no submit button; "Saved <time>" on every card; survive a reload; render
   readable, with a banner, when the store is unavailable.

## Procedure

1. **Decide the labelling.** What exactly does the labeller decide per item (the questions, each with
   a closed set of answers)? Which groups (languages, tools) does the labeller know? How many items
   fit the time they have on a phone? Who is the labeller: a page with a store opens only for people
   with access to the artifact, so the labeller is the owner or has been shared as a Contributor.
   If the study design is not written yet, `build-benchmark` comes first.
   If the items come from a drawn sample, the study's `prereg.json` declares the population, the
   screens and the coverage before the sample is frozen (the experimental rule `study/declare-sample` checks it, off by default), and the
   author has been shown the drawn **units** (the rules or cases, not the items) with "is this what
   you meet in practice?". The labelling page is not that check: items made from easy units each look
   fine on their own.
2. **Copy the generator into the study and write the items.** The study folder is
   `<paper-dir>/repro/<slug>-YYYY-MM-DD/` (`gold-labels-2026-10-12`; `repro/allowed-files-only` wants the
   date, a `README.md` in it saying what the study asks, and a line in `repro/README.md`; where this
   sits in stage 3, and what checks each place: `docs/layout.md` in the paperlint package).
   `items.json` follows the header of the generator. Source ids in `items.json` are the study's own;
   the page never shows them.

   ```bash
   cp ${CLAUDE_SKILL_DIR}/references/example-generator.py <study-dir>/make_label_page.py
   ```

   The generator is a template: change the questions and keep the guards (allow-list, neutral ids,
   store-unavailable banner, filter instead of scrolling). Do not loosen the allow-list to make a
   build pass; take the field out of the item.
3. **Build and read it as the labeller.** From the study folder (`<study-dir>`):

   ```bash
   python3 make_label_page.py build items.json label-page
   ```

   This writes `label-page/page.html` and `label-page/key.json` (the only link from `G001` to the
   source id; it never goes on the page). Rebuilding with the same seed keeps every id, and a new item
   gets the next one. Read the page text once as a person who knows nothing about the source: if
   anything on it tells the answer, take it out of the item.
4. **Publish.** Load `artifact-design` and `artifact-capabilities`, then publish `page.html` with
   `capabilities: {db: {}}`. Use a title of two to four words. Do not ask the page for `user` or
   anything else it does not use.
5. **Test in the viewer (rule 1)** and list the store once with `ArtifactData` (`list` of
   `answers`) to confirm the test answer arrived. `ArtifactData` can be a deferred tool: load it with
   `ToolSearch` first. Then delete the test answer's document, or tell the person which one it is
   and keep it out of the export.
6. **Send the link** with one line on how it works: tap an answer, it saves; "Next unanswered" shows
   what is left. Say what you tested and what you could not.
7. **Export when the person is done, or stops** (rule 6). Save the store's two collections, `answers`
   and `groups`, as `dump.json` in the shape the generator's header gives (answers given in chat go
   in with `"source": "chat"`), then:

   ```bash
   python3 make_label_page.py export dump.json label-page/key.json data
   ```

   It writes `data/<study>-labels-<date>.json` and prints every incomplete item, every answer or
   familiarity value that is not one of the offered options (not counted, same rule as on the page;
   correct it in the dump and export again) and every group with no familiarity answer. Commit the file in the same pass, and add the line "labels →
   `data/<study>-labels-<date>.json`" to the paper's `NOTES.md` for the numbers that use them.

## When the page misbehaves

Look at what the store holds (`ArtifactData` `list`) before changing anything: the page may be fine
and the person may have opened it without access. One fix to the page is allowed. If it fails again,
ask for the remaining answers in chat, write them into the dump with `"source": "chat"`, and export.
Do not iterate on a page you cannot see.

## Compose with

- **build-benchmark** — owns the study design and the inter-rater rule: agreement with the person who
  wrote the codebook measures trainability, not reliability, so the labeller for gold labels is
  someone who did not write the scheme.
- **draft-paper** — the exported labels, the familiarity filter and the complete-item count feed the
  Methods and the threats.
- **submit-paper** — a published artifact page is not anonymous. Do not link it from an anonymized
  submission; the exported JSON is what goes into the reproduction artifact.
