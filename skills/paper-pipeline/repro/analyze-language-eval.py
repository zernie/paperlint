#!/usr/bin/env python3
"""
analyze-language-eval.py — the statistics behind the language finding, from the raw run log.

    python3 .claude/skills/paper-pipeline/repro/analyze-language-eval.py \
        .claude/skills/paper-pipeline/repro/2026-08-07-language-eval-raw.log

WHY THIS FILE EXISTS. `pipeline-language.eval.mjs` prints rates and deltas; it deliberately does
NOT print a p-value, because a gate or a statistic inside the measuring instrument is how a check
that can only confirm its own hypothesis gets written. The inference lives here, downstream, and it
reads the same log a human reads.

WHY A SIGN TEST AND NOT A CHI-SQUARE ON THE TOTALS. The design is MATCHED PAIRS: each prompt exists
in both languages with the same content, so the two arms are not independent samples and a
two-proportion test on 96-vs-96 throws away the pairing that the design was built to get. The
paired test asks the question the design actually poses — for a given question, does the English
form fire more often than the Russian one — and tied pairs (the majority here) correctly contribute
no evidence either way.

The unpaired Fisher exact is printed alongside only as a sanity check that the two tests agree on
direction and rough magnitude. It is NOT the headline number.

WHAT THE NUMBERS CANNOT SAY, and the run they replace said louder:
  - the prior single-trial run put the gap at 93% English vs 56% Russian (-37pp). This one puts it
    at 78% vs 60% (-18pp). The Russian figure replicated; the ENGLISH one fell by 15 points. The
    original gap was inflated by an English arm of 14 prompts measured once each.
  - the translations in both directions were written by the same model family being measured, and
    no native speaker has reviewed them.
"""
import math
import re
import sys
from pathlib import Path

TRIALS = 3


def log_c(n, k):
    return math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)


def fisher_two_sided(a, b, c, d):
    """Two-sided Fisher exact on the 2x2 [[a,b],[c,d]], summing all tables no likelier than observed."""
    n, r1, c1 = a + b + c + d, a + b, a + c

    def pmf(x):
        return math.exp(log_c(c1, x) + log_c(n - c1, r1 - x) - log_c(n, r1))

    p0 = pmf(a)
    lo, hi = max(0, r1 - (n - c1)), min(r1, c1)
    return min(1.0, sum(p for x in range(lo, hi + 1) if (p := pmf(x)) <= p0 * (1 + 1e-9)))


def binom_two_sided(k, m):
    """Exact two-sided binomial test against p=0.5 — the sign test's p-value."""
    if m == 0:
        return float("nan")
    pk = [math.exp(log_c(m, i) + m * math.log(0.5)) for i in range(m + 1)]
    return min(1.0, sum(x for x in pk if x <= pk[k] * (1 + 1e-9)))


def parse(path):
    """Recover (skill, origin, en_fired, ru_fired) per matched pair from the run log."""
    cases, cur, lang = [], None, None
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if m := re.match(r"^=== (\S+) —", line):
            cur = {"skill": m.group(1), "en": [], "ru": []}
            cases.append(cur)
        elif m := re.match(r"^  (en|ru): ", line):
            lang = m.group(1)
        elif (m := re.match(r"^    ([01]\.\d\d)  \[(en|ru)\] (.*)$", line)) and cur and lang:
            cur[lang].append((float(m.group(1)), m.group(2)))
    # A case whose two arms did not both record four prompts is a truncated run, not a data point.
    cases = [c for c in cases if len(c["en"]) == 4 and len(c["ru"]) == 4]
    return [
        (c["skill"], c["en"][i][1], round(c["en"][i][0] * TRIALS), round(c["ru"][i][0] * TRIALS))
        for c in cases
        for i in range(4)
    ]


def report(pairs, label):
    en, ru = sum(p[2] for p in pairs), sum(p[3] for p in pairs)
    n = len(pairs) * TRIALS
    pos = sum(1 for p in pairs if p[2] > p[3])
    neg = sum(1 for p in pairs if p[2] < p[3])
    tie = len(pairs) - pos - neg
    print(
        f"{label:14} EN {en:3}/{n} ({en / n:5.1%})   RU {ru:3}/{n} ({ru / n:5.1%})   "
        f"delta {(ru - en) / n * 100:+5.1f}pp   sign {pos}v{neg} (tied {tie}) "
        f"p={binom_two_sided(pos, pos + neg):.4f}"
    )
    return en, ru, n


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name("2026-08-07-language-eval-raw.log")
    pairs = parse(path)
    if not pairs:
        sys.exit(f"no matched pairs parsed from {path} — is this a complete run log?")
    print(f"{len(pairs)} matched pairs x {TRIALS} trials x 2 languages = {len(pairs) * TRIALS * 2} runs\n")

    en, ru, n = report(pairs, "OVERALL")
    print(f"{'':14} unpaired Fisher exact two-sided p = {fisher_two_sided(en, n - en, ru, n - ru):.4f} (sanity check only)\n")

    print("SPLIT BY ORIGIN — does the gap survive when the RUSSIAN side is the original text?")
    for origin in ("en", "ru"):
        report([p for p in pairs if p[1] == origin], f"{origin}-original")

    print("\nPER SKILL (read as scenery: n=12 per cell, one run moves a cell 8 points)")
    for skill in dict.fromkeys(p[0] for p in pairs):
        report([p for p in pairs if p[0] == skill], skill)


if __name__ == "__main__":
    main()
