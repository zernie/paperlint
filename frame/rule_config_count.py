#!/usr/bin/env python3
"""Linter-rule config usage: how many linter config files name each linter rule explicitly (GitHub code search).

  python3 -I rule_config_count.py <rule-ids.json> <out.tsv>

Readings taken from other repositories' configurations exist only for rules other repositories configure. Input:
[[tool, rule_id], ...], a list of linter rules. For each rule, one code-search query per config file name (ESLint: eslint.config.js,
eslint.config.mjs, .eslintrc.json, .eslintrc.js; Ruff: pyproject.toml, ruff.toml), the rule id quoted. Output, one
row per query: tool, rule_id, filename, status, total_count (FILES, not repositories), incomplete_results. A count
is an explicit-mention count: a preset that turns the rule on without naming it is not counted, a mention that
turns it off is. Ruff group selectors (D, E, W, DTZ, PTH) match far
more than the rule, so they are flagged in the summary. Runs where code search is reachable (GitHub Actions,
GITHUB_TOKEN; code search allows 10 requests per minute).
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

FILES = {"eslint": ["eslint.config.js", "eslint.config.mjs", ".eslintrc.json", ".eslintrc.js"],
         "ruff": ["pyproject.toml", "ruff.toml"]}
PAUSE = 6.5


def search(q, tok):
    url = "https://api.github.com/search/code?" + urllib.parse.urlencode({"q": q, "per_page": 1})
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json",
                                               "X-GitHub-Api-Version": "2022-11-28",
                                               "Authorization": f"Bearer {tok}", "User-Agent": "rule-config-count"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.loads(r.read())
                return 200, d.get("total_count"), d.get("incomplete_results")
        except urllib.error.HTTPError as e:
            if e.code in (403, 429) and attempt < 3:
                time.sleep(int(e.headers.get("Retry-After") or 0) or 60)
                continue
            return e.code, None, None
        except (urllib.error.URLError, TimeoutError):
            time.sleep(15)
    return 0, None, None


def main(ids_file, out):
    tok = os.environ.get("GITHUB_TOKEN")
    if not tok:
        sys.exit("no GITHUB_TOKEN in the environment")
    ids = json.load(open(ids_file))
    done = set()
    if os.path.isfile(out):
        done = {tuple(line.split("\t")[:3]) for line in open(out).read().splitlines()[1:] if "\t200\t" in line}
    else:
        open(out, "w").write("tool\trule_id\tfilename\tstatus\ttotal_count\tincomplete_results\n")
    for tool, rid in ids:
        for fn in FILES[tool]:
            if (tool, rid, fn) in done:
                continue
            status, total, inc = search(f'"{rid}" filename:{fn}', tok)
            with open(out, "a") as f:
                f.write(f"{tool}\t{rid}\t{fn}\t{status}\t{total}\t{inc}\n")
            print(tool, rid, fn, status, total, inc, flush=True)
            time.sleep(PAUSE)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(*sys.argv[1:])
