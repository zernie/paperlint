# Body, appendix, or artifact — the one rule that decides

Shared reference. Read by `draft-paper` (where do I put this as I write?), `tighten-paper` (what
moves out when the body overruns?), `harden-paper` (is the body self-contained, and does it fit?)
and `paper-adversarial-review` (what to cut). Do not copy it into those skills — link it, the way
they link `review-ratchet.md`.

## Why this file exists

There was no rule. There was taste, and taste loses to a page limit every time. Author, 2026-08-06
(translated from Russian):

> _"I don't get it — the rule about the compiler-and-rule-synthesis paper, does that go mostly in
> the body or in the appendix. I figured mostly body, with some details in the appendix, but IDK."_

Without a rule the page limit does the deciding, and it decides badly: it evicts whatever was
written last, which is usually the honest qualification nobody had room for. On `compile-rules-2026`
that is exactly what happened, and it is traceable to a single commit. The day the contribution was
re-typed, an admission that **eight of the 23 build-stopping findings sat inside globs covering
tests and vendored code** was written and parked in the appendix, because the body was full. It
qualified a headline number and no pointer in the body reached it. A reader of the abstract had no
way to learn it existed.

## The rule

> **The body carries everything a reviewer's decision to accept depends on.
> The appendix carries what a reader who already believes you wants next.
> The artifact carries what nobody reads and everybody may need to re-run.**

This is not our invention; it is the ACL/ARR rule stated positively. What the venues actually
require, quoted:

- ACL formatting guidelines: appendices _"are not required to fit within these page limits"_, they
  come _"after the references"_, and _"it is optional for reviewers to look at appendices"_.
- ARR author guidelines: _"the main text of the paper must be self-contained, and reviewers are not
  expected to read the supplementary materials."_
- ARR reviewer guidelines: _"any details important for understanding the key aspects of the work
  should be in the paper rather than in appendices."_
- ARR, and this one is a desk-reject: putting _"substantive parts of related work"_ only in an
  appendix _"will be viewed as an attempt to circumvent the content page count."_

**There is no size rule anywhere, and no tool checks appendix length** — `aclpubcheck` structurally
stops at the appendix boundary. So "the appendix is too long" is never the finding. The finding is
always _"a decision-relevant thing is not in the body"_ or _"nothing in the body sends the reader
to this."_

## Sorting test, applied per block

Ask one question: **if a reviewer read only the body, would they be missing something they need to
decide?**

| goes in the BODY                                                    | goes in the APPENDIX                                | goes in the ARTIFACT                 |
| ------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------ |
| what the thing does, on what input, what it outputs                 | the full protocol behind a body result              | run logs, fixtures, raw per-row data |
| the claim, and the evidence the claim rests on                      | per-item tables a reader might audit                | scoring code and its self-tests      |
| **the price** — what the construction costs, where it stops working | comparisons you ran but do not lean on              | prompts, seeds, model versions       |
| **every bound that narrows a headline number**                      | your own tools' failures, at length                 | anything regenerable from the above  |
| the nearest competitor and your delta over it                       | the long form of a bound stated briefly in the body |                                      |

🔴 **The asymmetric one, and the reason for this file: a qualification that narrows a number in the
body belongs in the body, however tight the page count.** A number stated without the bound that
narrows it is an overclaim, and moving the bound to an appendix does not fix it — it hides it and
adds "and they buried it" to the reviewer's objection. If the page count will not take the full
bound, state the bound in one clause in the body and put its working in the appendix. Never the
other way round.

## When the body overruns

This list is the one cut order. `tighten-paper`, `harden-paper` and `paper-adversarial-review` point
here and keep no order of their own. Spend in this order until the measured overflow is covered.

0. **Measure, then strike the steps this venue makes worthless.** Read the overflow (pt or lines)
   from the build, and what the limit counts from the paper's resolved preset, never from memory.
   Name the venue's limit text in the plan. Strike a step the venue makes worthless, and say so:

   | read in the resolved preset                                                      | what the limit counts                                     | strike                                                           |
   | -------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
   | `ref_pages_max: "unlimited"`                                                     | references are outside the limit                          | step 5                                                           |
   | `body_pages_max` with an integer `ref_pages_max`                                 | references have an allowance of their own                 | step 5, unless the reference pages are what overflow             |
   | `pages_max` alone                                                                | every page of the PDF, references and appendices included | step 6                                                           |
   | `pages_max` beside `body_pages_max`                                              | a body limit and a total limit, both checked              | step 6, unless the body is what overflows and the total has room |
   | `format.appendix_in_body: true` (with `body_ends_at: "references"`)              | appendices count in the body                              | step 6                                                           |
   | `body_pages_max` with `format.body_ends_at: "references"`, no `appendix_in_body` | the body ends at the references or the appendix           | none: steps 5 and 6 are open when the limit text allows          |

   A limit like "including references" with appendices counted strikes step 6 and leaves step 5
   standing. A preset that sets none of these fields has no checked limit: read the venue card and
   quote its limit text.

1. **Cut a whole block that duplicates another block.** Free. When a caption and a body paragraph
   say the same thing, the body copy goes: the skim reader reads captions.
