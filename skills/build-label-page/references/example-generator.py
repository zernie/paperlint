#!/usr/bin/env python3
"""
example-generator.py — items.json -> a blind, single-page labelling app (HTML), and the answers back out.

A TEMPLATE, not a library: copy it next to the study, rename it, change the questions and the
allow-list, keep the guards. Standard library only. No network.

    python3 example-generator.py build  items.json  out/              -> out/page.html, out/key.json
    python3 example-generator.py export dump.json   out/key.json  data/ [--date YYYY-MM-DD]
                                                                       -> data/<study>-labels-<date>.json

`build` makes a page that stores each answer in the artifact's `db` store (the `db` capability of a
claude.ai Artifact; publish page.html with `capabilities: {db: {}}`). `export` turns what the store
holds into one JSON file for the study's data/ folder. Answers and familiarity values outside the
offered options are not counted (page and export read the same `allowed` lists): the item or group is
marked incomplete and reported (`invalid_answers`, `invalid_familiarity`). `dump.json` is the store's three collections:

    {"answers":  {"G001": {"answers": {"q": "v"}, "reasons": {"q": "why"}, "savedAt": "...", "source": "page"}, ...},
     "groups":   {"python": {"familiarity": "well", "savedAt": "...", "source": "page"}, ...},
     "practice": {"r1-P1": {"answers": {"q": "v"}, "savedAt": "...", "source": "page"}, ...}}

THE COMPREHENSION STEP (rule 8). The first screen shows every question with one real example per
answer (`example`, required on every option). Then the practice items: their answers are known
(`expected`, one per question), and after each one the page shows the expected answer and `why`.
The real items open once every practice item of the current `practice_round` is answered; a miss does
not lock them, it tells the labeller to tell the agent, who rewords the question, raises
`practice_round` and rebuilds. The page stores the FIRST practice answer only, in its own collection
(`practice`, documents `r<round>-P<n>`), so `export` keeps it out of the labels and writes it to
`<study>-practice-<date>.json`. An item card asks one question at a time; answered ones stay as a line.

items.json is checked once against the declared CONFIG_SCHEMA (`python3 example-generator.py schema`
prints it): every field's type, required or optional, non-empty strings, ids as strings of letters,
digits, - and _. A bad field stops the build and is named by its path, e.g. `questions[0].options[1].label`.

items.json:

    {
      "study": "demo-gold",                 # file-name stem
      "title": "Label these",               # 2-4 words; the page title
      "intro": "One or two sentences for the labeller.",
      "seed": 7,                            # fixes the order; change it and every id changes
      "groups": {"python": "Python", "go": "Go"},
      "labeller_knows": ["python"],         # optional: items of other groups are not put on the page
      "familiarity_question": "How well do you know {group}?",          # optional
      "questions": [{"id": "label", "text": "Is this correct?", "short": "correct?",   # short: shown in "still needs"
                     "options": [{"value": "yes", "label": "Yes", "example": "one real case, in a line",
                                  "icon": "✅"},                       # icon: optional
                                 {"value": "no", "label": "No", "example": "another real case",
                                  "icon": "❌", "ask_why": "What is wrong with it?"}]}],
                                            # ask_why: optional; this answer is incomplete until a reason is given
                                            # in any shown text, `backticks` render as code
      "practice": [{"body": "...", "expected": {"label": "yes"}, "why": "one line"}, ...],   # 3 or more
      "practice_round": 1,                  # optional; raise it after rewording, and the practice reopens
      "items": [{"source_id": "case-0412-b", "group": "python", "body": "...", "code": "...",
                 "context": "..."}]
    }
"""

import argparse
import hashlib
import json
import re
import sys
from datetime import date
from pathlib import Path

# ── THE LEAK GUARD ─────────────────────────────────────────────────────────────────────────────
# What an item may carry. `PAGE_FIELDS` reach the labeller; `PRIVATE_FIELDS` go to key.json only.
# Anything else on an item — a model answer, a checker verdict, a source label, a difficulty tag —
# stops the build: a blind page fails by what leaked in, and a field nobody listed is exactly the
# one nobody thought of. A NEW FIELD IS ADDED HERE ON PURPOSE, after asking "does this tell the
# labeller what the answer is, or where the item came from?" — never to make a build pass.
PAGE_FIELDS = ("group", "title", "body", "code", "context")
PRIVATE_FIELDS = ("source_id",)
ALLOWED_FIELDS = frozenset(PAGE_FIELDS) | frozenset(PRIVATE_FIELDS)

FAMILIARITY = (
    {"value": "well", "label": "Well"},
    {"value": "somewhat", "label": "Somewhat"},
    {"value": "not_really", "label": "Not really"},
)
# An id is a key of a plain JavaScript object on the page, so a name Object.prototype already has
# is refused: `answers["__proto__"] = v` sets the prototype and saves nothing, and an unanswered
# `answers["constructor"]` reads back a function instead of nothing.
RESERVED_NAMES = ("__proto__", "constructor", "prototype", "hasOwnProperty", "isPrototypeOf",
                  "propertyIsEnumerable", "toLocaleString", "toString", "valueOf",
                  "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__")
NAME_PATTERN = r"(?!(?:" + "|".join(RESERVED_NAMES) + r")$)[A-Za-z0-9_-]+"
SOURCES = ("page", "chat")

# ── THE CONFIG SCHEMA ──────────────────────────────────────────────────────────────────────────
# items.json is checked ONCE, against this declaration, before anything is built: every field's
# type, whether it is required, non-empty strings, ids as strings matching NAME_PATTERN. A refusal
# names the field's path (`questions[0].options[1].label`). A NEW FIELD IS A NEW LINE HERE; the
# build-label-page test walks this very table (`schema` prints it) with a wrong type, null and an
# empty value for each path, so a field without a line is a test failure, not a later review finding.
# The leak guard on items (ALLOWED_FIELDS) stays separate and stays closed.


def string(required=True, pattern=None):
    node = {"kind": "string", "required": required}
    return {**node, "pattern": pattern} if pattern else node


def integer(required=True):
    return {"kind": "integer", "required": required}


def array(items, required=True, min=0):
    return {"kind": "array", "required": required, "min": min, "items": items}


def mapping(values, key_pattern, required=True, min=0):
    return {"kind": "map", "required": required, "min": min, "key_pattern": key_pattern, "values": values}


def obj(fields, required=True, closed=True):
    return {"kind": "object", "required": required, "closed": closed, "fields": fields}


