# Uncited-assertion fixture (markdown path)

Documents the `.md` behaviour of the uncited-assertion checker. Keep in the repo (it IS the contract).
<!-- Since 2026-08-27 the checker is the ESLint rule `paper/uncited-assertion`
(`eslint-rules/paper-claims.mjs`); this file is its test — see `eslint-rules/paper-claims.harness.mjs`. -->

Transformers outperform RNNs by 12%.
<!-- MUST FLAG: uncited empirical claim about prior work -->

Transformers outperform RNNs by 12% [@vaswani2017].
<!-- MUST NOT FLAG: pandoc [@key] citation attached -->

Prior work reports a large improvement over baselines.[^1]
<!-- MUST NOT FLAG: markdown footnote marker counts as a citation -->

The majority of detectors fail on adversarial inputs, per a recent survey ([link](https://example.org/survey)).
<!-- MUST NOT FLAG: markdown link/URL counts as a citation -->

Most prior detectors silently miss adversarial inputs.
<!-- MUST FLAG: bare fuzzy quantifier, no citation -->

We observe a 6% reduction in false positives.
<!-- MUST NOT FLAG: paper's own result (we-guard) -->

Transformers outperform RNNs by 12% [12].
<!-- MUST NOT FLAG (S6): numeric citation [12] counts as a cite -->

Prior detectors reduce error by 20% [3, 4].
<!-- MUST NOT FLAG (S6): citation list [3, 4] counts -->

US-based detectors reject 40% of benign inputs.
<!-- MUST FLAG (S5): bare country "US" is not the paper's own result -->

Our reading of the literature shows transformers outperform every prior baseline.
<!-- MUST FLAG (S5): claim about OTHERS, "our reading" is not an own result -->

Our method reduces false positives by 6% over the strongest baseline.
<!-- MUST NOT FLAG (S5): genuine own result, "our method" is the subject -->

2. Prior detectors silently miss most adversarial inputs.

<!-- MUST FLAG (S10): ordered-list marker "2." must not be a false boundary / stray number; the claim itself still flags -->

[^1]: Some prior study, 2021.
