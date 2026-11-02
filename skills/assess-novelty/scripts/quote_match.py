"""The quote matcher the novelty checkers share: is a quoted passage in a text?

A quote is matched after normalising both sides: lowercase, hyphenated line breaks joined, ligatures expanded,
curly quotes straightened, all whitespace collapsed. It is a presence check, not a proof the quote supports a claim.
"""
import re

LIG = {"ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff", "ﬃ": "ffi", "ﬄ": "ffl"}


def norm(s):
    s = s.lower()
    for a, b in LIG.items():
        s = s.replace(a, b)
    s = re.sub(r"[‘’‛]", "'", s)
    s = re.sub(r"[“”„]", '"', s)
    s = re.sub(r"[‐‑‒–—]", "-", s)
    s = re.sub(r"-\s*\n\s*", "", s)
    return re.sub(r"\s+", " ", s).strip()


def letters(s):
    return re.sub(r"[^a-z0-9]", "", norm(s))


def found(q, paper, paper_letters):
    """Exact after norm; else, for two-column text where a long span is broken by the other column or by
    small-caps spacing, at least 90 % of its 5-word chunks occur (letters and digits only)."""
    if norm(q) in paper or letters(q) in paper_letters:
        return True
    words = norm(q).split()
    chunks = [" ".join(words[i:i + 5]) for i in range(0, len(words), 5)]
    hits = sum(letters(c) in paper_letters for c in chunks)
    return len(chunks) >= 2 and hits / len(chunks) >= 0.9
