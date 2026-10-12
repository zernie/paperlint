# CLAUDE.md — `eslint-rules/`

The rules this package ships. Loaded when working under `eslint-rules/`; the rules for every change
are in the root `CLAUDE.md`. Each requirement below names what holds it; the reasoning lives in
that file's header.

## Before writing a check

**A check over an AST is a LINT RULE, not a script.** It fires in the editor on save, gets the
AST for free, and has a suppression syntax people already know. A script is for corpus-wide
questions — index connectivity, ratios across many files. When the work has to run a program, a
script may do the work and write facts to a JSON file, and a rule judges that file: the verdict
still lands in the engine.

## What a new rule ships with, and what holds it

| requirement                                                                                                                               | held by                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Both halves**: it fires on a planted defect and stays quiet on a clean fixture; the test goes red before the fix lands                  | `src/rule-cases.test.ts` fails on a registered rule with no cases            |
| **One rule, one requirement**: two checks with different reasons to switch them off are two rules                                         | review                                                                       |
| **A venue requirement is validated on real accepted papers** of that venue, built to PDF, with the ground truth established independently | review; the papers are in `fixtures/accepted-papers/`                        |
| **Its page**, `docs/rules/<group>/<rule>.md`, and `meta.docs.url` pointing at it                                                          | `src/rule-docs.test.ts`; its `AWAITING_PAGE` list only shrinks               |
| **Loud on an empty input set**: a rule that matched no files must not report like one that passed                                         | `scripts/rules-see-files.mjs`, per rule and not per glob, in `npm run check` |

The page's sections: What it catches · Why · Examples (failing / passing) · Options / preset fields ·
What it does not check · How to fix. Its row in `docs/rules.md` is one line linking there.

## A rule that judges prose

A rule, or a skill criterion, that judges a paper's prose is held to five principles. Without them
the checks push every paper toward a blog post.

1. **Two-sided**: a floor as well as a ceiling, or the distance to accepted papers of the target
   venue. A set of ceilings alone converges on clipped, unsignposted prose.
2. **Rules count, skills judge.** Countable on the parse tree → a lint rule; needs reading (register,
   genre, whether a claim changed strength) → a skill criterion.
3. **The model reader is the venue's reviewer**, including one who skims the abstract, the
   introduction and the conclusion.
4. **Thresholds are calibrated, not borrowed**: set with the same counter on
   [`fixtures/accepted-papers/`](../fixtures/accepted-papers/README.md), never taken from a figure
   measured by a different counter.
5. **A rewrite is accepted on what reviewers see**: the combined count of every surface form of a
   tic, plus a check that no claim was softened or strengthened.
