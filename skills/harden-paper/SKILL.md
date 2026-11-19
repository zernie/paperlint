---
name: harden-paper
description: "Use when asking \"is this paper actually ready to submit?\" / \"what's still missing before I upload?\" / \"run the pre-submission gate\" on a DRAFTED paper. The submit checklist: runs `npx paperlint lint`, checks that the final review (tighten-paper → cold-read-diff → pc-panel-review) is closed, then walks the few items no rule decides — threat model and ethics, the artifact and every number it backs, the headline results table — and reports a vector of gates, worst first. It reads the review reports; it runs no review of its own. Hands off to submit-paper."
allowed-tools: [Read, Write, Grep, Glob, Bash, Skill]
---

<!-- vigiles:sha256:127a4bdb1d234943 compiled from skills/harden-paper/SKILL.md.spec.ts -->

# harden-paper — the submit checklist

Editing the paper's text after an approved copy exists (`paperlint versions approve`): declare each change in `versions/<cycle>/changes.yaml`, `paperlint versions diff` shows what was lost (EXPERIMENTAL; `docs/rules/cycle/changes-since-approved.md`). With an approved copy, `submission … --save` refuses while the source differs from it; approve it first (the author does, never the agent).

Run once, after the final review is closed and before `submit-paper`. Each item below either names
the lint rule that decides it or is a check no rule makes. A failing item is reported with its fix;
the author decides what to apply. "Nothing fails" is a valid result.

## The checklist

1. **`npx paperlint lint <paper-dir>`** — every error is a blocker, reported as the rule names it:
   page fit (`format/page-limit`), template (`tex/template`), anonymity in the PDF
   (`anonymity/identity`), required sections (`tex/required-section`), citations
   (`paper/cite-exists`, `paper/refs-fresh`), the PDF itself (`pdf/*`), answered prior reviews
   (`cycle/prior-reviews-answered`). Do not measure what a rule decides by another method. A word cap
   the venue sets and no rule counts (an abstract limit): count it.
2. **The final review is closed and its blockers are decided** (`paper-pipeline`, "The final review":
   `tighten-paper` → `cold-read-diff --whole` → `pc-panel-review`). Read its reports; do not run it
   again. No closed review fails this item. Every blocker it recorded (a scientific must-fix, a
   readability hard-fail) is `fixed` or `waived by the author: <reason>`; an undecided one fails.
3. **Citations and the nearest neighbour.** `verify-citations` ran on the current bibliography
   (`paper/refs-checked` warns when it did not). Every close sibling has a card in `siblings/`
   (`analyze-sibling-paper`; `sibling/frontmatter` checks the card); a close competitor with no
   card is an open item.
4. **Claims the reviewers' seats do not catch.** An absolute ("no", "never", "first", "only") that the
   paper's own reference list refutes; a rhetorical hook that reality falsifies; a bound that narrows a
   body number but lives only in an appendix with no pointer reaching it
   (`paper-pipeline/references/body-vs-appendix.md`). Fix order:
   `paper-pipeline/references/review-ratchet.md`.
5. **Security and systems venues:** one paragraph of threat model (adversary and capability, trust
   boundary, assets, what is assumed not compromised), and an ethics line: aggregate and anonymised
   reporting of named systems, disclosure to maintainers before any de-anonymised release, a dual-use
   sentence.
6. **The artifact and every number it backs.** The artifact the paper promises exists; every "we
   release X" is a shipped file (`check-release-claims.sh <paper-dir>` lists the release sentences
   beside the `artifact/` tree), and every URL in such a sentence is fetched and holds what the
   sentence says. Every quantity in the body traces to an artifact output or a `\cite`
   (`check-numbers.sh <paper-dir>` enumerates them); a number that traces to neither is sourced or cut.
   The cold re-run protocol is `../build-benchmark/references/adversarial-cold-repro.md`.
7. **The headline results table and its counts.** Every number in the abstract and the conclusion has
   a row in one table of the body: the result, its n, its source (the authors' measurement with its
   section, a cited work, a public dataset), any correction applied, and the reading drawn from it.
   Every "N categories / N rules / N repositories" in the abstract equals the rows of the object it
   points to, and every number agrees across abstract, introduction, results and tables.
8. **Anonymity beyond the PDF** — the artifact files and archives: `submit-paper`'s deny-list check.

## Output — a vector of gates, worst first

Ready ⇔ every item passes or is waived: the lint errors (1), the closed final review and its blockers (2), citations and scoop (3), claims (4), the
venue's threat model and ethics (5), the artifact and numbers (6), the headline table (7), anonymity
(8). Report three lists: **Failing** (each with its fix, worst first), **Waived** (each with the author's
reason, quoted), **Passed**. A waived item never appears under Passed. An accept probability is never the headline, and a high
one does not make a paper with a failing item ready. Then the items only the author can close (host
the artifact, click submit, disclose before going public). When nothing is failing, hand off to
`submit-paper`.
