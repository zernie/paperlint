#!/usr/bin/env python3
"""Size a frame of GitHub repositories by creation day, with GitHub repository search.

  python3 -I stratum_b.py size --pinned <pinned-date.txt> --out <dir>

One search per creation day from 2025-07-01 to the pinned date, per_page=1, query
  created:<day> stars:>=10 fork:false pushed:>=<pinned date minus one year>
Writes <out>/b-days.tsv (day, status, total_count, incomplete_results) and <out>/b-size.json (the sum, the
days over 1,000 that must be split by hour, the requests and minutes enumeration would need, and the stop
rule applied to them). Token: GITHUB_TOKEN.
"""
import datetime as dt
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

START = dt.date(2025, 7, 1)
PAUSE = 2.5  # seconds: repository search allows 30 requests per minute with a token
STOP_CANDIDATES = 200_000  # stop rule
STOP_MINUTES = 300


def search(q, tok):
    url = "https://api.github.com/search/repositories?" + urllib.parse.urlencode({"q": q, "per_page": 1})
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Authorization": f"Bearer {tok}",
        "User-Agent": "repo-frame",
    })
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read())
                return 200, data.get("total_count"), data.get("incomplete_results"), ""
        except urllib.error.HTTPError as e:
            wait = int(e.headers.get("Retry-After") or 0) or (60 if e.code in (403, 429) else 0)
            if e.code in (403, 429) and attempt < 3:
                time.sleep(wait)
                continue
            return e.code, None, None, e.read()[:200].decode("utf-8", "replace")
    return 0, None, None, "gave up"


def size(pinned_file, out):
    tok = os.environ.get("GITHUB_TOKEN")
    if not tok:
        sys.exit("no GITHUB_TOKEN in the environment")
    pinned = dt.date.fromisoformat(open(pinned_file).read().strip())
    active_since = pinned.replace(year=pinned.year - 1)
    days = [START + dt.timedelta(d) for d in range((pinned - START).days + 1)]
    rows = []
    for i, day in enumerate(days):
        if i:
            time.sleep(PAUSE)
        q = f"created:{day.isoformat()} stars:>=10 fork:false pushed:>={active_since.isoformat()}"
        status, total, incomplete, msg = search(q, tok)
        rows.append({"day": day.isoformat(), "query": q, "status": status, "total_count": total,
                     "incomplete_results": incomplete, "message": msg})
        print(f"{day}\t{status}\t{total}\t{incomplete}\t{msg}", flush=True)
    ok = [r for r in rows if r["status"] == 200]
    totals = [r["total_count"] or 0 for r in ok]
    over = [r["day"] for r in ok if (r["total_count"] or 0) > 1000]
    # enumeration: 100 per page; a day over 1,000 is split into 24 hours (one sizing search each)
    pages = sum(math.ceil(t / 100) for t in totals)
    requests = pages + 24 * len(over)
    minutes = math.ceil(requests * PAUSE / 60)
    est = {
        "pinned_date": pinned.isoformat(), "active_since": active_since.isoformat(),
        "days": len(days), "days_answered": len(ok), "days_failed": len(rows) - len(ok),
        "days_incomplete": sum(1 for r in ok if r["incomplete_results"]),
        "candidates": sum(totals), "days_over_1000": len(over),
        "enumeration_requests": requests, "enumeration_minutes_at_30_per_min": minutes,
        "stop_rule": {"candidates_over": STOP_CANDIDATES, "minutes_over": STOP_MINUTES,
                      "hit": sum(totals) > STOP_CANDIDATES or minutes > STOP_MINUTES},
    }
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "b-days.tsv"), "w", encoding="utf-8") as f:
        f.write("day\tstatus\ttotal_count\tincomplete_results\tmessage\n")
        for r in rows:
            f.write(f"{r['day']}\t{r['status']}\t{r['total_count']}\t{r['incomplete_results']}\t{r['message']}\n")
    with open(os.path.join(out, "b-size.json"), "w", encoding="utf-8") as f:
        json.dump({"query_template": rows[0]["query"] if rows else None, "estimate": est}, f, indent=1)
    print(json.dumps(est))


if __name__ == "__main__":
    a = sys.argv
    if len(a) == 6 and a[1] == "size" and a[2] == "--pinned" and a[4] == "--out":
        size(a[3], a[5])
    else:
        sys.exit(__doc__)
