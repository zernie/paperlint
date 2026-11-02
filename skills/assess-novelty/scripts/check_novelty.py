"""Check a paper's novelty table against the neighbours' saved texts, the paper and its claims ledger.

Usage: python3 -I check_novelty.py <paper-dir>
  reads <paper-dir>/siblings/novelty.json, paper.tex, CLAIMS.md and each neighbour's saved text;
  prints each claim's computed verdict and its pieces x neighbours table; exit 1 on any error below.

The verdict is computed from the cells, never stored, over neighbours read in full:
  🔴 one neighbour has every piece · 🟡 the nearest misses exactly one, or a neighbour has both the object and
  the measure (the result) and differs only in setting · 🟢 every one misses two or more and none has the
  result · ⚪ a piece nobody has excluded yet could still complete a neighbour (an unread cell, or an
  abstract-only read).
Errors: a 'yes' cell without a quote or with a quote not in the text · a 'no' cell on an abstract-only
neighbour · a missing search source · a priority sentence in paper.tex (first / none of the studies /
to our knowledge / ...) not mapped to a 🟢 claim · CLAIMS.md disagreeing with the computed verdict ·
a 🟢 claim without a refutation file · a claim without a known type or an objection_answer.
A quote is a presence check (quote_match.py's matcher), not a proof that it supports the cell.
A neighbour read 'full' proves it with `coverage`, one quote per chunk of its text (novelty_coverage.py).
A work a refutation or a search surfaced is a candidate until the author decides on it (novelty_candidates.py):
undecided, or approved but not yet read, is an error.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves the script's own folder off the path
from quote_match import found, letters, norm  # noqa: E402
from novelty_coverage import coverage_errors  # noqa: E402
import novelty_candidates  # noqa: E402
import novelty_cells  # noqa: E402

SOURCES = ("venue-pc", "prev-edition", "arxiv-recent")
TYPES = {"new-object", "transfer", "installed-base", "instrument", "refutation", "replication"}
# The result itself: what is examined and what number comes out. A neighbour with both already reported the
# result, so the claim's delta over it is setting (population, comparator, instrument): 🟡 at best, never 🟢,
# however many setting pieces it misses (two setting 'no' cells made a taken claim free).
RESULT = ("object", "measure")
# Priority claims about prior work. Narrow on purpose: "the first row of Table 1" or "none of the 900
# prose blocks we examined" are not claims about anyone else's work and must stay silent.
VERB = r"(?:measure|score|stud|report|evaluat|test|run|check|compar|examin|ask|assess|validat)"
PRIORITY = re.compile(
    r"\bthe first (?:\S+ ){0,6}?(?:in (?:this|the) (?:literature|field|area)|to (?:measure|study|show|report))"
    r"|\b(?:we are|is|are) the first\b"
    r"|\bnone of the (?:\S+ ){0,4}(?:studies|works|papers|approaches|tools)\b"
    r"|\bnone of (?:them|these|those|this|that)(?: \S+){0,2}? " + VERB +
    r"|(?:^|[;:,] )none " + VERB +
    r"|\bno (?:\S+ )?(?:study|studies|work|paper|tool|approach)s? (?:we know of|we are aware of|to date|so far|has|have|had)\b"
    r"|\bno (?:prior|previous|existing|earlier) (?:work|study|studies|paper|tool)"
    r"|\bto (?:the best of )?our knowledge\b"
    r"|\b(?:literature|prior work|previous work|related work) (?:never|does not|has not)\b"
    r"|\b(?:nobody|no one) (?:has|had|have|did|does)\b",
    re.IGNORECASE,
)


def tex_sentences(tex):
    tex = re.sub(r"(?<!\\)%.*", "", tex)
    tex = re.sub(r"\\(?:cite|ref|label|eqref|autoref|cref|documentclass|usepackage|begin|end|input|include)\*?"
                 r"(?:\[[^\]]*\])?\{[^}]*\}", " ", tex)
    tex = re.sub(r"\\[a-zA-Z]+\*?(?:\[[^\]]*\])?", " ", tex)
    tex = tex.replace("~", " ").replace("{", "").replace("}", "").replace("\\%", "%").replace("\\", "")
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", re.sub(r"\s+", " ", tex)) if s.strip()]


def ledger_status(claims_md, row):
    for line in claims_md.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) > 1 and cells[0].strip("*") == row:
            for c in cells[1:]:
                for mark in ("🟢", "🟡", "🔴", "⚪"):
                    if c.startswith(mark) or c.startswith("**" + mark):
                        return mark
            return "no status"
    return None


def verdict(claim, neighbours):
    pieces = list(claim.get("pieces", {}))
    if not pieces or not neighbours:
        return "⚪", "no pieces or no neighbours"
    best = None
    open_ = []
    result = None  # a neighbour with the same object AND measure has the result; the rest is setting
    for n in neighbours:
        cells = claim.get("cells", {}).get(n["id"], {})
        has = {p: (cells.get(p) or {}).get("has", "unknown") for p in pieces}
        if n.get("read") != "full":
            has = {p: ("unknown" if v == "no" else v) for p, v in has.items()}
        yes = [p for p in pieces if has[p] == "yes"]
        no = [p for p in pieces if has[p] == "no"]
        if len(yes) == len(pieces):
            return "🔴", f"taken by {n['id']}"
        if result is None and all(has.get(p) == "yes" for p in RESULT):
            result = (n["id"], no)
        if not no:
            open_.append(n["id"])
        elif best is None or (len(no), -len(yes)) < (len(best[1]), -best[2]):
            best = (n["id"], no, len(yes))
    if open_:
        tail = f"; not free: {result[0]} has the object and the measure" if result else ""
        return "⚪", "could still be taken by " + ", ".join(open_) + tail
    if len(best[1]) == 1:
        return "🟡", f"nearest {best[0]} differs only in: {best[1][0]}"
    if result:
        return "🟡", (f"{result[0]} has the object and the measure; differs only in setting: "
                      + ", ".join(result[1]))
    return "🟢", f"nearest {best[0]} misses {len(best[1])}: " + ", ".join(best[1])


def main():
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    paper = sys.argv[1]
    data = json.load(open(os.path.join(paper, "siblings", "novelty.json"), encoding="utf-8"))
    claims_path = os.path.join(paper, "CLAIMS.md")
    claims_md = open(claims_path, encoding="utf-8").read() if os.path.exists(claims_path) else ""
    errors = []

    cell_files = novelty_cells.load(paper)
    errors += novelty_cells.merge(data, cell_files)[1]
    errors += [f"novelty.json is behind {p}: run novelty_cells.py" for p in novelty_cells.behind(data, cell_files)]

    def saved_text(rel):
        p = os.path.join(paper, rel)
        return open(p, encoding="utf-8", errors="replace").read() if os.path.isfile(p) else None
    errors += novelty_candidates.errors(paper, data, novelty_candidates.load(paper),
                                        lambda q, t: found(q, norm(t), letters(t)), saved_text)

    have = {s.get("source") for s in data.get("searched", []) if (s.get("how") or "").strip()}
    errors += [f"searched: no '{s}' search recorded (source + how)" for s in SOURCES if s not in have]

    neighbours = data.get("neighbours", [])
    texts = {}
    for n in neighbours:
        path = os.path.join(paper, n.get("text") or "")
        if n.get("read") == "full" and not os.path.isfile(path):
            errors.append(f"neighbour {n['id']}: read 'full' but no text at {n.get('text')}")
        if os.path.isfile(path):
            t = open(path, encoding="utf-8", errors="replace").read()
            texts[n["id"]] = (norm(t), letters(t))
            if n.get("read") == "full":
                errors += coverage_errors(n["id"], t, n.get("coverage"))

    verdicts = {}
    for c in data.get("claims", []):
        cid = c.get("id")
        if c.get("type") not in TYPES:
            errors.append(f"{cid}: type {c.get('type')!r} is not one of {sorted(TYPES)}")
        if not (c.get("objection_answer") or "").strip():
            errors.append(f"{cid}: no objection_answer (the sentence answering this type's standard objection)")
        for n in neighbours:
            for piece, cell in (c.get("cells", {}).get(n["id"]) or {}).items():
                has, quote = cell.get("has"), cell.get("quote")
                if has not in ("yes", "no", "unknown"):
                    errors.append(f"{cid}/{n['id']}/{piece}: has={has!r}, expected yes / no / unknown")
                if has == "no" and n.get("read") != "full":
                    errors.append(f"{cid}/{n['id']}/{piece}: 'no' from a neighbour read only as an abstract;"
                                  " absence needs the full text")
                if has == "yes":
                    if not quote:
                        errors.append(f"{cid}/{n['id']}/{piece}: 'yes' without a quote")
                    elif n["id"] not in texts:
                        errors.append(f"{cid}/{n['id']}/{piece}: 'yes' but no text to check the quote against"
                                      f" (text: {n.get('text')!r})")
                    elif not found(quote, *texts[n["id"]]):
                        errors.append(f"{cid}/{n['id']}/{piece}: quote not found in {n.get('text')}: {quote[:80]!r}")
        v, why = verdict(c, neighbours)
        verdicts[cid] = v
        row = c.get("ledger")
        # A design-stage claim (a planned measurement, not in paper.tex yet) has no CLAIMS.md row until it enters the
        # text; "planned": true says so explicitly, so a forgotten ledger on an ordinary claim still fails.
        status = ledger_status(claims_md, row) if row else None
        if row is None and c.get("planned") is True:
            pass
        elif status is None:
            errors.append(f"{cid}: ledger row {row!r} not found in CLAIMS.md")
        elif status != v:
            errors.append(f"{cid}: CLAIMS.md row {row} says {status}, the cells give {v} ({why})")
        if v == "🟢":
            ref = c.get("refutation") or {}
            if not ref.get("file"):
                errors.append(f"{cid}: 🟢 without a refutation pass (refutation.file)")
            elif not os.path.isfile(os.path.join(paper, ref["file"])):
                errors.append(f"{cid}: refutation file {ref['file']} does not exist")
        print(f"{cid}  {v}  {why}")
        print(table(c, neighbours))

    tex_path = os.path.join(paper, data.get("paper", "paper.tex"))
    entries = data.get("paper_sentences", [])
    sentences = [norm(s) for s in tex_sentences(open(tex_path, encoding="utf-8").read())]
    in_paper = lambda q: bool(q) and any(q in s or s in q for s in sentences)  # noqa: E731
    # Every entry still in the paper is judged on its own, whether or not the detector finds its sentence:
    # the skill tells the author to add the phrasings it misses. An entry whose sentence was since
    # rewritten records an earlier run and is not judged.
    for e in entries:
        cl, quote = e.get("claim"), e.get("quote", "")
        if cl is None:
            if not (e.get("not_priority") or "").strip():
                errors.append(f"paper_sentences: {quote[:80]!r} has no claim and no not_priority reason")
        elif verdicts.get(cl) != "🟢" and in_paper(norm(quote)):
            errors.append(f"paper.tex: priority sentence rests on {cl}, which is "
                          f"{verdicts.get(cl, 'not a claim')}, not 🟢: {quote[:120]!r}")
    mapped = [norm(e.get("quote", "")) for e in entries]
    for s in tex_sentences(open(tex_path, encoding="utf-8").read()):
        if PRIORITY.search(s) and not any(q and (q in norm(s) or norm(s) in q) for q in mapped):
            errors.append(f"paper.tex: priority sentence not in paper_sentences: {s[:120]!r}")

    one = (data.get("one_new_result") or {}).get("claim")
    if one and one not in verdicts:
        errors.append(f"one_new_result names {one!r}, which is not a claim")

    for e in errors:
        print("ERROR " + e, file=sys.stderr)
    sys.exit(1 if errors else 0)


def table(c, neighbours):
    pieces = list(c.get("pieces", {}))
    mark = {"yes": "✅", "no": "❌"}
    head = "| piece | " + " | ".join(n["id"] + ("" if n.get("read") == "full" else " (abstract)") for n in neighbours) + " |"
    rows = [head, "|" + "---|" * (len(neighbours) + 1)]
    for p in pieces:
        cells = [mark.get(((c.get("cells", {}).get(n["id"]) or {}).get(p) or {}).get("has"), "·") for n in neighbours]
        rows.append(f"| {p} | " + " | ".join(cells) + " |")
    return "\n".join(rows) + "\n"


if __name__ == "__main__":
    main()