ITEM_SCHEMA = obj(
    {
        "source_id": string(),
        **{f: string(required=f in ("group", "body")) for f in PAGE_FIELDS},
    },
    closed=False,  # an unlisted item field is the leak guard's refusal, with its own message
)
# `icon` (an emoji) tells the buttons apart at a glance. No coloured side stripe on a button: it reads as
# decoration, not meaning (the build-label-page look test refuses one).
# `ask_why` (a prompt) makes the answer incomplete until the labeller says why: an approval page's "drop".
OPTION_SCHEMA = obj({"value": string(), "label": string(), "example": string(),
                     "icon": string(required=False), "ask_why": string(required=False)})
PRACTICE_SCHEMA = obj(
    {
        **{f: string(required=f == "body") for f in PAGE_FIELDS if f != "group"},
        "expected": mapping(string(), NAME_PATTERN, min=1),
        "why": string(),
    }
)
MIN_PRACTICE = 3
QUESTION_SCHEMA = obj(
    {
        "id": string(pattern=NAME_PATTERN),
        "text": string(),
        "short": string(required=False),
        "options": array(OPTION_SCHEMA, min=2),
    }
)
CONFIG_SCHEMA = obj(
    {
        "study": string(pattern=NAME_PATTERN),  # becomes a file name
        "title": string(),
        "intro": string(required=False),
        "seed": integer(),
        "groups": mapping(string(), NAME_PATTERN, min=1),  # ids become store document ids
        "labeller_knows": array(string(pattern=NAME_PATTERN), required=False),
        "familiarity_question": string(required=False),
        "questions": array(QUESTION_SCHEMA, min=1),
        "practice": array(PRACTICE_SCHEMA, min=MIN_PRACTICE),
        "practice_round": integer(required=False),
        "items": array(ITEM_SCHEMA, min=1),
    }
)


def at(path, name):
    return f"{path}.{name}" if path else name


def check_value(value, node, path):
    """Refuse the first place `value` departs from `node`; the message starts with the field's path."""
    where = path or "items.json"
    kind = node["kind"]
    if kind == "string":
        if not isinstance(value, str) or not value.strip():
            fail(f"{where}: must be a non-empty string, got {value!r}")
        if "pattern" in node and not re.fullmatch(node["pattern"], value):
            fail(f"{where}: {value!r} must be letters, digits, - and _ only")
    elif kind == "integer":
        if not isinstance(value, int) or isinstance(value, bool):
            fail(f"{where}: must be an integer, got {value!r}")
    elif kind == "array":
        if not isinstance(value, list):
            fail(f"{where}: must be a list, got {value!r}")
        if len(value) < node["min"]:
            fail(f"{where}: needs {node['min']} or more entries, has {len(value)}")
        for n, entry in enumerate(value):
            check_value(entry, node["items"], f"{path}[{n}]")
    elif kind == "map":
        if not isinstance(value, dict):
            fail(f"{where}: must be an object, got {value!r}")
        if len(value) < node["min"]:
            fail(f"{where}: needs {node['min']} or more entries, has {len(value)}")
        for key, entry in value.items():
            if not re.fullmatch(node["key_pattern"], key):
                fail(f"{at(path, key)}: key must be letters, digits, - and _ only")
            check_value(entry, node["values"], at(path, key))
    else:
        if not isinstance(value, dict):
            fail(f"{where}: must be an object, got {value!r}")
        for name, sub in node["fields"].items():
            if name in value:
                check_value(value[name], sub, at(path, name))
            elif sub["required"]:
                fail(f"{at(path, name)}: is required and missing")
        if node["closed"]:
            for name in value:
                if name not in node["fields"]:
                    fail(f"{at(path, name)}: not a known field (known: {', '.join(node['fields'])})")


def allowed_values(questions):
    """THE definition of a valid answer: the values the build offers, per question and for familiarity.
    The page script (`DATA.allowed`) and the exporter (`key.json`) both read this one result, so a
    stored value counts as an answer on the page exactly when it counts in the export."""
    return {
        "questions": {q["id"]: [o["value"] for o in q["options"]] for q in questions},
        # The answers that need a reason, per question: the page and the export read the same list.
        "needs_why": {q["id"]: [o["value"] for o in q["options"] if "ask_why" in o] for q in questions},
        "familiarity": [o["value"] for o in FAMILIARITY],
    }


def fail(message):
    sys.exit(f"REFUSED: {message}")


def read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        fail(f"cannot read {path} as JSON: {e}")


def check_config(cfg):
    check_value(cfg, CONFIG_SCHEMA, "")
    # What a schema cannot say: references between fields, and values that must differ.
    # The page heads each group with its label: two that read the same are two familiarity questions
    # the labeller cannot tell apart, exported under different group ids.
    heading = {}
    for gid, label in cfg["groups"].items():
        seen_as = label.strip().casefold()
        if seen_as in heading:
            fail(f"groups.{gid}: {label!r} reads the same as groups.{heading[seen_as]} — each group needs its own label")
        heading[seen_as] = gid
    for n, gid in enumerate(cfg.get("labeller_knows", [])):
        if gid not in cfg["groups"]:
            fail(f"labeller_knows[{n}]: {gid!r} is not in `groups`")
    seen = set()
    for qn, q in enumerate(cfg["questions"]):
        if q["id"] in seen:
            fail(f"questions[{qn}].id: {q['id']!r} is repeated")
        seen.add(q["id"])
        values = [o["value"] for o in q["options"]]
        if len(set(values)) != len(values):
            fail(f"questions[{qn}].options: values must be distinct, got {values}")
        # Two buttons that read the same store different answers no one can tell apart afterwards.
        shown = {}
        for i, o in enumerate(q["options"]):
            label = o["label"].strip().casefold()
            if label in shown:
                fail(f"questions[{qn}].options[{i}].label: {o['label']!r} reads the same as "
                     f"options[{shown[label]}].label — each button needs its own label")
            shown[label] = i
    check_practice(cfg)


def check_practice(cfg):
    """Each practice item knows the answer to every question, and only offered answers: a practice the
    page cannot score would let a misread question through unseen."""
    offered = {q["id"]: [o["value"] for o in q["options"]] for q in cfg["questions"]}
    if cfg.get("practice_round", 1) < 1:
        fail(f"practice_round: {cfg['practice_round']!r} — must be 1 or more")
    for n, item in enumerate(cfg["practice"]):
        where = f"practice[{n}].expected"
        for q, v in item["expected"].items():
            if q not in offered:
                fail(f"{where}.{q}: not a question of this page ({', '.join(offered)})")
            if v not in offered[q]:
                fail(f"{where}.{q}: {v!r} is not one of {', '.join(offered[q])}")
        for q in offered:
            if q not in item["expected"]:
                fail(f"{where}.{q}: every question needs its expected answer")


def practice_of(cfg):
    """The practice as the page shows it and the key keeps it: neutral ids P1, P2 … in the given order."""
    return [{"id": f"P{n + 1}", **item} for n, item in enumerate(cfg["practice"])]


