"""Candidate neighbours: works a refutation or a search surfaced, waiting for the author to decide on each one.

Why Python, not TypeScript (a TypeScript rewrite is paperlint#339): check_novelty.py,
which is Python, imports this module, and the gate must be the same code the page builder asks. The builder
(candidate_page.ts) calls this file's `shape` command instead of keeping a second copy of the rules.

A candidate is one file, <paper-dir>/siblings/candidates/<id>.json:

    {"id": "smith16",                        # = the file name; becomes the neighbour id on "add"
     "title": "...", "authors": "...", "venue": "...", "year": 2016,
     "url": "https://...",                       # the work's landing page
     "pdf_url": "https://...",                   # optional: the PDF itself
     "text": "siblings/data/<id>.txt",           # the full text, as for a neighbour
     "found_by": [{"claim": "C3", "file": "siblings/...-refutation-C3.md"} | {"source": "paper.tex ref86"}],
     "summary": "what the work does, in plain words",
     "abstract": {"page": 1, "text": "the abstract, verbatim"},
     "conclusion": {"page": 10, "text": "the conclusion section, verbatim"},
     "passages": [{"claim": "C3", "page": 4, "quote": "verbatim, at least 8 words",
                   "crop": "siblings/data/crops/<id>-1.png", "meaning": "what it means for the claim"}],
     "suggestion": "add" | "cite" | "skip", "suggestion_why": "...",
     "decision": {"choice": "add" | "cite" | "skip", "reason": "...", "at": "ISO time",
                  "source": "page" | "chat"}}        # absent until the author decides

The abstract and the conclusion are what the authors say about their own work, at the top of the page, so the
author judges the passages against them (the author asked for the abstract and the
conclusions to be shown at every stage, if possible at the top). Every quoted text must be found in the saved text.

The author decides on a page (candidate_page.ts builds it); nobody else writes `decision`. "add" makes the work
a neighbour, read in full by sibling-read; "cite" keeps it out of the novelty table but the paper should cite
it; "skip" needs a reason. check_novelty.py fails while a candidate is undecided or added but not yet read.

    python3 -I novelty_candidates.py shape <paper-dir>   # each shape problem on its own line; exit 1 if any
"""
import json
import os
import sys

CHOICES = ("add", "cite", "skip")
SOURCES = ("page", "chat")
QUOTE_WORDS_MIN = 8
REQUIRED = ("id", "title", "url", "text", "found_by", "summary", "abstract", "conclusion", "passages", "suggestion")
OWN_WORDS = ("abstract", "conclusion")


def load(paper):
    """[(relative path, parsed file)] for every siblings/candidates/*.json, sorted by name."""
    folder = os.path.join(paper, "siblings", "candidates")
    if not os.path.isdir(folder):
        return []
    names = sorted(n for n in os.listdir(folder) if n.endswith(".json"))
    return [(f"siblings/candidates/{n}", json.load(open(os.path.join(folder, n), encoding="utf-8"))) for n in names]


def shape(path, c):
    missing = [k for k in REQUIRED if c.get(k) in (None, "", [], {})]
    if missing:
        return [f"{path}: missing {', '.join(missing)}"]
    errs = []
    if os.path.basename(path) != f"{c['id']}.json":
        errs.append(f"{path}: id {c['id']!r} does not match the file name")
    if c["suggestion"] not in CHOICES:
        errs.append(f"{path}: suggestion {c['suggestion']!r} is not one of {', '.join(CHOICES)}")
    errs += [f"{path}: found_by[{i}] names neither a claim with its file nor a source"
             for i, f in enumerate(c["found_by"]) if not ((f.get("claim") and f.get("file")) or f.get("source"))]
    errs += [f"{path}: {k} needs page and text" for k in OWN_WORDS
             if not (isinstance(c[k], dict) and c[k].get("page") and (c[k].get("text") or "").strip())]
    for i, p in enumerate(c["passages"]):
        gaps = [k for k in ("quote", "page", "crop", "meaning") if not p.get(k)]
        errs += [f"{path}: passages[{i}] missing {', '.join(gaps)}"] if gaps else []
        if p.get("quote") and len(p["quote"].split()) < QUOTE_WORDS_MIN:
            errs.append(f"{path}: passages[{i}] quote has {len(p['quote'].split())} words; at least {QUOTE_WORDS_MIN}")
    return errs


def _decision(path, c):
    d = c.get("decision")
    if d is None:
        return []
    errs = [f"{path}: decision.choice {d.get('choice')!r} is not one of {', '.join(CHOICES)}"
            ] if d.get("choice") not in CHOICES else []
    if d.get("source") not in SOURCES:
        errs.append(f"{path}: decision.source {d.get('source')!r} is not one of {', '.join(SOURCES)}")
    if not d.get("at"):
        errs.append(f"{path}: decision has no time (at)")
    if d.get("choice") == "skip" and not (d.get("reason") or "").strip():
        errs.append(f"{path}: skip without a reason")
    return errs


def errors(paper, data, files, found, texts_of):
    """Every problem with the candidates of one paper.

    data: the novelty table; found(quote, text) -> bool, the same presence check the cells use;
    texts_of(path) -> the saved text at a paper-relative path, or None when there is no such file.
    """
    neighbours = {n["id"]: n for n in data.get("neighbours", [])}
    out = []
    for path, c in files:
        problems = shape(path, c)
        if problems:
            out += problems
            continue
        text = texts_of(c["text"])
        if text is None:
            out.append(f"{path}: no text at {c['text']}")
        else:
            out += [f"{path}: {k} not found in {c['text']}: {c[k]['text'][:80]!r}"
                    for k in OWN_WORDS if not found(c[k]["text"], text)]
            out += [f"{path}: passages[{i}] quote not found in {c['text']}: {p['quote'][:80]!r}"
                    for i, p in enumerate(c["passages"]) if not found(p["quote"], text)]
        out += [f"{path}: passages[{i}] crop {p['crop']} does not exist"
                for i, p in enumerate(c["passages"]) if not os.path.isfile(os.path.join(paper, p["crop"]))]
        out += _decision(path, c)
        choice = (c.get("decision") or {}).get("choice")
        n = neighbours.get(c["id"])
        if choice is None:
            out.append(f"{c['id']}: candidate waiting for the author's decision (candidate_page.ts build)")
        elif choice == "add" and (n is None or n.get("read") != "full"):
            out.append(f"{c['id']}: approved as a neighbour but not read in full yet "
                       f"(sibling-read with only: [{c['id']!r}])")
        elif choice != "add" and n is not None:
            out.append(f"{c['id']}: is a neighbour in novelty.json, but the author's decision was {choice!r}")
    return out


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] != "shape":
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    paper = sys.argv[2]
    problems = [e for path, c in load(paper) for e in shape(path, c)]
    problems += [f"{path}: passages[{i}] crop {p['crop']} does not exist" for path, c in load(paper)
                 for i, p in enumerate(c.get("passages") or []) if p.get("crop")
                 and not os.path.isfile(os.path.join(paper, p["crop"]))]
    print("\n".join(problems))
    sys.exit(1 if problems else 0)
