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
    template = f"created:<day> stars:>=10 fork:false pushed:>={active_since.isoformat()}"
    os.makedirs(out, exist_ok=True)
    tsv = os.path.join(out, "b-days.tsv")
    # Resumable: a row is written the moment its answer arrives, and a day already answered with 200 is not
    # asked again, so a job cut off by its time cap keeps what it has and the next run continues from there.
    done = {}
    if os.path.isfile(tsv):
        with open(tsv, encoding="utf-8") as f:
            for line in f.read().splitlines()[1:]:
                day, status, total, incomplete, msg = (line.split("\t") + [""] * 5)[:5]
                done[day] = {"day": day, "status": int(status), "total_count": int(total) if total not in ("", "None") else None,
                             "incomplete_results": incomplete == "True", "message": msg}
    else:
        with open(tsv, "w", encoding="utf-8") as f:
            f.write("day\tstatus\ttotal_count\tincomplete_results\tmessage\n")
    todo = [d for d in days if done.get(d.isoformat(), {}).get("status") != 200]
    for i, day in enumerate(todo):
        if i:
            time.sleep(PAUSE)
        status, total, incomplete, msg = search(template.replace("<day>", day.isoformat()), tok)
        done[day.isoformat()] = {"day": day.isoformat(), "status": status, "total_count": total,
                                 "incomplete_results": incomplete, "message": msg}
        with open(tsv, "a", encoding="utf-8") as f:
            f.write(f"{day}\t{status}\t{total}\t{incomplete}\t{msg}\n")
        print(f"{day}\t{status}\t{total}\t{incomplete}\t{msg}", flush=True)
    rows = [done[d.isoformat()] for d in days if d.isoformat() in done]
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
        "days_not_asked_yet": len(days) - len(rows),
        "days_incomplete": sum(1 for r in ok if r["incomplete_results"]),
        "candidates": sum(totals), "days_over_1000": len(over),
        "enumeration_requests": requests, "enumeration_minutes_at_30_per_min": minutes,
        "stop_rule": {"candidates_over": STOP_CANDIDATES, "minutes_over": STOP_MINUTES,
                      "hit": sum(totals) > STOP_CANDIDATES or minutes > STOP_MINUTES},
    }
    with open(os.path.join(out, "b-size.json"), "w", encoding="utf-8") as f:
        json.dump({"query_template": template, "estimate": est}, f, indent=1)
    print(json.dumps(est))


def windows_for(day, total, tok, template):
    """A day with <= 1,000 results is one window; a larger one is split into its 24 hours (UTC)."""
    if (total or 0) <= 1000:
        return [day]
    return [f"{day}T{h:02d}:00:00Z..{day}T{h:02d}:59:59Z" for h in range(24)]


def fetch_page(q, page, tok):
    url = "https://api.github.com/search/repositories?" + urllib.parse.urlencode({"q": q, "per_page": 100, "page": page})
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
        "Authorization": f"Bearer {tok}", "User-Agent": "repo-frame"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return 200, json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (403, 429) and attempt < 4:
                time.sleep(int(e.headers.get("Retry-After") or 0) or 60)
                continue
            return e.code, {"message": e.read()[:200].decode("utf-8", "replace")}
        except (urllib.error.URLError, TimeoutError):
            time.sleep(10)
    return 0, {"message": "gave up"}


CAND_COLS = ("id", "full_name", "created_at", "pushed_at", "stargazers_count", "language", "fork", "archived",
             "default_branch", "size")


def enumerate_windows(pinned_file, out):
    """Step 3a: every repository of every window, paged to the end. Resumable: a window is recorded in
    b-windows.tsv only when all its pages are in; candidates already written are kept and de-duplicated by id."""
    tok = os.environ.get("GITHUB_TOKEN")
    if not tok:
        sys.exit("no GITHUB_TOKEN in the environment")
    pinned = dt.date.fromisoformat(open(pinned_file).read().strip())
    active_since = pinned.replace(year=pinned.year - 1)
    template = f"created:<w> stars:>=10 fork:false pushed:>={active_since.isoformat()}"
    with open(os.path.join(out, "b-days.tsv"), encoding="utf-8") as f:
        days = [line.split("\t") for line in f.read().splitlines()[1:]]
    wfile, cfile = os.path.join(out, "b-windows.tsv"), os.path.join(out, "b-candidates.tsv")
    done = set()
    if os.path.isfile(wfile):
        with open(wfile, encoding="utf-8") as f:
            done = {line.split("\t")[0] for line in f.read().splitlines()[1:]}
    else:
        with open(wfile, "w", encoding="utf-8") as f:
            f.write("window\ttotal_count\tfetched\tincomplete_results\tstatus\n")
    if not os.path.isfile(cfile):
        with open(cfile, "w", encoding="utf-8") as f:
            f.write("\t".join(CAND_COLS) + "\n")
    for day, status, total, *_ in days:
        for w in windows_for(day, int(total) if total not in ("", "None") else None, tok, template):
            if w in done:
                continue
            q = template.replace("<w>", w)
            rows, tc, inc, st, page = [], None, False, 200, 1
            while True:
                time.sleep(PAUSE)
                st, data = fetch_page(q, page, tok)
                if st != 200:
                    break
                tc = data.get("total_count")
                inc = inc or bool(data.get("incomplete_results"))
                items = data.get("items", [])
                rows += items
                if len(items) < 100 or page * 100 >= min(tc or 0, 1000):
                    break
                page += 1
            if st != 200:
                print(f"{w}\tstatus {st}\t{data.get('message')}", flush=True)
                continue  # not recorded as done: the next run asks it again
            with open(cfile, "a", encoding="utf-8") as f:
                for it in rows:
                    f.write("\t".join(str(it.get(c, "")) for c in CAND_COLS) + "\n")
            with open(wfile, "a", encoding="utf-8") as f:
                f.write(f"{w}\t{tc}\t{len(rows)}\t{inc}\t{st}\n")
            print(f"{w}\t{tc}\t{len(rows)}\t{inc}", flush=True)


if __name__ == "__main__":
    a = sys.argv
    if len(a) == 6 and a[1] == "size" and a[2] == "--pinned" and a[4] == "--out":
        size(a[3], a[5])
    elif len(a) == 6 and a[1] == "enumerate" and a[2] == "--pinned" and a[4] == "--out":
        enumerate_windows(a[3], a[5])
    else:
        sys.exit(__doc__)
