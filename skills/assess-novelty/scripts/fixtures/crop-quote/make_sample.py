"""Writes sample.pdf, the crop_quote.harness.ts fixture. Run once; the PDF is committed so the test needs no reportlab.

Page 1 states a sentence the way an abstract does; page 2 repeats it in the body (the case where the first hit
is the wrong one), holds one sentence found nowhere else, and splits a word across a line with a hyphen.
Page 3 has two columns at the same heights, as a conference paper does: a sentence that runs over two lines
of the left column reads whole only if words keep column order, not top-to-bottom order across the page.
"""
import sys

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

PAGES = [
    ["Abstract. Rules written only in prose are broken as often as rules a linter checks.",
     "This sentence fills the first page and is not quoted by any test."],
    ["Introduction. Rules written only in prose are broken as often as rules a linter checks.",
     "We ran Checkstyle before and after applying the initial patch and the final patch.",
     "Most repositories never turn on the configu-",
     "rations of every linter they install, and nobody notices."],
]

COLUMNS = [
    (72, ["Developers can configure most", "linters through a file that", "sits next to the code."]),
    (320, ["The right column talks", "about something else", "entirely, line by line."]),
]

c = canvas.Canvas(sys.argv[1], pagesize=letter, invariant=1)
for lines in PAGES:
    text = c.beginText(72, 720)
    text.setFont("Helvetica", 11)
    for line in lines:
        text.textLine(line)
    c.drawText(text)
    c.showPage()
for x, lines in COLUMNS:
    text = c.beginText(x, 720)
    text.setFont("Helvetica", 11)
    for line in lines:
        text.textLine(line)
    c.drawText(text)
c.showPage()
c.save()
