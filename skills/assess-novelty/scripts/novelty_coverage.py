"""Proof that a neighbour marked read "full" was read in full: one verbatim sentence per chunk of its saved text.

A neighbour's `coverage` is a list of {"lines": [first, last], "quote": "..."}: the chunks tile the text from
line 1 to its last line with no gap, none is longer than CHUNK_LINES_MAX, and each quote is found inside its own
chunk. Why: one Read returns at most 25,000 tokens (a 1,790-line text came back as lines 1-627), and a 'no' cell —
the one that grants novelty — rests on the neighbour having been read to the end. 400 plain-pdftotext lines are
about a third of that cap, so a chunk is one Read. A quote is a presence check, as for the cells.
"""
from quote_match import found, letters, norm

CHUNK_LINES_MAX = 400
QUOTE_WORDS_MIN = 8


def coverage_gaps(last_line, ranges):
    """Line spans in 1..last_line that no range covers, in order: [(first, last), ...]."""
    gaps, nxt = [], 1
    for first, last in sorted(ranges):
        if first > nxt:
            gaps.append((nxt, first - 1))
        nxt = max(nxt, last + 1)
    return gaps + ([(nxt, last_line)] if nxt <= last_line else [])


def coverage_errors(nid, text, coverage):
    """Why the coverage does not prove a full read of `text`; empty when it does."""
    if not coverage:
        return [f"{nid}: read 'full' not proven: no coverage (one quote per chunk of at most {CHUNK_LINES_MAX} lines)"]
    # By "\n" only, as Read and wc -l number them: splitlines() also splits on the form feed pdftotext writes at
    # every page break, and a 1,825-line text then counts 1,850 (sibling-read).
    lines = text.removesuffix("\n").split("\n")
    errors = []
    ranges = []
    for chunk in coverage:
        span = chunk.get("lines")
        if not (isinstance(span, list) and len(span) == 2 and all(isinstance(x, int) for x in span)
                and 1 <= span[0] <= span[1] <= len(lines)):
            errors.append(f"{nid}: coverage lines {span!r} are not [first, last] within 1-{len(lines)}")
            continue
        first, last = span
        ranges.append((first, last))
        where = f"{first}-{last}"
        if last - first + 1 > CHUNK_LINES_MAX:
            errors.append(f"{nid}: coverage chunk {where} is {last - first + 1} lines; at most {CHUNK_LINES_MAX}")
        quote = chunk.get("quote") or ""
        words = len(norm(quote).split())
        if words < QUOTE_WORDS_MIN:
            errors.append(f"{nid}: coverage quote for lines {where} has {words} words; at least {QUOTE_WORDS_MIN}")
            continue
        body = "\n".join(lines[first - 1:last])
        if not found(quote, norm(body), letters(body)):
            errors.append(f"{nid}: coverage quote for lines {where} not found in those lines: {quote[:80]!r}")
    errors += [f"{nid}: read 'full' not proven: lines {a}-{b} have no coverage quote"
               for a, b in coverage_gaps(len(lines), ranges)]
    return errors
