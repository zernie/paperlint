# Body, appendix, or artifact — the one rule that decides

Shared reference. Read by `draft-paper` (where do I put this as I write?), `tighten-paper` (what
moves out when the body overruns?) and `harden-paper` (is the body self-contained?). Do not copy it
into those skills — link it, the way they link `review-ratchet.md`.

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

In order. Stop at the first one that fits.

1. **Cut a whole block that duplicates another block.** Free.
2. **Cut scaffolding**: rhetorical questions staging results the next sentence delivers, signpost
   sentences restating subsection headings, a lead-in that restates its own next clause.
3. **Move a whole block to the appendix**, leaving a one-clause statement of what it concluded.
4. **Move a measurement to the artifact** and cite it.
5. **Drop a claim.** An honest reduction in scope, recorded as a decision.

🔴 **Never pay by trimming the subordinate clause that EXPLAINS a sentence.** It carries no fact, so
its loss is invisible to every fact-checker and every threshold, and what remains is short, true,
and comprehensible only to someone who already knows the idea. This is the single most common way a
paper gets worse while every metric improves.

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