def check_items(cfg):
    """The leak guard, and the references between items and the config. Refuses; never drops a field quietly."""
    ids = set()
    for n, item in enumerate(cfg["items"]):
        extra = sorted(set(item) - ALLOWED_FIELDS)
        if extra:
            fail(
                f"item #{n} ({item.get('source_id', '?')}) carries {', '.join(extra)}, which is not in the "
                f"allow-list {sorted(ALLOWED_FIELDS)}. A blind page shows the labeller the item and "
                f"nothing about the answer or the source. Remove the field from items.json; add it to "
                f"PAGE_FIELDS only if it is safe for the labeller to see."
            )
        sid = item["source_id"]
        if sid in ids:
            fail(f"items[{n}].source_id: {sid!r} is repeated")
        ids.add(sid)
        if item["group"] not in cfg["groups"]:
            fail(f"items[{n}].group: {item['group']!r} is not in `groups`")
    # A source id typed into a visible field gives the source away as well as a field would.
    # Short ids ("7") would match ordinary text, so only ids of four characters or more are looked for.
    for item in cfg["items"]:
        for other in cfg["items"]:
            sid = other["source_id"]
            if len(sid) < 4:
                continue
            pattern = re.compile(r"(?<![\w-])" + re.escape(sid) + r"(?![\w-])")
            for f in PAGE_FIELDS:
                if pattern.search(item.get(f, "")):
                    fail(
                        f"the source id {sid!r} appears in the visible `{f}` of item {item['source_id']}. "
                        f"Take it out of the text (or use source ids that are not natural words)."
                    )


def assign_ids(items, seed, key_path):
    """Neutral ids G001... in an order fixed by the seed, and kept when a key file already exists."""
    known, entries = {}, {}
    if key_path.exists():
        old = read_json(key_path)
        entries = old["ids"]
        if old.get("seed") != seed:
            fail(f"{key_path} was made with seed {old.get('seed')}; this config says {seed}. "
                 f"Answers are keyed by the old ids: restore the seed, or start a new study folder.")
        known = {v["source_id"]: nid for nid, v in old["ids"].items()}
    ids = dict(known)
    fresh = sorted(
        (i["source_id"] for i in items if i["source_id"] not in known),
        key=lambda s: hashlib.sha256(f"{seed}:{s}".encode()).hexdigest(),
    )
    start = len(known)
    for k, sid in enumerate(fresh, start=start + 1):
        ids[sid] = f"G{k:03d}"
    return ids, entries


