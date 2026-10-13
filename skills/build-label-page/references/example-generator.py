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
marked incomplete and reported (`invalid_answers`, `invalid_familiarity`). `dump.json` is the store's two collections:

    {"answers": {"G001": {"answers": {"q": "v"}, "savedAt": "...", "source": "page"}, ...},
     "groups":  {"python": {"familiarity": "well", "savedAt": "...", "source": "page"}, ...}}

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
                     "options": [{"value": "yes", "label": "Yes"}, {"value": "no", "label": "No"}]}],
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
NAME_PATTERN = r"[A-Za-z0-9_-]+"
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
OPTION_SCHEMA = obj({"value": string(), "label": string()})
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


def export(dump_path, key_path, out_dir, day):
    dump = read_json(dump_path)
    key = read_json(key_path)
    answers = dump.get("answers", {})
    groups = dump.get("groups", {})
    qids = key["questions"]
    allowed = key.get("allowed")
    if (not isinstance(allowed, dict) or "familiarity" not in allowed
            or any(q not in allowed.get("questions", {}) for q in qids)):
        fail(f"{key_path} has no `allowed` values for every question and for familiarity (made by an older build). "
             f"Run `build` again with the same items.json and seed: ids are kept, the key gains them.")
    stray = sorted(set(answers) - set(key["ids"]))
    if stray:
        fail(f"the store holds answers for ids the key does not know: {', '.join(stray)}")
    for kind, docs in (("answers", answers), ("groups", groups)):
        for name, doc in docs.items():
            if doc.get("source", "page") not in SOURCES:
                fail(f"{kind}/{name}: source {doc.get('source')!r}; expected one of {SOURCES}")

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
        items.append({
            "id": nid,
            "source_id": meta["source_id"],
            "group": meta["group"],
            "answers": given,
            "invalid_answers": invalid,
            "complete": all(v is not None for v in given.values()),
            "source": doc.get("source", "page") if doc else None,
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
                "source": groups.get(g, {}).get("source", "page") if g in groups else None,
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
    print(f"wrote {path}: {out['complete_items']} of {out['total_items']} items complete")
    for i in items:
        for q, v in i["invalid_answers"].items():
            print(f"  invalid {i['id']}: {q}={v!r} is not one of {', '.join(allowed['questions'][q])} (not counted)")
        if not i["complete"]:
            missing = [q for q, v in i["answers"].items() if v is None and q not in i["invalid_answers"]]
            if missing:
                print(f"  incomplete {i['id']}: missing {', '.join(missing)}")
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
<style>
:root {
  --bg: #ffffff; --fg: #1d2330; --muted: #5a6475; --card: #f3f5f9; --line: #d5dae4;
  --accent: #2456d6; --on-accent: #ffffff; --ok: #1b7a3d; --warn: #9a5b00; --bad: #b3261e;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #14171f; --fg: #e8ebf2; --muted: #9aa4b6; --card: #1e232e; --line: #343b4a;
    --accent: #7ea2ff; --on-accent: #0c1220; --ok: #5cc27f; --warn: #e0a23c; --bad: #ff8a80;
  }
}
:root[data-theme="dark"] {
  --bg: #14171f; --fg: #e8ebf2; --muted: #9aa4b6; --card: #1e232e; --line: #343b4a;
  --accent: #7ea2ff; --on-accent: #0c1220; --ok: #5cc27f; --warn: #e0a23c; --bad: #ff8a80;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg);
  font: 16px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 42rem; margin: 0 auto; padding: 16px; }
h1 { font-size: 1.35rem; margin: 0 0 4px; }
h2 { font-size: 1.1rem; margin: 0; }
p { margin: 6px 0; }
.muted { color: var(--muted); font-size: 0.9rem; }
.banner { border: 1px solid var(--warn); color: var(--warn); border-radius: 8px; padding: 10px 12px; margin: 12px 0; }
.bar { height: 8px; background: var(--card); border-radius: 4px; overflow: hidden; margin: 8px 0; }
.bar > div { height: 100%; background: var(--ok); }
.filters { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0 12px; }
button { font: inherit; color: var(--fg); background: var(--bg); border: 1px solid var(--line);
  border-radius: 8px; padding: 10px 14px; min-height: 44px; cursor: pointer; }
button[aria-pressed="true"] { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
button:disabled { opacity: 0.5; cursor: default; }
.left { background: var(--card); border-radius: 8px; padding: 10px 12px; margin: 0 0 12px; }
.left ul { margin: 6px 0 0; padding-left: 1.2rem; }
section.group { margin: 20px 0; }
.group > header { margin-bottom: 8px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px; margin: 10px 0; }
.card.done { border-color: var(--ok); }
.card .id { font-weight: 600; }
.card h3 { font-size: 1rem; margin: 4px 0; }
pre { overflow-x: auto; background: var(--bg); border: 1px solid var(--line); border-radius: 8px;
  padding: 8px; font-size: 0.85rem; white-space: pre-wrap; word-break: break-word; }
.q { margin: 12px 0 4px; font-weight: 600; }
.opts { display: flex; gap: 8px; flex-wrap: wrap; }
.status { margin-top: 10px; font-size: 0.9rem; color: var(--muted); }
.status.missing { color: var(--warn); }
.status.failed { color: var(--bad); }
.status.saved { color: var(--ok); }
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
    mine: {},         // item/group key -> the answers this page has just written (ahead of the store)
    inflight: {},     // item/group key -> writes not yet confirmed
    failed: {},       // item/group key -> error code of the last refused write
    loaded: { answers: false, groups: false },
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
  function missingFor(id) {
    var a = answersOf(id);
    return DATA.questions.filter(function (q) { return !valid(DATA.allowed.questions[q.id], a[q.id]); });
  }
  function itemDone(id) { return missingFor(id).length === 0; }
  function familiarity(g) {
    var d = state.mine["group:" + g] || state.groups[g];
    return d && valid(DATA.allowed.familiarity, d.familiarity) ? d.familiarity : undefined;
  }
  function groupItems(g) { return DATA.items.filter(function (i) { return i.group === g; }); }
  function groupDone(g) { return familiarity(g) !== undefined && groupItems(g).every(function (i) { return itemDone(i.id); }); }

  // ── saving: on click, one write at a time per document ────────────────────────────────────
  function write(key, coll, docId, body) {
    state.inflight[key] = (state.inflight[key] || 0) + 1;
    delete state.failed[key];
    var step = function () { return db.collection(coll).doc(docId).set(body); };
    var run = (chains[key] || Promise.resolve()).then(step, step);
    chains[key] = run.then(function () {
      state.inflight[key] -= 1;
      if (!state.inflight[key]) delete state.mine[key];
      render();
    }, function (e) {
      state.inflight[key] -= 1;
      if (!state.inflight[key]) delete state.mine[key]; // a refused answer must not count as given
      state.failed[key] = (e && e.code) || "unavailable";
      render();
    });
  }
  function canWrite() { return db && state.loaded.answers && state.loaded.groups && state.store === "ok"; }
  function answer(id, qid, value) {
    if (!canWrite()) return;
    var next = Object.assign({}, answersOf(id));
    next[qid] = value;
    state.mine[id] = next;
    write(id, "answers", id, { answers: next, savedAt: new Date().toISOString(), source: "page" });
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
  function options(opts, current, onPick, disabled) {
    var row = el("div", "opts");
    opts.forEach(function (o) {
      var b = el("button", "", o.label);
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
    var card = el("div", "card" + (done ? " done" : ""));
    card.appendChild(el("div", "id", item.id));
    if (item.title) card.appendChild(el("h3", "", item.title));
    card.appendChild(el("p", "", item.body));
    if (item.code) card.appendChild(el("pre", "", item.code));
    if (item.context) card.appendChild(el("p", "muted", item.context));
    var a = answersOf(item.id);
    DATA.questions.forEach(function (q) {
      card.appendChild(el("p", "q", q.text));
      card.appendChild(options(q.options, a[q.id], function (v) { answer(item.id, q.id, v); }, off));
    });
    var saved = state.answers[item.id] && state.answers[item.id].savedAt;
    card.appendChild(statusLine(item.id, missingFor(item.id), saved));
    return card;
  }
  function groupBlock(g, off, onlyOpen) {
    var sec = el("section", "group");
    var head = el("header");
    head.appendChild(el("h2", "", g.label));
    sec.appendChild(head);
    var fam = el("div", "card" + (familiarity(g.id) !== undefined ? " done" : ""));
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
    app.appendChild(el("h1", "", DATA.title));
    if (DATA.intro) app.appendChild(el("p", "muted", DATA.intro));
    if (state.store === "none") {
      app.appendChild(el("div", "banner",
        "Answers cannot be saved in this view, so it is read-only. Open the page from the claude.ai " +
        "artifact link while signed in with access to answer."));
    } else if (state.store === "loading" || !(state.loaded.answers && state.loaded.groups)) {
      app.appendChild(el("p", "muted", "Loading saved answers…"));
    }
    app.appendChild(el("p", "", done + " of " + total + " items complete"));
    var bar = el("div", "bar"), fill = el("div");
    fill.style.width = (total ? (100 * done / total) : 0) + "%";
    bar.appendChild(fill);
    app.appendChild(bar);

    var filters = el("div", "filters");
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
    app.appendChild(filters);

    var onlyOpen = state.filter === "next";
    if (onlyOpen) {
      var rest = DATA.items.filter(function (i) { return !itemDone(i.id); });
      var open = DATA.groups.filter(function (g) { return familiarity(g.id) === undefined; });
      var note = el("div", "left");
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
      app.appendChild(note);
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
