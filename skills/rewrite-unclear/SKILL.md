---
name: rewrite-unclear
description: "Rewrite an unclear passage of a paper — a sentence, paragraph, heading, section or the abstract — so a reader outside the subfield understands it, keeping every claim, number and citation; more words are allowed. Use whenever someone points at paper text and wants it changed because it is unclear, confusing, too dense, full of undefined terms or reads like an LLM wrote it: simplify it, explain it plainly, rewrite it so a human gets it — \"make it simpler\", \"I can't follow this, rewrite it\", \"перепиши понятнее\", \"напиши проще\", \"не понимаю, что тут написано, переделай\" — and when cold-read-diff hands over a flagged passage. Rewrite here, not inline: this skill checks each rewrite with a reader who has no context and with a claim-preservation diff. Not for cutting length (tighten-paper), finding unclear sentences (cold-read-diff) or the order of the argument (argument-arc)."
allowed-tools: [Read, Edit, Grep, Glob, Agent]
---

<!-- vigiles:sha256:f0a48ec7658ef429 compiled from skills/rewrite-unclear/SKILL.md.spec.ts -->

# rewrite-unclear — make a passage say its claim so a stranger gets it

One job: a passage goes in, a clearer passage comes out, and a reader with no context says back the
same claim the author meant. This is the only skill that rewrites for clarity. The others **find**
unclear text and hand it here:

| who finds it | what it hands over |
|---|---|
| `cold-read-diff` | the rows its readers marked `CANNOT PARSE`, `ONLY-IF`, `CLEVER`, `WHOSE?`, `REGISTER` |
| `tighten-paper` | a sentence that explains something and sits inside a cut |
| `harden-paper`, `study-accepted-papers` (mode D) | the sentences their readability or wording checks flag |
| the author | "this is unclear", by name or by pointing at it |

**What it does not do:** cut for length (`tighten-paper`), decide whether a section should exist
(`tighten-paper`), reorder the argument (`argument-arc`), or change a result.

## Input

The passage's LaTeX source with its line range, and **why it was flagged**: the finder's row
verbatim, or the author's words. A passage is one paragraph, one heading, or the abstract. Read the
paragraph before it and the one after it too; they decide which terms the reader already has.

## The four steps, per passage

```
1. say the claim in one plain sentence ──── cannot? ──► stop: show the author, do not rewrite
2. smallest edit that says the claim, by the ten rules below (more words are allowed)
3. a cold reader says back what the rewrite claims
        ├─ matches step 1 ──► step 4
        └─ does not ──► rewrite once more; still no ──► stop, show the author both versions
4. claim-preservation diff: no number moved, no hedge dropped, no claim strengthened
```

1. **Say the claim.** Write, in one plain sentence, what the passage asserts: who measured or showed
   what, about what, with which number. If you cannot, the passage has no claim yet, or has two. Do
   not rewrite it: tell the author what you could not find. Rewriting a passage with no claim produces
   a fluent passage with no claim.
2. **Make the smallest edit that says the claim, by the rules below.** Keep the author's sentence
   where it works and change only what the flag needs: add the missing explanation, name the
   concrete thing, split the sentence. Write a new sentence only when no edit of the old one can
   state the claim, and say so in the output. Report the share of words that are new. Why: an AI
   detector scored reports that an LLM rewrote "in its own words" as 53% AI-generated on average,
   and reports it edited for clarity, keeping every point, as 1%, though 30% of their words changed
   (Caldara and Fernández-Villaverde, "Can Peer Review Survive AI-Generated Text?", working paper,
   2026, Table 1); an edit also has fewer places to change the meaning. Smallest is not
   shortest: a fix that removes the flagged construction and keeps the compression is not a fix.
   Removing a "not X but Y" tic from a compressed sentence tends to leave a shorter sentence that
   says something else, and every count goes green while the meaning goes wrong. Decompress the
   idea; the construction goes away as a side effect.
3. **A cold reader restates it.** Spawn a fresh subagent with no context and give it only the
   rewritten passage and this instruction: *Answer from the text below alone; use no tools. The text
   is LaTeX source; read it as the printed sentence. A `{{name}}` is a value the build fills in. In one
   sentence per claim, say what this passage claims. Where you have to guess, say what you guessed
   and why.* Compare its sentence with step 1. A guess, or a different claim, is a miss: rewrite once
   more and ask a fresh reader. After the second miss, stop and show the author both versions with
   both restatements; do not loop.
