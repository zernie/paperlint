#!/usr/bin/env python3
"""Repository frame: commit count and rules-file presence at HEAD, 100 repositories per GraphQL query.

  python3 -I presence.py check --names <file: one owner/name per line> --out <tsv>

Per repository: default-branch commit count (history.totalCount), fork / archived / stars / created_at, and
whether each root path of a known agent rules file exists on the default branch at HEAD, exact case (git paths are), plus
the entries of the rules directories one level down (.claude/rules, .cursor/rules, .windsurf/rules,
.clinerules, .github/instructions). Deeper nesting is read from git trees separately. Resumable: repositories already in
<tsv> are skipped; a query that fails is retried, then its repositories are written with status "error" and
asked again on the next run, so the reader takes the LAST row per repository. Token: GITHUB_TOKEN (1,000 GraphQL points per hour per repository in Actions).
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

ROOT_FILES = ("CLAUDE.md", "CLAUDE.local.md", "AGENTS.md", "AGENTS.override.md", "GEMINI.md", ".gemini/system.md",
              ".cursorrules", ".windsurfrules", ".github/copilot-instructions.md")
RULE_DIRS = (".claude/rules", ".cursor/rules", ".windsurf/rules", ".clinerules", ".github/instructions")
BATCH = int(os.environ.get("PRESENCE_BATCH", "100"))
# The default-branch commit count is the slow part of the query (GitHub counts it on the fly; spike 31.10: 100
# and 50 repositories per query were cut off with 502, 25 took ~8 s). PRESENCE_COMMITS=0 leaves it out.
COMMITS = ("target { ... on Commit { history(first: 0) { totalCount } } }"
           if os.environ.get("PRESENCE_COMMITS", "1") != "0" else "")
COLS = ("repo", "status", "commits", "fork", "archived", "stars", "created_at", "default_branch",
        "root_files", "dir_entries", "clinerules_kind")


def alias(i):
    return f"r{i}"


def query_for(names):
    parts = []
    for i, full in enumerate(names):
        owner, name = full.split("/", 1)
        files = " ".join(f'f{j}: object(expression: "HEAD:{p}") {{ __typename }}' for j, p in enumerate(ROOT_FILES))
        dirs = " ".join(f'd{j}: object(expression: "HEAD:{p}") {{ __typename ... on Tree {{ entries {{ name type }} }} }}'
                        for j, p in enumerate(RULE_DIRS))
        parts.append(
            f'{alias(i)}: repository(owner: {json.dumps(owner)}, name: {json.dumps(name)}) {{ '
            f'isFork isArchived stargazerCount createdAt '
            f'defaultBranchRef {{ name {COMMITS} }} '
            f'{files} {dirs} }}')
    return "query { rateLimit { cost remaining resetAt } " + " ".join(parts) + " }"


def post(q, tok):
    req = urllib.request.Request("https://api.github.com/graphql", data=json.dumps({"query": q}).encode(),
                                 headers={"Authorization": f"Bearer {tok}", "User-Agent": "repo-frame",
                                          "Content-Type": "application/json"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.loads(r.read())
                data["_reset"] = r.headers.get("x-ratelimit-reset")
                return data
        except urllib.error.HTTPError as e:
            print(f"HTTP {e.code} attempt {attempt}", flush=True)
            if e.code in (502, 504):
                return {"errors": [{"message": f"HTTP {e.code}"}], "too_big": True}
            if e.code in (403, 429, 503) and attempt < 4:
                time.sleep(int(e.headers.get("Retry-After") or 0) or 60 * (attempt + 1))
                continue
            return {"errors": [{"message": f"HTTP {e.code}"}]}
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"{type(e).__name__} attempt {attempt}", flush=True)
            return {"errors": [{"message": type(e).__name__}], "too_big": True}
    return {"errors": [{"message": "gave up"}]}


def rate_limited(data):
    return any((e or {}).get("type") == "RATE_LIMIT" for e in data.get("errors") or [])


def wait_for_reset(data):
    """GitHub answers an exhausted GraphQL budget with HTTP 200 and errors[type=RATE_LIMIT], without rateLimit in
    the body. The budget is shared by every job of the installation (run 41214730264: six shards spent it within
    the hour, and 480 batches were written as errors in seconds). Sleep until x-ratelimit-reset (plus 5 s), or
    60 s when the header is missing; never longer than an hour."""
    reset = data.get("_reset")
    secs = (int(reset) - time.time() + 5) if reset and str(reset).isdigit() else 60
    secs = max(5, min(3600, secs))
    print(f"rate limit exhausted, sleeping {int(secs)}s", flush=True)
    time.sleep(secs)


def ask(batch, tok):
    """Rows for one batch. A query GitHub cuts off (502/504, client timeout) is split in half, down to one
    repository, so the batch size finds itself instead of being guessed. An exhausted budget is waited out and the
    same batch asked again, never written as error rows."""
    data = post(query_for(batch), tok)
    while rate_limited(data):
        wait_for_reset(data)
        data = post(query_for(batch), tok)
    if data.get("too_big") and len(batch) > 1:
        half = len(batch) // 2
        print(f"split {len(batch)} -> {half} + {len(batch) - half}", flush=True)
        a, ra = ask(batch[:half], tok)
        b, rb = ask(batch[half:], tok)
        return a + b, rb or ra
    nodes = data.get("data") or {}
    rows = [row_of(full, nodes.get(alias(i))) if "data" in data else {"repo": full, "status": "error"}
            for i, full in enumerate(batch)]
    if "data" not in data:
        print(f"error batch of {len(batch)}: {data.get('errors')}", flush=True)
    return rows, nodes.get("rateLimit") or {}


def row_of(full, node):
    if node is None:
        return {"repo": full, "status": "missing"}
    ref = node.get("defaultBranchRef") or {}
    hist = ((ref.get("target") or {}).get("history") or {})
    root = [p for j, p in enumerate(ROOT_FILES) if (node.get(f"f{j}") or {}).get("__typename") == "Blob"]
    entries = []
    cline_kind = ""
    for j, p in enumerate(RULE_DIRS):
        obj = node.get(f"d{j}") or {}
        if p == ".clinerules":
            cline_kind = {"Blob": "file", "Tree": "dir"}.get(obj.get("__typename"), "")
        entries += [f"{p}/{e['name']}" for e in obj.get("entries") or [] if e.get("type") in ("blob", "tree")]
    if cline_kind == "file":
        root.append(".clinerules")
    return {"repo": full, "status": "ok", "commits": hist.get("totalCount"), "fork": node.get("isFork"),
            "archived": node.get("isArchived"), "stars": node.get("stargazerCount"),
            "created_at": node.get("createdAt"), "default_branch": ref.get("name"),
            "root_files": ",".join(root), "dir_entries": ",".join(entries), "clinerules_kind": cline_kind}


def check(names_file, out):
    tok = os.environ.get("GITHUB_TOKEN")
    if not tok:
        sys.exit("no GITHUB_TOKEN in the environment")
    names = [n.strip() for n in open(names_file, encoding="utf-8") if n.strip()]
    done = set()
    if os.path.isfile(out):
        with open(out, encoding="utf-8") as f:
            done = {line.split("\t")[0] for line in f.read().splitlines()[1:] if "\terror\t" not in line + "\t"}
    else:
        with open(out, "w", encoding="utf-8") as f:
            f.write("\t".join(COLS) + "\n")
    todo = [n for n in names if n not in done]
    for start in range(0, len(todo), BATCH):
        batch = todo[start:start + BATCH]
        t0 = time.time()
        rows, rl = ask(batch, tok)
        with open(out, "a", encoding="utf-8") as f:
            for r in rows:
                f.write("\t".join(str(r.get(c, "")) for c in COLS) + "\n")
        print(f"batch took {time.time() - t0:.1f}s", flush=True)
        print(f"{start + len(batch)}/{len(todo)}\tcost {rl.get('cost')}\tremaining {rl.get('remaining')}", flush=True)
        if rl.get("remaining") is not None and rl["remaining"] < 20:
            reset = rl.get("resetAt", "")
            print(f"rate limit low, sleeping until {reset}", flush=True)
            time.sleep(300)


if __name__ == "__main__":
    a = sys.argv
    if len(a) == 6 and a[1] == "check" and a[2] == "--names" and a[4] == "--out":
        check(a[3], a[5])
    else:
        sys.exit(__doc__)
