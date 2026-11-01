/**
 * The generator's PAGE: the built page.html opened against a stand-in store in a minimal DOM, and its
 * style read as written. What the labeller sees and what the page saves.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { test } from "vitest";
import { z } from "zod";
import {
  APPROVAL_PRACTICE,
  Allowed,
  DONE_PRACTICE,
  Exported,
  ITEMS,
  type KeyFile,
  QUESTIONS,
  approval,
  build,
  config,
  escapeRe,
  occurrences,
  openLive,
  run,
  setup,
  showPage,
} from "../../../test/label-page-kit.ts";

test("the page: neutral ids, the source ids nowhere, and the order is fixed by the seed", () => {
  const dir = setup("order", config());
  const { page, key } = build(dir);
  assert.deepEqual(Object.keys(key.ids).slice(0, 3), ["G001", "G002", "G003"]);
  for (const item of ITEMS) {
    assert.ok(
      !page.includes(item.source_id),
      `${item.source_id} is on the page`,
    );
  }
  const again = build(dir);
  assert.equal(again.page, page, "the same input must give the same page");
  const order = (k: KeyFile): string =>
    Object.values(k.ids)
      .map((v) => v.source_id)
      .join(",");
  const reseeded = build(setup("order-seed", config({ seed: 8 })));
  assert.notEqual(
    order(reseeded.key),
    order(key),
    "the seed must change the order",
  );
  assert.notEqual(
    order(key),
    ITEMS.map((i) => i.source_id).join(","),
    "the order must not be the input order",
  );
});

test("🔴 the page and the export share one definition of a valid answer: a stored value outside the options is unanswered in both", async () => {
  const dir = setup("stale", config());
  const { page, key } = build(dir);
  const [a, b, c] = Object.keys(key.ids);
  assert.ok(a !== undefined && b !== undefined && c !== undefined);
  const answers = {
    [a]: { answers: { label: "yes", boundary: "clear" }, source: "page" },
    // options changed between builds: neither value is offered any more
    [b]: { answers: { label: "yes", boundary: "maybe" }, source: "page" },
    [c]: { answers: { label: "yse", boundary: "clear" }, source: "chat" },
  };
  const groups = {
    python: { familiarity: "somewhatt", source: "chat" },
    go: { familiarity: "well", source: "page" },
  };
  const shown = await showPage(page, answers, groups);
  assert.match(shown, /1 of 12 items complete/, shown);
  assert.match(shown, new RegExp(`${b} needs boundary`), shown);
  assert.match(shown, new RegExp(`${c} needs correct\\?`), shown);
  assert.match(shown, /Python: how well you know it/, shown);
  assert.doesNotMatch(shown, /Go: how well you know it/, shown);

  writeFileSync(join(dir, "dump.json"), JSON.stringify({ answers, groups }));
  const r = run([
    "export",
    join(dir, "dump.json"),
    join(dir, "out", "key.json"),
    join(dir, "data"),
    "--date",
    "2026-01-02",
  ]);
  assert.equal(r.status, 0, r.out);
  const file = Exported.parse(
    JSON.parse(
      readFileSync(
        join(dir, "data", "demo-gold-labels-2026-01-02.json"),
        "utf8",
      ),
    ),
  );
  assert.equal(
    file.complete_items,
    1,
    "the export counts what the page counts",
  );
  assert.match(r.out, /invalid group python: familiarity='somewhatt'/, r.out);
  const { python, go } = file.groups;
  assert.ok(python !== undefined && go !== undefined);
  assert.equal(python.familiarity, null);
  assert.equal(python.invalid_familiarity, "somewhatt");
  assert.equal(go.familiarity, "well");
});

test("the page's allowed values are the key's: both are written from the same definition", () => {
  const { page, key } = build(setup("one-source", config()));
  const json =
    /<script type="application\/json" id="data">([\s\S]*?)<\/script>/.exec(
      page,
    )?.[1];
  assert.ok(json !== undefined);
  const data = z
    .object({ allowed: Allowed })
    .parse(JSON.parse(json.replace(/<\\\//g, "</")));
  assert.deepEqual(data.allowed, key.allowed);
  assert.deepEqual(key.allowed.familiarity, ["well", "somewhat", "not_really"]);
});

test("the page script parses, saves on click, and has nothing that needs scrolling or a toast", () => {
  const { page } = build(setup("page", config()));
  const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    (m) => m[1] ?? "",
  );
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() =>
    runInNewContext(`(function(){${scripts[0] ?? ""}\n})`),
  );
  assert.match(page, /claude\.use\("db"\)/);
  assert.match(page, /\.set\(/, "an answer is saved by a write");
  assert.doesNotMatch(page, /scrollIntoView|position: *fixed|100vh|alert\(/);
  assert.doesNotMatch(
    page,
    /type="submit"|>Submit</i,
    "there is no submit button",
  );
  assert.match(page, /Next unanswered/);
  assert.match(page, /cannot be saved in this view/);
});

test("🔴 the first screen explains each question with an example per answer, and the real items stay closed until the practice is answered", async () => {
  const { page } = build(setup("first-screen", config()));
  const before = await showPage(page, {}, {}, {});
  assert.match(before, /How to answer/);
  for (const q of QUESTIONS) {
    for (const o of q.options)
      assert.match(before, new RegExp(escapeRe(o.example)));
  }
  assert.match(before, /Practice: 0 of 3 answered/);
  assert.match(before, /sorted\(\[3, 1, 2\]\) gives \[1, 2, 3\]/);
  assert.doesNotMatch(
    before,
    /G001/,
    "a real item is open before the practice",
  );
  assert.doesNotMatch(before, /items complete/);

  const after = await showPage(page, {}, {});
  assert.match(after, /Practice: 3 of 3 matched/);
  assert.match(after, /G001/);
  assert.match(after, /0 of 12 items complete/);
});

test("🔴 a practice answer shows the expected answer and why; a miss says to tell the agent before going on", async () => {
  const { page } = build(setup("practice-miss", config()));
  const practice = {
    ...DONE_PRACTICE,
    "r1-P2": { answers: { label: "yes", boundary: "clear" }, source: "page" },
  };
  const shown = await showPage(page, {}, {}, practice);
  assert.match(shown, /Practice: 2 of 3 matched/);
  assert.match(
    shown,
    /Expected: No · Clear-cut\. The output is the input unchanged\./,
  );
  assert.match(shown, /tell the agent/);
  assert.match(shown, /G001/, "a miss does not lock the real items");
});

test("🔴 a new practice round reopens the practice: answers of an earlier round do not count", async () => {
  const { page } = build(setup("round-2", config({ practice_round: 2 })));
  const shown = await showPage(page, {}, {});
  assert.match(shown, /Practice: 0 of 3 answered/);
  assert.doesNotMatch(shown, /G001/);
});

test("🔴 one question per screen: an item card asks only its first unanswered question", async () => {
  const { page, key } = build(setup("one-question", config()));
  const second = "Clear-cut or a real boundary case?";
  const none = await showPage(page, {}, {});
  assert.equal(
    occurrences(none, second),
    1,
    "only the first screen's explanation names it",
  );
  const [a] = Object.keys(key.ids);
  assert.ok(a !== undefined);
  const one = await showPage(
    page,
    { [a]: { answers: { label: "yes" }, source: "page" } },
    {},
  );
  assert.equal(
    occurrences(one, second),
    2,
    "the item whose first question is answered asks the second",
  );
  assert.match(
    one,
    /correct\?: Yes/,
    "the answered question stays visible as a line",
  );
});

test("🔴 the answer buttons are full-width rows with space between them, and the page has one dark palette", () => {
  const { page } = build(setup("look", config()));
  const css = /<style>([\s\S]*?)<\/style>/.exec(page)?.[1] ?? "";
  assert.match(
    css,
    /\.opts \{ display: flex; flex-direction: column; gap: \d+px; \}/,
  );
  assert.match(css, /button \{[^}]*width: 100%;[^}]*\}/);
  assert.match(
    css,
    /min-height: (4[4-9]|[5-9]\d)px/,
    "a tap target at least 44px tall",
  );
  assert.doesNotMatch(
    css,
    /prefers-color-scheme|data-theme/,
    "one look, not a light and a dark one",
  );
  const colors = new Set(css.match(/#[0-9a-f]{6}\b/gi) ?? []);
  assert.ok(
    colors.size <= 10,
    `every color is a palette token: ${[...colors].join(", ")}`,
  );
  assert.doesNotMatch(page, /class="card"|"card"/, "no card around every item");
});

test("🔴 an answer button carries its icon and label, and no button has a coloured side stripe", () => {
  const [first, ...rest] = QUESTIONS;
  assert.ok(first !== undefined);
  const iconed = {
    ...first,
    options: [
      { ...first.options[0], icon: "✅" },
      { ...first.options[1], icon: "❌" },
    ],
  };
  const { page } = build(
    setup("icons", config({ questions: [iconed, ...rest] })),
  );
  assert.match(page, /"icon": ?"✅"/);
  const css = /<style>([\s\S]*?)<\/style>/.exec(page)?.[1] ?? "";
  const buttonRules = [...css.matchAll(/([^{}]*button[^{}]*)\{([^}]*)\}/g)];
  for (const [, selector, body] of buttonRules) {
    assert.doesNotMatch(
      body ?? "",
      /border-left/,
      `a side stripe on ${selector?.trim() ?? ""}`,
    );
  }
  const toned = setup(
    "toned",
    config({
      questions: [
        {
          ...iconed,
          options: [{ ...iconed.options[0], tone: "good" }, iconed.options[1]],
        },
        ...rest,
      ],
    }),
  );
  const r = run(["build", join(toned, "items.json"), join(toned, "out")]);
  assert.notEqual(r.status, 0, "`tone` is not a field");
  assert.match(r.out, /questions\[0\]\.options\[0\]/);
});

test("🔴 a practice button shows its answer's example, a real item's button does not, and backticks are code", async () => {
  const items = [
    {
      source_id: "c1",
      group: "python",
      body: "Rule says `max-len 100`; reading is `max-len 120`",
    },
  ];
  const { page } = build(setup("code-spans", config({ items })));
  const practising = await showPage(page, {}, {}, {});
  assert.equal(
    occurrences(practising, "Yes\nA sort that returns 1, 2, 3."),
    3,
    "label then example, on each practice item",
  );
  const shown = await showPage(page, {}, {});
  assert.equal(
    occurrences(shown, "Yes\nA sort that returns 1, 2, 3."),
    0,
    "the real item's buttons are short",
  );
  assert.match(
    shown,
    /Rule says \nmax-len 100\n; reading is \nmax-len 120/,
    "backticks become code spans",
  );
  assert.doesNotMatch(shown, /`/);
});

test("🔴 a code block shows its whitespace and each line's length: indentation is seen, not counted", async () => {
  const items = [
    {
      source_id: "c1",
      group: "python",
      body: "Indented with four spaces?",
      code: "def f():\n    return 1\n\tpass  ",
    },
  ];
  const { page } = build(setup("whitespace", config({ items })));
  const shown = await showPage(page, {}, {});
  assert.match(
    shown,
    /····\nreturn 1\n12/,
    "four visible spaces, the text, the line's length",
  );
  assert.match(shown, /→\npass\n··\n7/, "a visible tab and trailing spaces");
  assert.match(shown, /def f\(\):\n8/);
});

test("🔴 approval: a drop is not done until it says why; the page asks for the reason under the chosen answer", async () => {
  const { page, key } = build(setup("approval-page", approval()));
  const [a, b, c] = Object.keys(key.ids);
  assert.ok(a !== undefined && b !== undefined && c !== undefined);
  const practice = Object.fromEntries(
    APPROVAL_PRACTICE.map((p, n) => [
      `r1-P${String(n + 1)}`,
      { answers: p.expected, source: "page" },
    ]),
  );
  const answers = {
    [a]: { answers: { keep: "keep" }, source: "page" },
    [b]: {
      answers: { keep: "drop" },
      reasons: { keep: "a process rule" },
      source: "page",
    },
    [c]: { answers: { keep: "drop" }, source: "page" },
  };
  const shown = await showPage(page, answers, {}, practice);
  assert.match(shown, /2 of 12 items complete/, shown);
  assert.match(shown, new RegExp(`${c} needs keep\\? \\(why\\)`), shown);
  assert.match(shown, /Why drop it\?/, "the reason prompt is on the page");
});

test("🔴 approval: a reason typed but not yet saved survives a re-render from the store", async () => {
  const { page, key } = build(setup("approval-draft", approval()));
  const [a] = Object.keys(key.ids);
  assert.ok(a !== undefined);
  const practice = Object.fromEntries(
    APPROVAL_PRACTICE.map((p, n) => [
      `r1-P${String(n + 1)}`,
      { answers: p.expected, source: "page" },
    ]),
  );
  const docs: Record<string, Record<string, unknown>> = {
    answers: { [a]: { answers: { keep: "drop" }, source: "page" } },
    groups: {},
    practice,
  };
  const { app, resend } = await openLive(page, docs);
  const box = () => app.all().find((n) => n.tag === "textarea");
  const typing = box();
  assert.ok(typing !== undefined, "the drop asks for its reason");
  typing.value = "a process rule, not";
  typing.fire("input");
  resend();
  assert.notEqual(box(), typing, "the store's snapshot rebuilt the page");
  assert.equal(box()?.value, "a process rule, not");
  // Once the store holds the typed text the draft is done: a later stored reason shows, not it.
  const now = box();
  assert.ok(now !== undefined);
  now.value = "a process rule";
  now.fire("input");
  const stored = (reason: string) => {
    docs.answers = {
      [a]: {
        answers: { keep: "drop" },
        reasons: { keep: reason },
        source: "page",
      },
    };
    resend();
    return box()?.value;
  };
  assert.deepEqual(
    [stored("a process rule"), stored("edited on another phone")],
    ["a process rule", "edited on another phone"],
  );
});
