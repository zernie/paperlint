"""Merge the readers' per-neighbour files into a paper's novelty table.

Usage: python3 -I novelty_cells.py <paper-dir>
  reads <paper-dir>/siblings/cells/<id>.json, one per neighbour, each {"id", "read", "coverage", "cells":
  {claim: {piece: cell}}}, and writes their read, coverage and cells into siblings/novelty.json; exit 1, writing
  nothing, if a file names a neighbour, claim or piece the table does not have.

One reader agent per neighbour writes its own file, so parallel readers never edit the same file; the files
are the record of each read, and novelty.json is merged from them. check_novelty.py fails while novelty.json is
behind any of them. The neighbour list, the claims and their pieces stay owned by novelty.json.
"""
import copy
import json
import os
import sys

OWNED = ("read", "coverage")  # neighbour fields a cells file owns; plus that neighbour's cells in every claim


def load(paper):
    """[(relative path, parsed file)] for every siblings/cells/*.json, sorted by name."""
    folder = os.path.join(paper, "siblings", "cells")
    if not os.path.isdir(folder):
        return []
    names = sorted(n for n in os.listdir(folder) if n.endswith(".json"))
    return [(f"siblings/cells/{n}", json.load(open(os.path.join(folder, n), encoding="utf-8"))) for n in names]


def merge(data, files):
    """(novelty table with every file merged in, errors). Pure: `data` is not changed."""
    out = copy.deepcopy(data)
    by_id = {n["id"]: n for n in out.get("neighbours", [])}
    claims = {c["id"]: c for c in out.get("claims", [])}
    errors = []
    for path, f in files:
        nid = f.get("id")
        if os.path.basename(path) != f"{nid}.json":
            errors.append(f"{path}: id {nid!r} does not match the file name")
            continue
        if nid not in by_id:
            errors.append(f"{path}: no neighbour {nid!r} in novelty.json (the neighbour list is novelty.json's)")
            continue
        for key in OWNED:
            if key in f:
                by_id[nid][key] = f[key]
        # The file is the whole record of this neighbour: a claim it leaves out has no cells for it (unknown),
        # never the cells of an earlier read, whose 'no' would still grant novelty.
        given = f.get("cells") or {}
        for cid in claims.keys() - given.keys():
            claims[cid].get("cells", {}).pop(nid, None)
        for cid, cells in given.items():
            if cid not in claims:
                errors.append(f"{path}: claim {cid!r} is not in novelty.json")
                continue
            unknown = [p for p in cells if p not in claims[cid].get("pieces", {})]
            errors += [f"{path}: {cid} has no piece {p!r}" for p in unknown]
            if not unknown:
                claims[cid].setdefault("cells", {})[nid] = cells
    return out, errors


def behind(data, files):
    """Paths of cells files whose content novelty.json does not hold yet."""
    results = [(path, merge(data, [(path, f)])) for path, f in files]
    return [path for path, (merged, errs) in results if not errs and merged != data]


def main():
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    paper = sys.argv[1]
    path = os.path.join(paper, "siblings", "novelty.json")
    raw = open(path, encoding="utf-8").read()
    files = load(paper)
    merged, errors = merge(json.loads(raw), files)
    for e in errors:
        print("ERROR " + e, file=sys.stderr)
    if errors:
        sys.exit(1)
    text = json.dumps(merged, indent=2, ensure_ascii=False) + ("\n" if raw.endswith("\n") else "")
    if text != raw:
        open(path, "w", encoding="utf-8").write(text)
    print(f"merged {len(files)} cells file(s) into {os.path.relpath(path, paper)}")


if __name__ == "__main__":
    main()