4. **Prove nothing moved.** Run the claim-preservation diff owned by
   `../paper-pipeline/references/writing-craft.md` → "The claim-preservation diff" over the
   before and after: no number moved, no hedge dropped, no claim strengthened, no new absolute, no
   `\cite` or `\ref` lost, nothing that contradicts the unchanged text. A rewrite that fails it is
   reverted, not patched.

## The ten rules

Each rule is one kind of change that turned an unclear sentence into a clear one. The examples are
illustrations of the shape, not quotations from any paper.

| # | rule | before → after |
|---|---|---|
| 1 | **Say the claim directly**, not by what it is not. | "The cache is not the slow part; the parse is." → "Most of the time goes to parsing the file; reading it from the cache takes under a millisecond." |
| 2 | **Replace a saying with the literal claim.** An aphorism or a turn of phrase gets the sentence it stands for. | "Configuration is a promise nobody keeps." → "In 30 of 50 repositories, a setting the README describes is absent from the configuration file." |
| 3 | **Name the concrete thing.** No bare "the tool", "the file", "it", "this" standing for an idea the reader has to reconstruct. | "And the file is not one thing." → "And the lines in this file are not all the same kind of rule." |
| 4 | **Explain a term in its own clause the first time** it appears in the paper, and remind the reader where a section starts on it. | "checked against a temporal logic" → "checked against a temporal logic, which states what must happen and in what order" |
| 5 | **An important unclear paragraph gets longer.** One argument per paragraph; a paragraph carrying three gets split into three. | a 100-word paragraph making three points → three paragraphs, one point each, the first sentence of each saying the point |
| 6 | **A heading names the concrete thing and its scope**, with the real tool's name; a finding as a heading keeps its comparator. | "The configuration nobody opens" → "Linter configuration files the agent never reads"; "Models disagree less often" → "One model disagrees with itself less often than two vendors disagree" |
| 7 | **One quote per paragraph**; spread citations over the sentences they support. | two quotations in one sentence → one, or none, with the claim in your words and the `\cite` |
| 8 | **One name for one thing** across the paper. When the passage uses a second name for something already named, use the first. | "gate", "checker", "step", "check" for one tool → one of them, every time |
| 9 | **A number only with where it comes from**: what it counts, out of what, from which experiment, in the same sentence. A number traced to nothing is deleted, not reworded. | "over 90 runs" with no source → removed; "contains one in five" → "the 95% interval, 12–31%, contains the 20% we set as the bar" |
| 10 | **The plain word over a description of it.** | "a model that understands natural language" → "an LLM"; "category of mechanisms" → "hooks and linters" |

Rules 6–9 are partly countable, so a lint rule may find the case; this skill writes the fix.

## Length

A clearer passage may take more words. Pay for them by moving material to an appendix or the
artifact, never by shortening another sentence that explains something: that is how the unclear
passage was made. Whether the paper still fits is measured by the build after the rewrites, and a
measured overflow goes to `tighten-paper`, which owns length. After the final review is closed,
`tighten-paper` does not run again: the overflow is paid from the next cut not yet taken in its
recorded ranked plan (`reviews/<date>-tighten-paper.md`), on the author's yes.

## Output

Per passage: the location, why it was flagged, the step-1 claim, the rewritten LaTeX, the cold
reader's restatement, what changed and which rule, the share of new words (and, when it is a new
sentence, why no edit could say the claim), and the step-4 result. Apply the rewrite with
`Edit` only when the author asked for fixes or the task already was "fix the prose"; otherwise the
rewrites are a proposal the author accepts or rejects one by one.

When the passage came from a report with `findings` frontmatter (`cold-read-diff`), set that finding's `status` to `fixed` once the rewrite is applied and step
4 passed, or to `wontfix` with `note` giving the author's reason when he kept the original.

## Rules

- **The author decides.** The reader's verdict and the restatement are evidence; the author accepts
  or rejects each rewrite. "Leave it" is a valid outcome, recorded as `wontfix` with his reason.
- **Do not argue with a reader who could not parse it.** The author's understanding of their own
  sentence is not evidence about anyone else's.
- **Do not write the claim stronger to make it clearer.** A hedge that makes a sentence harder to read
  is rewritten into a scope ("in our 50 repositories"), never dropped.
- **Keep the venue's register.** A rewrite that the engineer reader parses and the venue's reviewer
  would call colloquial is a new finding; `cold-read-diff`'s reviewer persona checks it.

## Compose with

- `cold-read-diff` — finds the sentences; it confirms a rewrite only when the author asks.
- `tighten-paper` — owns length; a measured overflow after rewrites goes there, or, after the final review
  is closed, to the next cut in its recorded plan.
- `argument-arc` — when step 1 fails because the section has no claim, the problem is the arc, not the sentence.
