#!/usr/bin/env python3
"""Linter-rule config usage via Sourcegraph: how many REPOSITORIES name each linter rule in a linter config (Sourcegraph).

  python3 -I rule_config_count_sg.py <rule-ids.json> <out.tsv>     (needs SRC_ACCESS_TOKEN)
  python3 -I rule_config_count_sg.py --selftest

Runs 1-2 (rule_config_count.py, GitHub code search) answered 30 of 240 and 14 of 66 queries before their step caps:
code search refuses far below its documented 10 per minute. This run asks Sourcegraph's streaming search API
(sourcegraph.com, an account access token) once per rule, over every repository it indexes
(count:all), and counts distinct repositories (select:repo), not files.

The pattern is the rule id between quotes, as configs write it ("ANN001", 'import/order'), so a Ruff group selector
such as D or E matches the selector itself and not every D-prefixed word; it still also matches any other quoted
"D" in those files, so group selectors stay flagged. A preset that turns the rule on without naming it is not
counted; a mention that turns it off is. Sourcegraph skips forks and
archived repositories by default. Output, one row per rule: tool, rule_id, status, repos, match_count, skipped,
alerts.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://sourcegraph.com"
FILE_RE = {"eslint": r"(^|/)(eslint\.config\.(js|mjs|cjs|ts|mts|cts)|\.eslintrc(\.(json|js|cjs|yml|yaml))?)$",
           "ruff": r"(^|/)(pyproject|ruff|\.ruff)\.toml$"}
GROUP = {"D", "E", "W", "DTZ", "PTH"}
PAUSE = float(os.environ.get("COUNT_PAUSE", "2"))


def query(tool, rid):
    return f"file:{FILE_RE[tool]} patterntype:regexp [\"']{re.escape(rid)}[\"'] count:all select:repo timeout:3m"


def parse_stream(lines):
    """Sourcegraph server-sent events → (repos, match_count, skipped, alerts)."""
    repos, progress, alerts, event = set(), {}, [], None
    for raw in lines:
        line = raw.decode("utf-8", "replace").rstrip("\r\n") if isinstance(raw, bytes) else raw.rstrip("\r\n")
        if line.startswith("event:"):
            event = line[6:].strip()
        elif line.startswith("data:"):
            data = json.loads(line[5:])
            if event == "matches":
                repos.update(m["repository"] for m in data if m.get("repository"))
            elif event == "progress":
                progress = data
            elif event == "alert":
                alerts.append(data.get("title", ""))
    skipped = sorted({s.get("reason", "") for s in progress.get("skipped", [])})
    return repos, progress.get("matchCount"), skipped, alerts


def search(q, tok):
    url = f"{BASE}/.api/search/stream?" + urllib.parse.urlencode({"q": q})
    req = urllib.request.Request(url, headers={"Authorization": f"token {tok}", "Accept": "text/event-stream",
                                               "User-Agent": "rule-config-count (Sourcegraph stream API)"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                return 200, *parse_stream(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504) and attempt < 3:
                wait = int(e.headers.get("Retry-After") or 0) or 60
                print(f"  {e.code}, waiting {wait} s", flush=True)
                time.sleep(wait)
                continue
            return e.code, set(), None, [], [e.read()[:200].decode("utf-8", "replace")]
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"  {e}, waiting 30 s", flush=True)
            time.sleep(30)
    return 0, set(), None, [], ["no answer after 4 attempts"]


def main(ids_file, out):
    tok = os.environ.get("SRC_ACCESS_TOKEN")
    if not tok:
        sys.exit("no SRC_ACCESS_TOKEN in the environment")
    ids = json.load(open(ids_file))
    done = set()
    if os.path.isfile(out):
        done = {tuple(line.split("\t")[:2]) for line in open(out).read().splitlines()[1:] if "\t200\t" in line}
    else:
        open(out, "w").write("tool\trule_id\tstatus\trepos\tmatch_count\tskipped\talerts\tgroup_selector\n")
    for tool, rid in ids:
        if (tool, rid) in done:
            continue
        status, repos, mc, skipped, alerts = search(query(tool, rid), tok)
        row = [tool, rid, status, len(repos), mc, ",".join(skipped), " | ".join(alerts), rid in GROUP and tool == "ruff"]
        with open(out, "a") as f:
            f.write("\t".join(str(x) for x in row) + "\n")
        print(*row, flush=True)
        time.sleep(PAUSE)


def selftest():
    stream = [
        "event: progress", 'data: {"matchCount": 0, "skipped": []}', "",
        "event: matches", 'data: [{"type": "repo", "repository": "github.com/a/x"}, {"type": "repo", "repository": "github.com/b/y"}]', "",
        "event: matches", 'data: [{"type": "repo", "repository": "github.com/a/x"}]', "",
        "event: alert", 'data: {"title": "Search timed out"}', "",
        "event: progress", 'data: {"matchCount": 3, "skipped": [{"reason": "shard-timeout"}, {"reason": "shard-timeout"}]}', "",
        "event: done", "data: {}", "",
    ]
    repos, mc, skipped, alerts = parse_stream(stream)
    assert repos == {"github.com/a/x", "github.com/b/y"}, repos
    assert (mc, skipped, alerts) == (3, ["shard-timeout"], ["Search timed out"]), (mc, skipped, alerts)
    empty = parse_stream(["event: progress", 'data: {"matchCount": 0}', "event: done", "data: {}"])
    assert empty == (set(), 0, [], []), empty
    q = query("ruff", "D")
    assert "[\"']D[\"']" in q and "pyproject" in q and "count:all" in q and "select:repo" in q, q
    assert "import/order" in query("eslint", "import/order")
    assert r"@typescript\-eslint/no\-explicit\-any" in query("eslint", "@typescript-eslint/no-explicit-any")
    print("ok: repos de-duplicated, last progress wins, skipped reasons and alerts kept, empty stream is empty, quoted pattern")


if __name__ == "__main__":
    if sys.argv[1:] == ["--selftest"]:
        selftest()
    elif len(sys.argv) == 3:
        main(*sys.argv[1:])
    else:
        sys.exit(__doc__)