2. **Cut sentences about the text itself**: rhetorical questions staging results the next sentence
   delivers, signpost sentences restating subsection headings, a lead-in that restates its own next
   clause. A signpost that adds new orientation stays.
3. **Bibliography format and float layout, no body sentence changed.**
   - Bibliography, only within the venue's own style: abbreviated venue names; drop a URL where a
     DOI or the full venue is printed; drop month and note fields. "et al." only where the style
     allows it: IEEEtran truncates long author lists by its own rule; ACM's ACM-Reference-Format
     lists all authors and prints "et al." only for a literal `and others`, so do not truncate
     there. A truncated list can hide a reviewer's name.
   - Floats: crop whitespace inside figures, merge two small tables that share columns, turn a table
     of about four cells into a sentence, a short list into run-in prose, fold a footnote into text
     or delete it. Every changed float is re-read as a rendered crop.
   - Forbidden: `\vspace`, font or margin changes, float-separation lengths, reference type below
     the preset's size.
4. **Shorten the wording of Threats to validity, related work, discussion and captions.** Every
   limitation survives as at least one clause, and every claim and every stated delta over a cited
   work stays. A caption keeps what the float shows, its N, and any bound on its numbers. Merging
   paragraphs is allowed, and so is dropping a "why this matters" explanation: the sentence that
   tells the reader why a limitation or a related work deserves attention. That is not the
   explaining clause of the rule below. A "why this matters" sentence argues for attention; an
   explaining clause says what its sentence means. A Threats section already down to one clause per
   limitation has nothing left here: say so and go on.
5. **Cut a reference cited once, in a sentence that is not a claim**: background the reader
   already has, a "see also", a tool named in passing. Remove the citation, and the sentence too if
   it then carries nothing. Never on this list: the nearest competitor, the source of a number, the
   only citation of a dataset or tool the study used, the credit for a borrowed idea, and a work a
   sibling-paper card marks must-cite. Price each
   entry for the template before weighing it against the next kind. `_build/paper.facts.json`
   records no per-entry cost and no entry count. It records `bib_anchor_page` (the page the first
   entry is anchored on), `ref_pages` (pages holding only references), `columns`, `ref_pt`, and each
   page's text in `pages_text`. So count the entries in the build's `.bbl`, find how many columns
   the bibliography fills in `pages_text` from `bib_anchor_page` on, and divide by the entries: that
   is one entry's cost in columns. Multiply by the body's words per column to weigh it against
   prose. Issue #486 estimates about 28 pt, roughly 22 body words, per entry for one consumer paper
   in two-column IEEE. LaTeX breaks columns and places floats, so a cut entry saves a page only when
   the total crosses a column boundary: rebuild and count.
6. **Move a whole block to the appendix**, leaving a one-clause statement of what it concluded. Only
   where step 0 left it standing.
7. **Move a measurement to the artifact** and cite it.
8. **Drop a claim.** An honest reduction in scope, recorded as a decision.

**Closing rule, not a step: short last lines.** Only once the text is frozen and the residual
overflow is a few lines: trim paragraphs whose last line holds one to three words. It comes last in
time because any later edit undoes it. It stays under the rule below: never trim the clause that
explains. Issue #489 proposes a tool to list them.

🔴 **Never pay by trimming the subordinate clause that EXPLAINS a sentence.** It carries no fact, so
its loss is invisible to every fact-checker and every threshold, and what remains is short, true,
and comprehensible only to someone who already knows the idea. This is the single most common way a
paper gets worse while every metric improves.

🔴 **Before proposing to cut, move or drop a result, or any sentence of the abstract (steps 6–8 on a
result), show steps 1–5 exhausted, or name why each was left.** "Exhausted" for a step means
"N candidates, M taken, reason for each left": one line per step, with the counts and the reason
("Threats: 1 candidate paragraph, 0 taken, already one clause for each of four limitations"). A results cut
without that ledger is not yet a proposal. On one consumer paper (#486) a pass took 0 of 689 words
of Threats and no once-cited reference on its own merits, and proposed cutting an outside-benchmark
result, a base-rate anchor and an abstract sentence instead.

A qualification that narrows a number in the body has no rank on this list at all: it stays (the
asymmetric rule under "Sorting test").

## When the appendix is the thing that looks wrong

Measure reachability, not size. Resolve every pointer from the body and Limitations into the block
it actually answers, then split the appendix into reached and unreached. On `compile-rules-2026`
that gave 19 of 35 blocks reached — and **two thirds of the unreached mass was not surplus**, it was
material the body half-promised and never sent anyone to find. The fix for those is a pointer, not
a deletion; when the body has no room for pointers, build an index at the head of the appendix.

Only what stays unreached _and_ unwanted is surplus, and its destination is the artifact.

## Provenance

Written 2026-08-06 for `compile-rules-2026`, from a fetch of the ACL/ARR guidelines (all quotes
above verified against the source pages) plus a reachability audit of one 3,480-word appendix. The
prompting failure: the body sat at exactly its limit for two weeks, every cut in that time came out
of the body, and nobody had written down what the body was _for_.
