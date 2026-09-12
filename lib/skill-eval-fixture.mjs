/**
 * skill-eval-fixture.mjs — the throwaway working directory every trigger run sees.
 *
 * 🔴 WHY A FIXTURE IS NOT OPTIONAL, learned by getting it wrong (2026-08-11).
 * A trigger run executes in a FRESH EMPTY cwd. Ask "grade the writing on this
 * paper" in a directory containing no paper and the model reasonably does not
 * reach for a skill — there is nothing to grade. Measured: without this fixture,
 * `grade-paper-writing`, `harden-paper`, `map-prior-work` and
 * `paper-adversarial-review` all scored 0% on prompts that had previously fired,
 * and the zero was an artifact of the empty directory, not a fact about the skill.
 *
 * Extracted from `paper-pipeline/pipeline-firing.eval.mjs`, which had it right
 * from the start, so the two runners cannot drift apart on what the model sees.
 *
 * ⚠️ AND THE PRICE, so this file is not a one-sided story (measured 2026-08-12).
 * With a fixture present the model OPENS THE PAPER and looks around, so the number
 * stops being "did the DESCRIPTION fire" and becomes "did the model go investigate
 * and then fire". A different quantity, and a costlier one: ~590k → ~780k tokens
 * per skill (+190k) and 67s → 84s, while this whole fixture is 1,537 characters
 * ≈ 384 tokens. The growth is reading, not input size (`cache` 470k → 652k).
 * Cite the trigger numbers with that caveat attached — it is written out in
 * `vigiles/repro/skill-trigger-2026-08-11/README.md` under "Как читать".
 */
export const FIXTURE = {
  "paper/paper.md": [
    "# Prose Isn't Policy: Measuring Whether Agent-Config Rules Are Enforceable",
    "",
    "## Abstract",
    "Agent configuration files state rules in prose and assume the model obeys them. We compile a",
    "corpus of real rules and measure what fraction can be mechanically enforced. We find that 84%",
    "of rules in our corpus are enforceable, and that LLM-authored checkers for the remainder leak",
    "silently in 84-96% of adversarial cases \\cite{greshake2023}.",
    "",
    "## 1 Introduction",
    "Every agent harness ships a natural-language rulebook. Nothing checks it. This is the same",
    "mistake as a code comment that claims an invariant no test enforces \\cite{thompson1984}.",
    "",
    "## 2 Method",
    "We gather rules from public repositories, classify each by enforceability, and build a",
    "two-stage adversarial gate that validates a synthesized rule against a blind gold set.",
    "",
    "## 3 Results",
    "See Table 1. The headline number is 84%.",
    "",
    "## 4 Discussion",
    "The result generalizes beyond our corpus in the sense that the mechanism is not corpus-specific,",
    "though of course the specific percentages are, and it is important to note in this context that",
    "the framing itself may be what carries, rather than the measurement.",
    "",
    "## 5 Threats to Validity",
    "Our corpus is drawn from public repositories and may not represent private configurations.",
    "",
    "## 6 Related Work",
    "TODO",
    "",
    "## 7 Conclusion",
    "Prose is not policy.",
  ].join("\n"),
  "paper/repro/README.md":
    "# Reproduction artifact\n\n`python3 paper_numbers.py` recomputes every bolded figure in paper.md.\n",
  "paper/PIPELINE-STATUS.md":
    "# Pipeline status\n\n| gate | state |\n|---|---|\n| numbers | pass |\n| structure | not run |\n| citations | not run |\n",
};
