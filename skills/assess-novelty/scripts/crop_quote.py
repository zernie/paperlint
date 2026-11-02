"""Find a verbatim passage in a PDF, render its page, highlight the passage and crop to its column.

Usage: python3 -I crop_quote.py <pdf> <out.png> "<passage>" [--page N]
Prints one JSON line: {"page": N, "pages": [every page the passage is on], "words": "the matched words"}.
Exit 1: the passage is not in the PDF (nothing written). Exit 3: it is on more than one page and --page
does not pick one (an abstract repeats its body; the first hit is the wrong one as often as the right one).

PyMuPDF does the reading and the drawing (it is what CI installs for the PDF harnesses; the runner has no
poppler, so pdftotext and pdftoppm are not there, measured on run 40927062797).

Matching ignores case, punctuation, spacing and line-end hyphenation: the PDF's words and the passage are
both reduced to letters and digits (NFKC first, so a ligature reads as its letters) and compared as one
stream. A passage matches whole or not at all; there is no shorter fallback, because a fallback that finds
"a" place is how a crop lands on the wrong sentence.
"""

import argparse
import json
from bisect import bisect_right
from itertools import accumulate
import re
import sys
import unicodedata

import pymupdf

DPI = 150
CONTEXT_PT = 60  # points of page shown above and below the passage


def norm(text):
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKC", text).lower())


def words(pdf):
    """Every word of the PDF as (page, x0, y0, x1, y1, text), pages counted from 1."""
    with pymupdf.open(pdf) as doc:
        return [(number, x0, y0, x1, y1, text)
                for number, page in enumerate(doc, start=1)
                for x0, y0, x1, y1, text, *_ in page.get_text("words")]


def occurrences(ws, passage):
    """Each match of the passage as the list of word indices it covers."""
    keys = [norm(w[5]) for w in ws]
    starts = list(accumulate((len(k) for k in keys), initial=0))
    stream, needle = "".join(keys), norm(passage)
    if not needle:
        return []
    hits = [m.start() for m in re.finditer(f"(?={re.escape(needle)})", stream)]
    # A match covers the words from the one its first letter falls in to the one its last letter falls in.
    span = [(bisect_right(starts, at) - 1, bisect_right(starts, at + len(needle) - 1) - 1) for at in hits]
    return [[i for i in range(lo, hi + 1) if keys[i]] for lo, hi in span]


def render(pdf, page, sel, ws, out):
    # The column the passage sits in: every word of the page within 40 pt of the passage's left and right edge.
    xs0, xs1 = min(w[1] for w in sel), max(w[3] for w in sel)
    ys0, ys1 = min(w[2] for w in sel), max(w[4] for w in sel)
    col = [w for w in ws if w[0] == page and w[1] >= xs0 - 40 and w[3] <= xs1 + 40]
    cx0 = min([w[1] for w in col] + [xs0]) - 8
    cx1 = max([w[3] for w in col] + [xs1]) + 8
    with pymupdf.open(pdf) as doc:
        pg = doc[page - 1]
        # Drawn on the page in memory only; the PDF on disk is never saved.
        for _, x0, y0, x1, y1, _ in sel:
            pg.draw_rect(pymupdf.Rect(x0 - 0.5, y0 - 0.5, x1 + 0.5, y1 + 0.5),
                         color=None, fill=(1, 0.84, 0), fill_opacity=0.43, overlay=True)
        clip = pymupdf.Rect(cx0, ys0 - CONTEXT_PT, cx1, ys1 + CONTEXT_PT) & pg.rect
        pg.get_pixmap(dpi=DPI, clip=clip).save(out)


def main(argv):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("pdf")
    p.add_argument("out")
    p.add_argument("passage")
    p.add_argument("--page", type=int)
    a = p.parse_args(argv)
    ws = words(a.pdf)
    found = occurrences(ws, a.passage)
    pages = sorted({ws[m[0]][0] for m in found})
    if not found:
        print(f"NOT FOUND: {a.passage[:80]}", file=sys.stderr)
        return 1
    picked = [m for m in found if a.page is None or ws[m[0]][0] == a.page]
    if not picked:
        print(f"NOT ON PAGE {a.page}: found on pages {pages}", file=sys.stderr)
        return 1
    if len({ws[m[0]][0] for m in picked}) > 1:
        print(f"ON SEVERAL PAGES {pages}: pass --page to pick one", file=sys.stderr)
        return 3
    match = picked[0]
    page = ws[match[0]][0]
    sel = [ws[i] for i in match if ws[i][0] == page]
    if len(sel) < len(match):
        print(f"passage runs past page {page}: highlighted the part on it", file=sys.stderr)
    render(a.pdf, page, sel, ws, a.out)
    print(json.dumps({"page": page, "pages": pages, "words": " ".join(w[5] for w in sel)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
