# The venue's bar: one input for every skill that scores soundness or novelty

Used by `pc-panel-review` (every reviewer seat and the chair). The wording lives here and nowhere else.

## The input

The venue is the one the paper targets (its `paperlint.json` `cycles` entry, i.e. the preset id).
If `<papers-root>/venues/<venue>/summary.md` exists, it is the `study-accepted-papers` output for
that venue: the accepted papers' denominators for each rigour practice. Read it before scoring and
hand it, whole, to every reviewer seat or scoring step. A seat that is not handed it scores against
a bar nobody wrote down.

If the file is missing, look no further for a substitute and do not invent denominators.

## The reporting rule

Every finding about missing rigour (agreement, intervals, a named test, threats to validity,
artifact, oracle, novelty delta) states the paper's position against the summary's denominator for
that practice, in one clause:

> intervals: 9 of 24 accepted papers report them; this paper does not.

Read both ways: a demand above what the accepted papers do is reported as "above the venue's bar",
not as a blocker, and a practice where the paper exceeds the bar is said so. Report the bar and the
paper's position side by side so that calibrating to the accepted median does not read as aiming
low. A summary that names a sister venue as a proxy (a first edition has no corpus of its own) is
quoted as a proxy.

## No summary

The first lines of the report say **main-conference bar assumed**, and any probability or score
carries the same flag. This is stated, never silent.
