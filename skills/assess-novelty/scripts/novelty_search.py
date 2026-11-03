"""Which searches covered which claim: a 🟢 needs, in each of the three sources, a search that covered THAT claim.

A `searched` entry is {"source", "how", "date", "claims"?}. With "claims" (a non-empty list of claim ids) it covers
exactly the claims it names. Without it, it is a search of the whole table as it stood on its date: it covers the
claims whose "added" (YYYY-MM-DD, the day the claim entered the table) is on or before that date, and no claim
without "added". Why: a claim added a week after the last search inherited that search as if it had covered it, and
came out 🟢 against neighbours collected for other claims (paperlint#367). An entry counts only with a "how".

Migrating a table written before this: give each claim the day it entered the table as "added" (the searches
without "claims" dated on or after it then count for it), or name the claims in each entry's "claims".
"""
import datetime
import re

SOURCES = ("venue-pc", "prev-edition", "arxiv-recent")
DAY = re.compile(r"\d{4}-\d{2}-\d{2}")
SCOPE = 'a search without "claims" covers only the claims added on or before its date'


def day(value):
    """The date a YYYY-MM-DD string names, or None."""
    if not isinstance(value, str) or not DAY.fullmatch(value):
        return None
    try:
        return datetime.date.fromisoformat(value)
    except ValueError:
        return None


def named(entry):
    """The claim ids an entry names, or None for an entry without "claims" (a search of the whole table)."""
    return entry["claims"] if "claims" in entry else None


def well_formed(entry):
    ids = named(entry)
    return ids is None or (isinstance(ids, list) and bool(ids) and all(isinstance(i, str) for i in ids))


def covers(entry, claim):
    """Did this search cover this claim? A malformed entry covers nothing."""
    if not (entry.get("how") or "").strip() or not well_formed(entry):
        return False
    ids = named(entry)
    if ids is not None:
        return claim.get("id") in ids
    searched_on, added = day(entry.get("date")), day(claim.get("added"))
    return searched_on is not None and added is not None and added <= searched_on


def entry_errors(searched):
    """A malformed "claims", and an entry without "claims" whose date is not a date: either covers nothing.

    An id in "claims" that is no longer a claim is not an error: the entry records what was searched that day, and
    a claim dropped from the table later does not make the record wrong (a misspelt id leaves its claim uncovered,
    which claim_errors names).
    """
    def one(i, e):
        ids = named(e)
        if ids is None:
            return ([] if day(e.get("date")) else
                    [f"searched[{i}]: date {e.get('date')!r} is not YYYY-MM-DD; a search without \"claims\" covers"
                     " the claims added on or before its date"])
        return [] if well_formed(e) else [f'searched[{i}]: "claims" must be a non-empty list of claim ids, got {ids!r}']
    return [err for i, e in enumerate(searched) for err in one(i, e)]


def claim_errors(claim, searched, verdict):
    """A malformed "added"; and, for a 🟢, the sources with no search that covered the claim, with the fix."""
    cid = claim.get("id")
    bad_added = (["%s: \"added\" %r is not a date (YYYY-MM-DD)" % (cid, claim["added"])]
                 if "added" in claim and day(claim["added"]) is None else [])
    if verdict != "🟢":
        return bad_added
    missing = [s for s in SOURCES if not any(e.get("source") == s and covers(e, claim) for e in searched)]
    if not missing:
        return bad_added
    table_wide = any(e.get("source") in missing and named(e) is None and (e.get("how") or "").strip()
                     for e in searched)
    hint = ("" if not table_wide else
            f' (or set "added" to the day {cid} entered the table: {SCOPE})' if day(claim.get("added")) is None else
            f" ({SCOPE}; {cid} was added {claim['added']})")
    return bad_added + [f"{cid}: 🟢 but no search covers it in {', '.join(missing)}: search for {cid} there and"
                        f' record it with "claims": ["{cid}"]{hint}']
