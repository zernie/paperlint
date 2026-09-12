---
title: The probe that measured whether any shipped prose linter catches our actual defect
created: 2026-08-06
tags: [paper-pipeline, prose, occupancy, repro]
---

# What this is

Six real sentences from `compile-rules-2026` that the author rejected on sight — *"wtf"*,
*"VAGUE AF"*, *"confusing af"* — run through every shipped deterministic prose checker we could
install. `sentences.txt` holds the test set; `test_sentences.py` runs proselint / write-good /
textstat; `run_retext.mjs` runs retext-readability at several thresholds.

**These scripts are the evidence, not the write-up.** The finding — that nothing flags the defect —
is a negative result, and a negative result nobody can re-run is an opinion. Rescued out of the
session scratchpad, which is erased when the session ends.

Result and full tool-by-tool detail: `../occupancy-2026-08-06-prose-checkers.md`.

## Re-running it

```
pip install proselint textstat && npm i -g write-good retext retext-readability
python3 test_sentences.py && node run_retext.mjs
```

Both read `sentences.txt`, so adding a newly-rejected sentence to that file is how the test set
grows. Do add them: the set is the only ground truth we have about what "unreadable but passing"
looks like, and it is what any future check must be measured against.

## One caveat, recorded rather than smoothed over

Sentence 6 is a **reconstruction**. The original's exact text was not supplied to the probe, so a
same-shape stand-in was built (six factual claims joined by dashes and semicolons). It is marked as
such here and in the report. Replace it with the real sentence when convenient.