def build(config_path, out_dir):
    cfg = read_json(config_path)
    check_config(cfg)
    check_items(cfg)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    # Only what the labeller can answer goes on the page, and only that gets an id.
    knows = cfg.get("labeller_knows")
    on_page = [i for i in cfg["items"] if knows is None or i["group"] in knows]
    dropped = len(cfg["items"]) - len(on_page)
    if not on_page:
        fail("no item is left after `labeller_knows`")
    ids, entries = assign_ids(on_page, cfg["seed"], out / "key.json")
    on_page.sort(key=lambda i: ids[i["source_id"]])

    shown = {}
    for i in on_page:
        shown[ids[i["source_id"]]] = {f: i[f] for f in PAGE_FIELDS if f in i}
    used = [g for g in cfg["groups"] if any(i["group"] == g for i in on_page)]
    payload = {
        "title": cfg["title"],
        "intro": cfg.get("intro", ""),
        "groups": [{"id": g, "label": cfg["groups"][g]} for g in used],
        "familiarity_question": cfg.get("familiarity_question", "How well do you know {group}?"),
        "familiarity": list(FAMILIARITY),
        "allowed": allowed_values(cfg["questions"]),
        "questions": cfg["questions"],
        "practice": {"round": cfg.get("practice_round", 1), "items": practice_of(cfg)},
        "items": [{"id": nid, **fields} for nid, fields in shown.items()],
    }
    # `</` inside JSON inside a <script> would end the script early.
    data = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    page = TEMPLATE.replace("__TITLE__", escape(cfg["title"])).replace("__DATA__", data)
    (out / "page.html").write_text(page, encoding="utf-8", newline="\n")

    group_of = {v["source_id"]: v["group"] for v in entries.values()}
    group_of.update({i["source_id"]: i["group"] for i in cfg["items"]})
    key = {
        "study": cfg["study"],
        "seed": cfg["seed"],
        "questions": [q["id"] for q in cfg["questions"]],
        # What counts as an answer: the same dict the page was given (`allowed_values`). `export`
        # checks every stored answer and familiarity against it, so the build's options decide, not
        # whatever the store holds.
        "allowed": allowed_values(cfg["questions"]),
        # The practice is scored against this at export; its answers never go into the labels.
        "practice": {
            "round": cfg.get("practice_round", 1),
            "expected": {p["id"]: p["expected"] for p in practice_of(cfg)},
        },
        "ids": {
            nid: {"source_id": sid, "group": group_of[sid], "on_page": nid in shown}
            for sid, nid in sorted(ids.items(), key=lambda kv: kv[1])
        },
    }
    (out / "key.json").write_text(json.dumps(key, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"built {out / 'page.html'}: {len(on_page)} items, {len(used)} groups"
          f"{f', {dropped} left out (labeller does not know their group)' if dropped else ''}")
    print(f"wrote {out / 'key.json'}: the only link from G-ids to source ids; it is NOT part of the page")


def escape(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


ANSWER_DOC_FIELDS = ("answers", "reasons", "savedAt", "source")
GROUP_DOC_FIELDS = ("familiarity", "savedAt", "source")
DOC_FIELD_TYPES = (
    ("answers", lambda v: isinstance(v, dict), "an object {question: value}"),
    ("reasons", lambda v: isinstance(v, dict), "an object {question: text}"),
    ("familiarity", lambda v: v is None or isinstance(v, str), "a familiarity value (a string) or null"),
    ("savedAt", lambda v: v is None or isinstance(v, str), "a timestamp string or null"),
)


def check_dump(dump, key):
    """The whole store against the key, ONCE, before anything is read from it. Every name in it must be
    one the key knows: an item id, a group, a question id, a field of the document; an item or group
    must also still be on the page, or a rebuild that left it out would drop its stored answer. A name the export
    does not read would otherwise be dropped without a word — a misspelled question key in a chat merge
    (`boundry`), a misspelled group (`pyhton`) — and its answer lost from the labels. Refuses, naming the
    path; the fix is one edit in the dump. Every document also says where it came from: the page always
    writes `source: "page"`, so a document without one was merged by hand."""
    practice = practice_docs(key)
    known = {
        "answers": (set(key["ids"]), ANSWER_DOC_FIELDS),
        "groups": ({meta["group"] for meta in key["ids"].values()}, GROUP_DOC_FIELDS),
        "practice": (practice, ANSWER_DOC_FIELDS),
    }
    noun = {"answers": "answer", "groups": "group", "practice": "practice item"}
    shown = [meta for meta in key["ids"].values() if meta["on_page"]]
    on_page = {
        "answers": {nid for nid, meta in key["ids"].items() if meta["on_page"]},
        "groups": {meta["group"] for meta in shown},
        "practice": practice,
    }
    if not isinstance(dump, dict):
        fail(f"store: {type(dump).__name__} — must be an object {{answers, groups, practice}}")
    for kind in known:
        if kind in dump and not isinstance(dump[kind], dict):
            fail(f"{kind}: {type(dump[kind]).__name__} — must be an object {{id: stored document}}")
    for top in sorted(set(dump) - set(known)):
        fail(f"{top}: the store has no such collection (expected {', '.join(known)})")
    for kind, (names, fields) in known.items():
        for name, doc in sorted(dump.get(kind, {}).items()):
            at = f"{kind}/{name}"
            if name not in names:
                fail(f"{at}: the key does not know this {noun[kind]} ({', '.join(sorted(names))})")
            if name not in on_page[kind]:
                fail(f"{at}: stored, but no longer on the page (a rebuild left it out), so the export would "
                     f"drop it; rebuild with it on the page, or take it out of the dump on purpose")
            if not isinstance(doc, dict):
                fail(f"{at}: must be an object with {', '.join(fields)}")
            for field in sorted(set(doc) - set(fields)):
                fail(f"{at}/{field}: not a field of a stored {noun[kind]} ({', '.join(fields)})")
            if "source" not in doc:
                fail(f"{at}: no source; add \"source\": \"chat\" or \"page\" (one of {SOURCES})")
            if not isinstance(doc["source"], str) or doc["source"] not in SOURCES:
                fail(f"{at}/source: {doc['source']!r}; expected one of {SOURCES}")
            # The types the export reads, so a hand merge is refused by path rather than crashing it.
            for field, ok, what in DOC_FIELD_TYPES:
                if field in doc and not ok(doc[field]):
                    fail(f"{at}/{field}: {doc[field]!r} — must be {what}")
            for q, v in sorted(doc.get("answers", {}).items()):
                if q not in key["questions"]:
                    fail(f"{at}/answers/{q}: not a question of the key ({', '.join(key['questions'])})")
                if v is not None and not isinstance(v, str):
                    fail(f"{at}/answers/{q}: {v!r} — must be an option value (a string) or null")
            for q, v in sorted(doc.get("reasons", {}).items()):
                if q not in key["questions"]:
                    fail(f"{at}/reasons/{q}: not a question of the key ({', '.join(key['questions'])})")
                if not isinstance(v, str):
                    fail(f"{at}/reasons/{q}: {v!r} — must be text")


def practice_docs(key):
    """The store documents a practice of this key may have: every round up to the key's, so the
    answers of an earlier round are known (and kept), not refused."""
    p = key.get("practice") or {"round": 0, "expected": {}}
    return {f"r{r}-{pid}" for r in range(1, p["round"] + 1) for pid in p["expected"]}


def export_practice(dump, key, out, study, day):
    """The practice of the key's round, scored, into its own file; never into the labels."""
    p = key.get("practice")
    if p is None:
        return
    stored = dump.get("practice", {})
    items = []
    for pid, expected in p["expected"].items():
        doc = stored.get(f"r{p['round']}-{pid}", {})
        answers = doc.get("answers", {})
        items.append({"id": pid, "answers": answers, "expected": expected,
                      "matched": all(answers.get(q) == v for q, v in expected.items()),
                      "savedAt": doc.get("savedAt")})
    if not any(i["answers"] for i in items):
        print(f"practice round {p['round']}: not answered")
        return
    matched = [i for i in items if i["matched"]]
    record = {"study": study, "round": p["round"], "exported": day, "matched": len(matched),
              "total": len(items), "items": items}
    path = out / f"{study}-practice-{day}.json"
    path.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    missed = [i["id"] for i in items if not i["matched"]]
    print(f"practice round {p['round']}: {len(matched)} of {len(items)} matched"
          f"{'; missed ' + ', '.join(missed) if missed else ''} -> {path}")


def export(dump_path, key_path, out_dir, day):
    dump = read_json(dump_path)
    key = read_json(key_path)
    qids = key["questions"]
    allowed = key.get("allowed")
    if (not isinstance(allowed, dict) or "familiarity" not in allowed
            or any(q not in allowed.get("questions", {}) for q in qids)):
        fail(f"{key_path} has no `allowed` values for every question and for familiarity (made by an older build). "
             f"Run `build` again with the same items.json and seed: ids are kept, the key gains them.")
    check_dump(dump, key)
    answers = dump.get("answers", {})
    groups = dump.get("groups", {})

    items, group_ids = [], []
    for nid, meta in key["ids"].items():
        if not meta["on_page"]:
            continue
        doc = answers.get(nid, {})
        raw = {q: doc.get("answers", {}).get(q) for q in qids}
        # An answer outside the question's allowed values (a typo in a chat answer, an option that
        # was removed or renamed between builds) is MARKED, not refused and not dropped: the item is
        # incomplete, the raw value is kept under `invalid_answers`, and the report names the item.
        # Refusing would hold every good label hostage to one typo at the moment the export must
        # happen (checklist rule 6); dropping it would lose what the labeller said. A clear report
        # beats both, and the fix is one line in the dump (`"source": "chat"` stays as it was).
        invalid = {q: v for q, v in raw.items() if v is not None and v not in allowed["questions"][q]}
        given = {q: (None if q in invalid else v) for q, v in raw.items()}
        reasons = {q: r for q, r in doc.get("reasons", {}).items() if r.strip()}
        needs_why = key.get("allowed", {}).get("needs_why", {})
        unexplained = [q for q, v in given.items() if v is not None and v in needs_why.get(q, []) and q not in reasons]
        items.append({
            "id": nid,
            "source_id": meta["source_id"],
            "group": meta["group"],
            "answers": given,
            "invalid_answers": invalid,
            "reasons": reasons,
            "unexplained": unexplained,
            "complete": all(v is not None for v in given.values()) and not unexplained,
            "source": doc["source"] if doc else None,
            "saved_at": doc.get("savedAt"),
        })
        if meta["group"] not in group_ids:
            group_ids.append(meta["group"])
    # Same rule as for item answers: a familiarity outside the options is marked, not counted as rated.
    bad_fam = {g: groups[g]["familiarity"] for g in group_ids
               if g in groups and groups[g].get("familiarity") is not None
               and groups[g]["familiarity"] not in allowed["familiarity"]}
    out = {
        "study": key["study"],
        "exported": day,
        "questions": qids,
        "items": items,
        "groups": {
            g: {"familiarity": None if g in bad_fam else groups.get(g, {}).get("familiarity"),
                "invalid_familiarity": bad_fam.get(g),
                "source": groups[g]["source"] if g in groups else None,
                "saved_at": groups.get(g, {}).get("savedAt")}
            for g in group_ids
        },
        "complete_items": sum(i["complete"] for i in items),
        "invalid_items": sum(bool(i["invalid_answers"]) for i in items),
        "invalid_groups": len(bad_fam),
        "total_items": len(items),
    }
    target = Path(out_dir)
    target.mkdir(parents=True, exist_ok=True)
    path = target / f"{key['study']}-labels-{day}.json"
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    export_practice(dump, key, target, key["study"], day)
    print(f"wrote {path}: {out['complete_items']} of {out['total_items']} items complete")
    for i in items:
        for q, v in i["invalid_answers"].items():
            print(f"  invalid {i['id']}: {q}={v!r} is not one of {', '.join(allowed['questions'][q])} (not counted)")
        if not i["complete"]:
            missing = [q for q, v in i["answers"].items() if v is None and q not in i["invalid_answers"]]
            if missing:
                print(f"  incomplete {i['id']}: missing {', '.join(missing)}")
            for q in i["unexplained"]:
                print(f"  incomplete {i['id']}: {q}={i['answers'][q]} needs a reason")
    for g, v in out["groups"].items():
        if g in bad_fam:
            print(f"  invalid group {g}: familiarity={bad_fam[g]!r} is not one of "
                  f"{', '.join(allowed['familiarity'])} (not counted as rated)")
        elif v["familiarity"] is None:
            print(f"  group {g}: no familiarity answer")


# ── THE PAGE ───────────────────────────────────────────────────────────────────────────────────
# Written for the claude.ai viewer on a phone: the frame can be sized to the page, so the page
# never scrolls itself (no scrollIntoView), uses no fixed-position element, and says everything
# inline next to the thing it is about. "Next unanswered" is a FILTER, not a jump.
TEMPLATE = r"""<title>__TITLE__</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Mono&display=swap">
<style>
/* One look, dark whatever the viewer's theme (Material Ocean, no purple): every color is a token below.
   One column, sections apart by a hairline and wide space, items flat; the only raised block of an item is
   the question being asked. Answer buttons are full-width rows with space between them, so a thumb cannot
   land between two of them, and the chosen one has a 2px accent border. */
:root {
  color-scheme: dark;
  --bg: #0f111a; --surface: #1a1c25; --line: #262a3a; --text: #a6accd; --muted: #7e84a3;
  --strong: #eeffff; --accent: #82aaff; --good: #c3e88d; --mark: #ffcb6b; --bad: #f07178;
  --mark-bg: rgba(255, 203, 107, 0.08);
  --sans: "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "Roboto Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
  --gap-section: 48px; --gap-item: 16px; --measure: 68ch;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--sans);
  font-size: 16px; line-height: 1.6; }
main { max-width: 760px; margin: 0 auto; padding: 24px 16px 64px; display: flex; flex-direction: column;
  gap: var(--gap-section); }
main > * + section, main > section + * { border-top: 1px solid var(--line); padding-top: var(--gap-section); }
header.top { display: flex; flex-direction: column; gap: 8px; }
h1 { font-size: 1.5rem; line-height: 1.3; margin: 0; color: var(--strong); font-weight: 700; }
h2 { font-size: 1.15rem; line-height: 1.4; margin: 0; color: var(--strong); font-weight: 500; }
p { margin: 0; max-width: var(--measure); }
.muted { color: var(--muted); }
.id { font-family: var(--mono); color: var(--muted); }
section { display: flex; flex-direction: column; gap: var(--gap-item); }
.item { display: flex; flex-direction: column; gap: 12px; padding-top: var(--gap-item);
  border-top: 1px solid var(--line); }
.item:first-of-type { border-top: 0; padding-top: 0; }
.ask { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px;
  display: flex; flex-direction: column; gap: 12px; }
.q { color: var(--strong); font-weight: 500; }
.body { color: var(--strong); }
h3 { font-size: 1rem; margin: 0; color: var(--strong); font-weight: 500; }
.opts { display: flex; flex-direction: column; gap: 10px; }
button { font: inherit; color: var(--text); background: transparent; border: 1px solid var(--line);
  border-radius: 10px; padding: 10px 16px; min-height: 48px; cursor: pointer; text-align: left; width: 100%; }
button[aria-pressed="true"] { border: 2px solid var(--accent); color: var(--strong); padding: 9px 15px; }
.opts button { display: grid; grid-template-columns: auto 1fr; column-gap: 12px; align-items: start; }
.opts button .icon { grid-row: span 2; font-size: 1.25rem; line-height: 1.6; }
.opts button .label { color: var(--strong); font-weight: 500; grid-column: 2; }
.opts button .ex { color: var(--muted); grid-column: 2; }
.opts button[aria-pressed="true"] { background: var(--surface); }
textarea.why { font: inherit; color: var(--strong); background: var(--surface); border: 1px solid var(--line);
  border-radius: 10px; padding: 10px 12px; min-height: 88px; width: 100%; }
pre.code .line { display: flex; gap: 0; white-space: pre; min-height: 1.4em; }
pre.code .ws { color: var(--muted); }
pre.code .len { margin-left: auto; padding-left: 16px; color: var(--muted); font-size: 0.85em; user-select: none; }
code { font-family: var(--mono); font-size: 0.92em; color: var(--strong); background: var(--surface);
  border: 1px solid var(--line); border-radius: 6px; padding: 1px 6px; }
button:disabled { opacity: 0.5; cursor: default; }
.answered { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--muted); }
.answered button { width: auto; min-height: 44px; border: 0; color: var(--accent); padding: 0 4px; }
.examples { display: flex; flex-direction: column; gap: 12px; }
.example b { color: var(--strong); font-weight: 500; display: block; }
.quote, .banner { background: var(--mark-bg); border-left: 2px solid var(--mark); padding: 10px 14px;
  border-radius: 0 8px 8px 0; color: var(--text); }
.bar { height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; }
.bar > div { height: 100%; background: var(--good); }
.tabs { display: flex; gap: 24px; overflow-x: auto; border-bottom: 1px solid var(--line); }
.tabs button { width: auto; border: 0; border-radius: 0; padding: 10px 0; min-height: 44px; color: var(--muted);
  border-bottom: 2px solid transparent; white-space: nowrap; }
.tabs button[aria-pressed="true"] { color: var(--strong); border: 0; border-bottom: 2px solid var(--accent);
  padding: 10px 0; }
ul { margin: 0; padding-left: 1.2rem; }
pre { overflow-x: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 8px;
  padding: 10px; font-family: var(--mono); font-size: 0.9rem; white-space: pre-wrap; word-break: break-word;
  margin: 0; }
.status { color: var(--muted); }
.status.saved::before { content: ""; display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  background: var(--good); margin-right: 8px; vertical-align: middle; }
.status.missing { color: var(--mark); }
.status.failed { color: var(--bad); }
</style>
<main id="app"><p class="muted">Loading…</p></main>
<script type="application/json" id="data">__DATA__</script>
<script>
(function () {
  "use strict";
  var DATA = JSON.parse(document.getElementById("data").textContent);
  var app = document.getElementById("app");
  var state = {
    answers: {},      // item id -> {answers, savedAt, source}, from the store
    groups: {},       // group id -> {familiarity, savedAt, source}
    practice: {},     // r<round>-P<n> -> {answers, savedAt, source}; the FIRST answer, kept apart
    editing: {},      // item id -> the question id the labeller tapped "Change" on
    mineWhy: {},      // item id -> the reasons this page has just written (ahead of the store)
    mine: {},         // item/group key -> the answers this page has just written (ahead of the store)
    inflight: {},     // item/group key -> writes not yet confirmed
    failed: {},       // item/group key -> error code of the last refused write
    loaded: { answers: false, groups: false, practice: false },
    store: "loading", // loading | ok | none
    filter: "all"
  };
  var db = null;
  var chains = {};

  try { if (localStorage.getItem("label-filter") === "next") state.filter = "next"; } catch (e) {}

  // ── what "done" means ────────────────────────────────────────────────────────────────────
  function answersOf(id) {
    if (state.mine[id]) return state.mine[id];
    var d = state.answers[id];
    return d && d.answers ? d.answers : {};
  }
  // A stored value is an answer only if the build offers it (DATA.allowed, the same lists the
  // export reads from key.json): after a rebuild that removed an option, or a typo merged from chat,
  // the question is unanswered again and says so.
  function valid(allowed, v) { return allowed.indexOf(v) !== -1; }
  function reasonsOf(id) {
    if (state.mineWhy[id]) return state.mineWhy[id];
    var d = state.answers[id];
    return d && d.reasons ? d.reasons : {};
  }
  function needsWhy(q, v) { return (DATA.allowed.needs_why[q.id] || []).indexOf(v) !== -1; }
  // What an item still needs: an answer, or the reason its answer asks for (named "<short> (why)").
  function missingFor(id) {
    var a = answersOf(id), r = reasonsOf(id);
    return DATA.questions.map(function (q) {
      if (!valid(DATA.allowed.questions[q.id], a[q.id])) return q;
      if (needsWhy(q, a[q.id]) && !(r[q.id] || "").trim()) {
        return { id: q.id, text: q.text + " (why)", short: (q.short || q.text) + " (why)" };
      }
      return null;
    }).filter(function (q) { return q !== null; });
  }
  function itemDone(id) { return missingFor(id).length === 0; }
  function familiarity(g) {
    var d = state.mine["group:" + g] || state.groups[g];
    return d && valid(DATA.allowed.familiarity, d.familiarity) ? d.familiarity : undefined;
  }
  function groupItems(g) { return DATA.items.filter(function (i) { return i.group === g; }); }
  // ── the practice (rule 8): known answers, before the real items ──────────────────────────
  function practiceDoc(pid) { return "r" + DATA.practice.round + "-" + pid; }
  function practiceAnswers(pid) {
    var key = "practice:" + pid;
    if (state.mine[key]) return state.mine[key];
    var d = state.practice[practiceDoc(pid)];
    return d && d.answers ? d.answers : {};
  }
  function practiceMissing(pid) {
    var a = practiceAnswers(pid);
    return DATA.questions.filter(function (q) { return !valid(DATA.allowed.questions[q.id], a[q.id]); });
  }
  function practiceAnswered(p) { return practiceMissing(p.id).length === 0; }
  function practiceMatched(p) {
    var a = practiceAnswers(p.id);
    return DATA.questions.every(function (q) { return a[q.id] === p.expected[q.id]; });
  }
  function practiceOpen() { return !DATA.practice.items.every(practiceAnswered); }
  function groupDone(g) { return familiarity(g) !== undefined && groupItems(g).every(function (i) { return itemDone(i.id); }); }

  // ── saving: on click, one write at a time per document ────────────────────────────────────
  function write(key, coll, docId, body) {
    state.inflight[key] = (state.inflight[key] || 0) + 1;
    delete state.failed[key];
    var step = function () { return db.collection(coll).doc(docId).set(body); };
    var run = (chains[key] || Promise.resolve()).then(step, step);
    chains[key] = run.then(function () {
      state.inflight[key] -= 1;
      if (!state.inflight[key]) { delete state.mine[key]; delete state.mineWhy[key]; }
      render();
    }, function (e) {
      state.inflight[key] -= 1;
      if (!state.inflight[key]) { delete state.mine[key]; delete state.mineWhy[key]; } // a refused answer must not count as given
      state.failed[key] = (e && e.code) || "unavailable";
      render();
    });
  }
  function canWrite() {
    return db && state.loaded.answers && state.loaded.groups && state.loaded.practice && state.store === "ok";
  }
  function answer(id, qid, value) {
    if (!canWrite()) return;
    var next = Object.assign({}, answersOf(id));
    next[qid] = value;
    state.mine[id] = next;
    write(id, "answers", id, { answers: next, reasons: reasonsOf(id), savedAt: new Date().toISOString(), source: "page" });
    render();
  }
  // A reason saves when the labeller leaves the box (the text equivalent of a tap).
  function setReason(id, qid, text) {
    if (!canWrite()) return;
    var why = Object.assign({}, reasonsOf(id));
    why[qid] = text;
    state.mineWhy[id] = why;
    state.mine[id] = Object.assign({}, answersOf(id));
    write(id, "answers", id, { answers: answersOf(id), reasons: why, savedAt: new Date().toISOString(), source: "page" });
    render();
  }
  // The first answer to a practice question is the one scored: it cannot be changed afterwards.
  function answerPractice(pid, qid, value) {
    if (!canWrite()) return;
    var cur = practiceAnswers(pid);
    if (valid(DATA.allowed.questions[qid], cur[qid])) return;
    var next = Object.assign({}, cur);
    next[qid] = value;
    state.mine["practice:" + pid] = next;
    write("practice:" + pid, "practice", practiceDoc(pid),
      { answers: next, savedAt: new Date().toISOString(), source: "page" });
    render();
  }
  function setFamiliarity(g, value) {
    if (!canWrite()) return;
    var key = "group:" + g;
    state.mine[key] = { familiarity: value };
    write(key, "groups", g, { familiarity: value, savedAt: new Date().toISOString(), source: "page" });
    render();
  }

  // ── rendering (everything inline; no scrolling, no toasts) ────────────────────────────────
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  // Text with `backticks` shown as code spans; everything stays textContent, so nothing is parsed as HTML.
  function rich(tag, cls, text) {
    var n = el(tag, cls);
    String(text).split("`").forEach(function (part, i) {
      if (part) n.appendChild(el(i % 2 ? "code" : "span", "", part));
    });
    return n;
  }
  // `withExamples`: the practice shows each answer's example on its button; the real items keep the buttons
  // short, the examples stay on the first screen.
  // A code block shows what a labeller would otherwise count by eye: leading and trailing whitespace as
  // faint marks (a space as a middle dot, a tab as an arrow) and each line's length in characters.
  function visible(ws) { return ws.replace(/ /g, "\u00b7").replace(/\t/g, "\u2192"); }
  function codeBlock(text) {
    var pre = el("pre", "code");
    String(text).split("\n").forEach(function (line) {
      var row = el("div", "line");
      var m = /^([ \t]*)([\s\S]*?)([ \t]*)$/.exec(line);
      if (m[1]) row.appendChild(el("span", "ws", visible(m[1])));
      if (m[2]) row.appendChild(el("span", "", m[2]));
      if (m[3]) row.appendChild(el("span", "ws", visible(m[3])));
      row.appendChild(el("span", "len", String(line.length)));
      pre.appendChild(row);
    });
    return pre;
  }
  function options(opts, current, onPick, disabled, withExamples) {
    var row = el("div", "opts");
    opts.forEach(function (o) {
      var b = el("button", "");
      if (o.icon) b.appendChild(el("span", "icon", o.icon));
      b.appendChild(el("span", "label", o.label));
      if (withExamples && o.example) b.appendChild(rich("span", "ex", o.example));
      b.type = "button";
      b.setAttribute("aria-pressed", String(current === o.value));
      b.disabled = disabled;
      b.addEventListener("click", function () { onPick(o.value); });
      row.appendChild(b);
    });
    return row;
  }
  function timeOf(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleTimeString();
  }
  function statusLine(key, missing, savedAt) {
    var s = el("p", "status");
    if (state.failed[key]) {
      s.className = "status failed";
      s.textContent = "Not saved (" + state.failed[key] + "). Tap the answer again.";
    } else if (state.inflight[key]) {
      s.textContent = "Saving…";
    } else if (missing.length) {
      s.className = "status missing";
      s.textContent = "Still needs: " + missing.map(function (q) { return q.short || q.text; }).join("; ") +
        (savedAt ? ". Saved " + timeOf(savedAt) : "");
    } else if (savedAt) {
      s.className = "status saved";
      s.textContent = "Saved " + timeOf(savedAt);
    }
    return s;
  }
  function itemCard(item, off) {
    var done = itemDone(item.id);
    var card = el("article", "item");
    card.appendChild(el("div", "id", item.id));
    if (item.title) card.appendChild(rich("h3", "", item.title));
    card.appendChild(rich("p", "body", item.body));
    if (item.code) card.appendChild(codeBlock(item.code));
    if (item.context) card.appendChild(rich("p", "muted", item.context));
    var a = answersOf(item.id);
    askOne(card, a, state.editing[item.id], function (q, v) {
      delete state.editing[item.id];
      answer(item.id, q.id, v);
    }, function (q) { state.editing[item.id] = q.id; render(); }, off);
    DATA.questions.forEach(function (q) {
      var o = q.options.filter(function (x) { return x.value === a[q.id] && x.ask_why; })[0];
      if (!o) return;
      card.appendChild(el("p", "q", o.ask_why));
      var box = el("textarea", "why");
      box.value = reasonsOf(item.id)[q.id] || "";
      box.disabled = off;
      box.addEventListener("change", function () { setReason(item.id, q.id, box.value); });
      card.appendChild(box);
    });
    var saved = state.answers[item.id] && state.answers[item.id].savedAt;
    card.appendChild(statusLine(item.id, missingFor(item.id), saved));
    return card;
  }
  function labelOf(q, v) {
    var o = q.options.filter(function (x) { return x.value === v; })[0];
    return o ? o.label : v;
  }
  // One question per screen: the answered ones stay as a line (with "Change"), and only one question
  // is asked: the one being changed, else the first unanswered.
  function askOne(card, a, editing, onPick, onChange, off, withExamples) {
    var open = DATA.questions.filter(function (q) { return !valid(DATA.allowed.questions[q.id], a[q.id]); });
    var asked = DATA.questions.filter(function (q) { return q.id === editing; })[0] || open[0];
    DATA.questions.forEach(function (q) {
      if (q === asked || !valid(DATA.allowed.questions[q.id], a[q.id])) return;
      var line = el("p", "answered", (q.short || q.text) + ": " + labelOf(q, a[q.id]) + " ");
      if (onChange) {
        var b = el("button", "", "Change");
        b.type = "button";
        b.disabled = off;
        b.addEventListener("click", function () { onChange(q); });
        line.appendChild(b);
      }
      card.appendChild(line);
    });
    if (!asked) return;
    var ask = el("div", "ask");
    ask.appendChild(el("p", "q", asked.text));
    ask.appendChild(options(asked.options, a[asked.id], function (v) { onPick(asked, v); }, off, withExamples));
    card.appendChild(ask);
  }
  function howTo() {
    var sec = el("section");
    sec.appendChild(el("h2", "", "📖 How to answer"));
    DATA.questions.forEach(function (q) {
      sec.appendChild(el("p", "q", q.text));
      var list = el("div", "examples");
      q.options.forEach(function (o) {
        var row = el("div", "example");
        row.appendChild(el("b", "", (o.icon ? o.icon + " " : "") + o.label));
        row.appendChild(rich("span", "muted", "For example: " + o.example));
        list.appendChild(row);
      });
      sec.appendChild(list);
    });
    return sec;
  }
  function practiceCard(p, off) {
    var card = el("article", "item");
    card.appendChild(el("div", "id", "Practice " + p.id));
    if (p.title) card.appendChild(rich("h3", "", p.title));
    card.appendChild(rich("p", "body", p.body));
    if (p.code) card.appendChild(codeBlock(p.code));
    if (p.context) card.appendChild(rich("p", "muted", p.context));
    var a = practiceAnswers(p.id);
    askOne(card, a, undefined, function (q, v) { answerPractice(p.id, q.id, v); }, null, off, true);
    if (practiceAnswered(p)) {
      var expected = DATA.questions.map(function (q) { return labelOf(q, p.expected[q.id]); }).join(" · ");
      card.appendChild(rich("p", practiceMatched(p) ? "status saved" : "quote",
        (practiceMatched(p) ? "Matched. " : "Expected: " + expected + ". ") + p.why));
    }
    card.appendChild(statusLine("practice:" + p.id, [], null));
    return card;
  }
  function practiceBlock(off) {
    var items = DATA.practice.items;
    var sec = el("section");
    if (practiceOpen()) {
      var answered = items.filter(practiceAnswered).length;
      sec.appendChild(el("h2", "", "🎯 Practice: " + answered + " of " + items.length + " answered"));
      sec.appendChild(el("p", "muted", "These answers are known. After each one the page shows the expected " +
        "answer. The real items open when all " + items.length + " are answered."));
      items.forEach(function (p) { sec.appendChild(practiceCard(p, off)); });
      return sec;
    }
    var missed = items.filter(function (p) { return !practiceMatched(p); });
    sec.appendChild(el("h2", "", (missed.length ? "⚠️ " : "✅ ") + "Practice: " + (items.length - missed.length) + " of " + items.length + " matched"));
    if (missed.length) {
      sec.appendChild(el("div", "banner", "A practice answer did not match. Before going on, tell the agent " +
        "which one: the question is reworded and you take the practice again."));
      missed.forEach(function (p) { sec.appendChild(practiceCard(p, off)); });
    }
    return sec;
  }
  function groupBlock(g, off, onlyOpen) {
    var sec = el("section");
    sec.appendChild(el("h2", "", g.label));
    var fam = el("div", "ask");
    fam.appendChild(el("p", "q", DATA.familiarity_question.replace("{group}", g.label)));
    fam.appendChild(options(DATA.familiarity, familiarity(g.id), function (v) { setFamiliarity(g.id, v); }, off));
    var gs = state.groups[g.id];
    fam.appendChild(statusLine("group:" + g.id,
      familiarity(g.id) === undefined ? [{ text: "an answer" }] : [], gs && gs.savedAt));
    sec.appendChild(fam);
    groupItems(g.id).forEach(function (i) {
      if (onlyOpen && itemDone(i.id)) return;
      sec.appendChild(itemCard(i, off));
    });
    return sec;
  }
  function render() {
    var off = !canWrite();
    var done = DATA.items.filter(function (i) { return itemDone(i.id); }).length;
    var total = DATA.items.length;
    app.textContent = "";
    var top = el("header", "top");
    app.appendChild(top);
    top.appendChild(el("h1", "", DATA.title));
    if (DATA.intro) top.appendChild(el("p", "muted", DATA.intro));
    if (state.store === "none") {
      top.appendChild(el("div", "banner",
        "Answers cannot be saved in this view, so it is read-only. Open the page from the claude.ai " +
        "artifact link while signed in with access to answer."));
    } else if (state.store === "loading" || !(state.loaded.answers && state.loaded.groups)) {
      top.appendChild(el("p", "muted", "Loading saved answers…"));
    }
    app.appendChild(howTo());
    app.appendChild(practiceBlock(off));
    if (practiceOpen()) return;
    var progress = el("section");
    app.appendChild(progress);
    progress.appendChild(el("p", "", done + " of " + total + " items complete"));
    var bar = el("div", "bar"), fill = el("div");
    fill.style.width = (total ? (100 * done / total) : 0) + "%";
    bar.appendChild(fill);
    progress.appendChild(bar);

    var filters = el("div", "tabs");
    [["all", "All items"], ["next", "Next unanswered"]].forEach(function (f) {
      var b = el("button", "", f[1]);
      b.type = "button";
      b.setAttribute("aria-pressed", String(state.filter === f[0]));
      b.addEventListener("click", function () {
        state.filter = f[0];
        try { localStorage.setItem("label-filter", f[0]); } catch (e) {}
        render();
      });
      filters.appendChild(b);
    });
    progress.appendChild(filters);

    var onlyOpen = state.filter === "next";
    if (onlyOpen) {
      var rest = DATA.items.filter(function (i) { return !itemDone(i.id); });
      var open = DATA.groups.filter(function (g) { return familiarity(g.id) === undefined; });
      var note = el("div", "muted");
      if (!rest.length && !open.length) {
        note.appendChild(el("p", "", "Nothing left. Every item and every group is answered."));
      } else {
        note.appendChild(el("p", "", "Left to do:"));
        var ul = el("ul");
        open.forEach(function (g) { ul.appendChild(el("li", "", g.label + ": how well you know it")); });
        rest.forEach(function (i) {
          ul.appendChild(el("li", "", i.id + " needs " +
            missingFor(i.id).map(function (q) { return q.short || q.text; }).join("; ")));
        });
        note.appendChild(ul);
      }
      progress.appendChild(note);
    }
    DATA.groups.forEach(function (g) {
      if (onlyOpen && groupDone(g.id)) return;
      app.appendChild(groupBlock(g, off, onlyOpen));
    });
  }

  // ── the store: subscribe once per collection; render without it, light up when it arrives ──
  function take(target, loadedKey) {
    return function (snap) {
      var next = {};
      snap.docs.forEach(function (d) { next[d.id] = d.data(); });
      state[target] = next;
      state.loaded[loadedKey] = true;
      render();
    };
  }
  function broken() { state.store = "none"; render(); }

  render();
  if (!window.claude || typeof window.claude.use !== "function") { broken(); return; }
  window.claude.use("db").then(function (store) {
    if (!store) { broken(); return; }
    db = store;
    state.store = "ok";
    db.collection("answers").onSnapshot(take("answers", "answers"), broken);
    db.collection("groups").onSnapshot(take("groups", "groups"), broken);
    db.collection("practice").onSnapshot(take("practice", "practice"), broken);
  }, broken);
})();
</script>
"""


def main(argv):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="items.json -> page.html + key.json")
    b.add_argument("items")
    b.add_argument("out")
    sub.add_parser("schema", help="print the declared items.json schema as JSON")
    e = sub.add_parser("export", help="a dump of the store -> <study>-labels-<date>.json")
    e.add_argument("dump")
    e.add_argument("key")
    e.add_argument("out")
    e.add_argument("--date", default=date.today().isoformat())
    args = p.parse_args(argv)
    if args.cmd == "schema":
        print(json.dumps(CONFIG_SCHEMA, indent=2))
    elif args.cmd == "build":
        build(args.items, args.out)
    else:
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", args.date):
            fail("--date must be YYYY-MM-DD")
        export(args.dump, args.key, args.out, args.date)


if __name__ == "__main__":
    main(sys.argv[1:])
