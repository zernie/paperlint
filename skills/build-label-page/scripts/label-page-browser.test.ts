/**
 * The generator's page in a real Chromium, against a stand-in store whose writes come back as a
 * snapshot a moment later (as the claude.ai store does). What the fake DOM of label-page-html.test.ts
 * cannot show: focus, typing, and a page that is left without the box ever losing focus.
 */
import assert from "node:assert/strict";
import {
  type Browser,
  chromium,
  type Locator,
  type Page,
  selectors,
} from "playwright-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as R from "remeda";
import { afterAll, test } from "vitest";
import { z } from "zod";
import { chromiumPath } from "../../../test/chromium.ts";
import {
  APPROVAL_PRACTICE,
  PRACTICE,
  QUESTIONS,
  ITEMS,
  approval,
  approvalCard,
  build,
  config,
  setup,
} from "../../../test/label-page-kit.ts";

/** A store that keeps every write and echoes it back as a snapshot after `echoMs`. */
const STORE = (
  practice: Record<string, unknown>,
  echoMs: number,
  answers: Record<string, unknown> = {},
): string => `
  window.__writes = [];
  window.__ids = [];
  (function () {
    var docs = { answers: ${JSON.stringify(answers)}, groups: {}, practice: ${JSON.stringify(practice)} };
    var subs = {};
    function snap(n) {
      (subs[n] || []).forEach(function (cb) {
        cb({ docs: Object.keys(docs[n]).map(function (id) { return { id: id, data: function () { return docs[n][id]; } }; }) });
      });
    }
    var db = { collection: function (n) { return {
      onSnapshot: function (cb) { (subs[n] = subs[n] || []).push(cb); snap(n); },
      doc: function (id) { return { set: function (body) {
        window.__writes.push(body);
        window.__ids.push(n + "/" + id);
        docs[n][id] = body;
        return new Promise(function (r) { setTimeout(function () { r(); snap(n); }, ${String(echoMs)}); });
      } }; }
    }; } };
    window.claude = { use: function () { return Promise.resolve(db); } };
  })();`;

const PRACTICE_DONE = Object.fromEntries(
  APPROVAL_PRACTICE.map((p, n) => [
    `r1-P${String(n + 1)}`,
    { answers: p.expected, source: "page" },
  ]),
);

/** Every document the page wrote, in order, read back as JSON (the stand-in store keeps them). */
const Writes = z.array(
  z.object({ reasons: z.record(z.string(), z.string()) }).loose(),
);
const writes = async (page: Page) =>
  Writes.parse(
    JSON.parse(await page.evaluate("JSON.stringify(window.__writes)")),
  );
/** The reason the store was last given for the one question. */
const storedReason = async (page: Page): Promise<string | undefined> =>
  (await writes(page)).at(-1)?.reasons["keep"];

/** Wait until the store's last write carries `text` as the reason (the page saves on its own). */
async function reasonStored(page: Page, text: string): Promise<void> {
  await page.waitForFunction(
    `(window.__writes || []).at(-1)?.reasons?.keep === ${JSON.stringify(text)}`,
    undefined,
    { timeout: 10_000 },
  );
  assert.equal(await storedReason(page), text);
}

/**
 * One Chromium for the whole file, each test in a context of its own (`newPage` opens one): a launch
 * per test cost about 5 s apiece on the macOS runner, and the file's wall time grew with every test.
 */
let launched: Browser | undefined;
const sharedBrowser = async (): Promise<Browser> =>
  (launched ??= await chromium.launch({
    executablePath: chromiumPath(),
    args: ["--no-sandbox"],
  }));
afterAll(async () => {
  await launched?.close();
});

/** A browser test launches Chromium and types: far above vitest's 5 s default on a slow runner. */
const BROWSER_TEST_MS = 60_000;

async function onApprovalPage(
  name: string,
  echoMs: number,
  steps: (page: Page) => Promise<void>,
  filter: "all" | "next" = "all",
): Promise<void> {
  const { page: html } = build(setup(name, approval()));
  const browser = await sharedBrowser();
  const page = await browser.newPage();
  try {
    await page.addInitScript(STORE(PRACTICE_DONE, echoMs));
    await page.goto("about:blank");
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    if (filter === "next")
      await page.getByRole("button", { name: "Next unanswered" }).click();
    await page.getByRole("button", { name: /Drop/ }).first().click();
    await steps(page);
  } finally {
    await page.context().close();
  }
}

test(
  "🔴 a reason typed and never blurred is saved: after a pause in typing, and when the page is left",
  async () => {
    await onApprovalPage("browser-pause", 20, async (page) => {
      await page.locator("textarea").first().click();
      await page.keyboard.type("a process rule");
      await reasonStored(page, "a process rule");
    });
    await onApprovalPage("browser-leave", 20, async (page) => {
      await page.locator("textarea").first().click();
      await page.keyboard.type("not a rule");
      await page.evaluate(() => {
        window.dispatchEvent(new Event("pagehide"));
      });
      await reasonStored(page, "not a rule");
    });
  },
  BROWSER_TEST_MS,
);

test(
  "🔴 the store's echo while typing keeps the box, its focus and every keystroke",
  async () => {
    await onApprovalPage("browser-echo", 300, async (page) => {
      await page.locator("textarea").first().click();
      await page.keyboard.type("a pro");
      await page.waitForTimeout(450); // the Drop's own write comes back and the page renders again
      await page.keyboard.type("cess rule");
      assert.equal(
        await page.evaluate(() => document.activeElement?.tagName),
        "TEXTAREA",
      );
      assert.equal(
        await page.locator("textarea").first().inputValue(),
        "a process rule",
      );
      await reasonStored(page, "a process rule");
    });
  },
  BROWSER_TEST_MS,
);

test(
  "🔴 under 'Next unanswered', the save that completes an item keeps the box being typed in on the page",
  async () => {
    await onApprovalPage(
      "browser-next",
      20,
      async (page) => {
        await page.locator("textarea").first().click();
        await page.keyboard.type("a pro");
        await reasonStored(page, "a pro"); // the item is complete now, and the filter hides complete items
        await page.keyboard.type("cess rule");
        assert.equal(
          await page.evaluate(() => document.activeElement?.tagName),
          "TEXTAREA",
        );
        await reasonStored(page, "a process rule");
      },
      "next",
    );
  },
  BROWSER_TEST_MS,
);

test(
  "🔴 an answer that needs a reason is not saved while its reason is empty; another answer replaces it unsaved",
  async () => {
    await onApprovalPage("browser-refuse", 20, async (page) => {
      await page.waitForTimeout(1200); // longer than the reason's pause: nothing may arrive
      assert.deepEqual(await writes(page), []);
      assert.match(
        (await page.locator("article.item").first().textContent()) ?? "",
        /Not saved yet/,
      );
      // Leaving the page with the box empty saves nothing either.
      await page.evaluate(() => {
        window.dispatchEvent(new Event("pagehide"));
      });
      await page.waitForTimeout(100);
      assert.deepEqual(await writes(page), []);
      await page.getByRole("button", { name: /Keep/ }).first().click();
      await page.waitForTimeout(100);
      assert.deepEqual(
        await page.evaluate(
          "window.__writes.map(function (w) { return w.answers; })",
        ),
        [{ keep: "keep" }],
      );
    });
  },
  BROWSER_TEST_MS,
);

test(
  "a Keep needs no reason and writes none: the page stays quiet",
  async () => {
    const { page: html } = build(setup("browser-keep", approval()));
    const browser = await sharedBrowser();
    const page = await browser.newPage();
    try {
      await page.addInitScript(STORE(PRACTICE_DONE, 20));
      await page.goto("about:blank");
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: /Keep/ }).first().click();
      await page.waitForTimeout(1200); // longer than the reason's pause: nothing more may arrive
      assert.equal(await page.locator("textarea").count(), 0);
      assert.deepEqual(
        (await writes(page)).map((w) => w.reasons),
        [{}],
      );
    } finally {
      await page.context().close();
    }
  },
  BROWSER_TEST_MS,
);

/** A two-reading card with a long URL and compact JSON: what pushed the page sideways on a phone. */
const URL_LONG = `https://github.com/a/b/blob/${"0".repeat(40)}/src/a/long/path/to/witness.ts`;
const WITNESS = {
  source_id: "s1",
  group: "python",
  body: "Warn for unused variables, except those prefixed with `_`",
  unit: {
    id: "L",
    text: "Warn for unused variables",
    mark: "unused",
    part: 1,
    of: 1,
  },
  rules: [{ linter: "eslint", id: "no-console" }],
  readings: {
    a: `[{"argsIgnorePattern":"^_","varsIgnorePattern":"^_","caughtErrors":"all"}]`,
    b: "[]",
  },
  file: URL_LONG,
  context: URL_LONG,
};

/** Where the line, the rule, reading A, reading B and the question sit on a card, top to bottom. */
const blocksOf = async (card: Locator) =>
  Promise.all(
    [
      ".quote",
      ".row:has(.lbl:text-is('Rule'))",
      ".reading.a",
      ".reading.b",
      ".ask",
    ].map(async (sel) => card.locator(sel).first().boundingBox()),
  );

test(
  "🔴 at phone width the card reads by position: line, rule, reading A above reading B, then the question; nothing pushes the page sideways",
  async () => {
    const { page: html } = build(
      setup("browser-layout", approval({ items: [WITNESS] })),
    );
    const page = await (
      await sharedBrowser()
    ).newPage({ viewport: { width: 400, height: 900 } });
    try {
      await page.addInitScript(STORE(PRACTICE_DONE, 20));
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      const card = page.locator("article.item").last();
      const boxes = await blocksOf(card);
      const [line, rule, a, b, ask] = boxes;
      assert.ok(line && rule && a && b && ask, "every block is on the card");
      // Guards: each block below the one before, A and B in one column, a gap before the question.
      assert.deepEqual(
        boxes
          .slice(1)
          .map(
            (x, i) =>
              (x?.y ?? 0) >= (boxes[i]?.y ?? 0) + (boxes[i]?.height ?? 0),
          ),
        [true, true, true, true],
      );
      assert.equal(a.x, b.x);
      assert.ok(ask.y - (b.y + b.height) >= 16, "space before the question");
      assert.deepEqual(
        await card
          .locator(".reading")
          .evaluateAll((els) =>
            els.map((e) => getComputedStyle(e).borderLeftStyle),
          ),
        ["solid", "dashed"],
      );
      // Guards: a long URL or compact JSON wraps; the page itself never scrolls sideways.
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth),
        400,
      );
    } finally {
      await page.context().close();
    }
  },
  BROWSER_TEST_MS,
);

const WITNESS_FIXTURE = join(
  import.meta.dirname,
  "fixtures",
  "linter-config-witness-items.json",
);
/** The generic witness page, every practice card answered as expected, at phone width. */
async function onWitnessPage(
  name: string,
  steps: (page: Page) => Promise<void>,
  practiceDone = true,
): Promise<void> {
  const cfg = z
    .object({
      practice: z.array(
        z.object({ expected: z.record(z.string(), z.string()) }).loose(),
      ),
    })
    .loose()
    .parse(JSON.parse(readFileSync(WITNESS_FIXTURE, "utf8")));
  const done = Object.fromEntries(
    cfg.practice.map((p, n) => [
      `r1-P${String(n + 1)}`,
      { answers: p.expected, source: "page" },
    ]),
  );
  const { page: html } = build(setup(name, cfg));
  const page = await (
    await sharedBrowser()
  ).newPage({ viewport: { width: 400, height: 900 } });
  try {
    await page.addInitScript(STORE(practiceDone ? done : {}, 20));
    await page.goto("about:blank");
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await steps(page);
  } finally {
    await page.context().close();
  }
}

/** The code, the linter's message, the question, the rule docs' heading: one read of the laid-out card,
 * so a re-render between reads cannot mix two layouts. */
const LAYOUT_OF = ["pre.numbered", "p.said", ".ask", ".rulebox > h3"];
const Layout = z.array(z.object({ top: z.number(), bottom: z.number() }));
const layout = async (card: Locator) =>
  Layout.parse(
    await card.evaluate(
      (e, sels) =>
        sels.map((s) => {
          const r = e.querySelector(s)?.getBoundingClientRect();
          return { top: r?.top ?? NaN, bottom: r?.bottom ?? NaN };
        }),
      LAYOUT_OF,
    ),
  );

test(
  "🔴 at phone width a witness card labels the caught line in its numbered code, asks its question right under that code, shows the rule docs and the settings in place, opens a long text on «more», and nothing pushes the page sideways",
  async () => {
    await onWitnessPage("browser-witness", async (page) => {
      // Measure after the store's practice answers arrived: before them the practice cards sit above.
      await page.locator("summary", { hasText: "How to answer" }).waitFor();
      const card = page.locator("article.item", { hasText: "seed_db.py" });
      // The marked line reads as marked without colour: a gutter marker and a label.
      assert.equal(
        await card.locator("pre.numbered .hit").textContent(),
        '▶18print(f"seeded {len(rows)} rows")◀ this line',
      );
      // Guards: nothing a card needs is folded (#392); the rule docs, the files like it and the
      // settings are shown in place, each under its heading.
      assert.deepEqual(
        [
          await card.locator("details").count(),
          await card.locator(".rulebox > h3").allTextContents(),
        ],
        [
          0,
          [
            "What the linter rule does (official docs)",
            "3 more file(s) with the same situation",
            "Settings behind this card",
          ],
        ],
      );
      // The question sits right under the code it is about: only the linter's message between them,
      // and the rule's docs start below the answers.
      const box = await layout(card);
      const [code, said, ask, docs] = box;
      assert.ok(code && said && ask && docs, JSON.stringify(box));
      assert.ok(
        said.top >= code.bottom && ask.top >= said.bottom,
        JSON.stringify(box),
      );
      assert.ok(ask.top - said.bottom < 40, JSON.stringify(box));
      assert.ok(docs.top >= ask.bottom, JSON.stringify(box));
      const why = card.locator(".clamped", { hasText: "Why:" });
      const folded = (await why.boundingBox())?.height ?? 0;
      await card.getByRole("button", { name: "more" }).first().click();
      const opened = await card.locator("p", { hasText: "Why:" }).boundingBox();
      assert.ok(
        opened && opened.height > folded,
        `${String(folded)} → ${String(opened?.height)}`,
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth),
        400,
      );
    });
  },
  BROWSER_TEST_MS,
);

test(
  "🔴 a witness practice card's answer buttons say their example is about other code",
  async () => {
    await onWitnessPage(
      "browser-witness-buttons",
      async (page) => {
        const practice = page.locator("article.item").first();
        assert.deepEqual(
          [
            await practice.locator(".id").textContent(),
            await practice.locator(".opts button").count(),
            await practice.locator(".opts .ex").count(),
            await practice.locator(".opts .ex").first().textContent(),
          ],
          [
            "Practice P1",
            4,
            4,
            "Example of this answer, about other code: «Use ===» and the line a == b: yes, the requirement forbids it",
          ],
        );
      },
      false,
    );
  },
  BROWSER_TEST_MS,
);

test(
  "🔴 under 'Next unanswered' the card just answered stays, with Change, until the next card is answered",
  async () => {
    await onWitnessPage("browser-witness-next", async (page) => {
      await page.getByRole("button", { name: "Next unanswered" }).click();
      const cards = page.locator("article.item");
      assert.equal(await cards.count(), 3);
      await cards.nth(0).getByRole("button", { name: "Yes" }).click();
      await page.waitForTimeout(100);
      assert.equal(await cards.count(), 3, "the answered card is still there");
      assert.equal(
        await cards.nth(0).getByRole("button", { name: "Change" }).count(),
        1,
      );
      await cards.nth(1).getByRole("button", { name: "Yes" }).click();
      await page.waitForTimeout(100);
      assert.equal(await cards.count(), 2, "the first one has gone");
    });
  },
  BROWSER_TEST_MS,
);

test(
  "🔴 on a page of two questions, an answer still waiting for its reason is in no write, even when the next question is answered",
  async () => {
    const [label, boundary] = QUESTIONS;
    assert.ok(label !== undefined && boundary !== undefined);
    const withWhy = {
      ...label,
      options: label.options.map((o) =>
        o.value === "no" ? { ...o, ask_why: "Why not?" } : o,
      ),
    };
    const { page: html } = build(
      setup("browser-pending-two", config({ questions: [withWhy, boundary] })),
    );
    const done = Object.fromEntries(
      PRACTICE.map((p, n) => [
        `r1-P${String(n + 1)}`,
        { answers: p.expected, source: "page" },
      ]),
    );
    const page = await (await sharedBrowser()).newPage();
    try {
      await page.addInitScript(STORE(done, 20));
      await page.goto("about:blank");
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      const card = page.locator("article.item").filter({ hasText: "G001" });
      await card.getByRole("button", { name: "No", exact: true }).click();
      await card.getByRole("button", { name: "Clear-cut" }).click();
      await page.waitForTimeout(100);
      // Guards: the reasonless «no» never reaches the store; the answer without a reason does.
      assert.deepEqual(
        (await writes(page)).map((w) => w["answers"]),
        [{ boundary: "clear" }],
      );
      await card.locator("textarea").fill("the output is out of order");
      await card.locator("textarea").blur();
      await page.waitForTimeout(100);
      assert.deepEqual((await writes(page)).at(-1), {
        ...(await writes(page)).at(-1),
        answers: { label: "no", boundary: "clear" },
        reasons: { label: "the output is out of order" },
      });
    } finally {
      await page.context().close();
    }
  },
  BROWSER_TEST_MS,
);

test(
  "🔴 a saved answer changed to one still waiting for its reason stays saved when another question is answered",
  async () => {
    const [label, boundary] = QUESTIONS;
    assert.ok(label !== undefined && boundary !== undefined);
    const withWhy = {
      ...label,
      options: label.options.map((o) =>
        o.value === "no" ? { ...o, ask_why: "Why not?" } : o,
      ),
    };
    const { page: html } = build(
      setup(
        "browser-pending-saved",
        config({ questions: [withWhy, boundary] }),
      ),
    );
    const done = Object.fromEntries(
      PRACTICE.map((p, n) => [
        `r1-P${String(n + 1)}`,
        { answers: p.expected, source: "page" },
      ]),
    );
    const page = await (await sharedBrowser()).newPage();
    try {
      await page.addInitScript(
        STORE(done, 20, {
          G001: {
            answers: { label: "yes", boundary: "clear" },
            reasons: {},
            source: "page",
          },
        }),
      );
      await page.goto("about:blank");
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      const card = page.locator("article.item").filter({ hasText: "G001" });
      await card.getByRole("button", { name: "Change" }).first().click();
      await card.getByRole("button", { name: "No", exact: true }).click();
      await card.getByRole("button", { name: "Change" }).last().click();
      await card.getByRole("button", { name: "Boundary" }).click();
      await page.waitForTimeout(100);
      // Guards: the store keeps «yes» until the reason for «no» is typed; the new boundary is saved.
      assert.deepEqual(
        (await writes(page)).map((w) => w["answers"]),
        [{ label: "yes", boundary: "boundary" }],
      );
    } finally {
      await page.context().close();
    }
  },
  BROWSER_TEST_MS,
);

test(
  "🔴 a stored answer to a question the page no longer asks does not stop the next answer from saving",
  async () => {
    const { page: html } = build(setup("browser-stale-question", approval()));
    const page = await (await sharedBrowser()).newPage();
    try {
      await page.addInitScript(
        STORE(PRACTICE_DONE, 20, {
          G001: { answers: { renamed: "x" }, source: "page" },
        }),
      );
      await page.goto("about:blank");
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      const card = page.locator("article.item").filter({ hasText: "G001" });
      await card.getByRole("button", { name: /Keep/ }).click();
      await page.waitForTimeout(100);
      // Guards: the answer is written, and the stored answer it does not know is kept as it was.
      assert.deepEqual(
        (await writes(page)).map((w) => w["answers"]),
        [{ renamed: "x", keep: "keep" }],
      );
    } finally {
      await page.context().close();
    }
  },
  BROWSER_TEST_MS,
);

/** The collection and document id of every write, in order. */
const writtenIds = async (page: Page): Promise<readonly string[]> =>
  z.array(z.string()).parse(await page.evaluate("window.__ids"));
/** A page served from an origin of its own, so it has a localStorage that a reload keeps. */
async function served(page: Page, html: string): Promise<void> {
  await page.route("http://label.test/", (route) =>
    route.fulfill({ body: html, contentType: "text/html" }),
  );
  await page.goto("http://label.test/");
}
const prefixedPractice = (who: string) =>
  R.mapKeys(PRACTICE_DONE, (k) => `${who}~${k}`);

test(
  "🔴 without answerers the page asks nobody's name and writes the documents it always wrote, with no seconds",
  async () => {
    const { page: html } = build(
      setup(
        "browser-plain-ids",
        approval({ items: ITEMS.slice(0, 2).map(approvalCard) }),
      ),
    );
    const page = await (await sharedBrowser()).newPage();
    try {
      await page.addInitScript(STORE(PRACTICE_DONE, 20));
      await page.goto("about:blank");
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      assert.equal(await page.getByText("Who is answering?").count(), 0);
      await page.getByRole("button", { name: /Keep/ }).first().click();
      await page.waitForTimeout(100);
      assert.deepEqual(await writtenIds(page), ["answers/G001"]);
      assert.deepEqual(Object.keys((await writes(page))[0] ?? {}).sort(), [
        "answers",
        "reasons",
        "savedAt",
        "source",
      ]);
    } finally {
      await page.context().close();
    }
  },
  BROWSER_TEST_MS,
);

/** Three approval cards: the first two for both answerers, the third for `author` only. */
const TWO_PAGE = (over: Record<string, unknown> = {}) =>
  approval({
    answerers: ["author", "second"],
    items: ITEMS.slice(0, 3)
      .map(approvalCard)
      .map((i, n) => (n === 2 ? R.merge(i, { answerers: ["author"] }) : i)),
    ...over,
  });

test(
  "🔴 with answerers the page asks who is answering, remembers it, writes and reads only that answerer's documents, and can switch",
  async () => {
    const dir = setup("browser-answerers", TWO_PAGE());
    const { page: html, key } = build(dir);
    const third = Object.entries(key.ids).find(
      ([, v]) => v.source_id === "case-1002",
    )?.[0];
    const [first] = Object.keys(key.ids).filter((n) => n !== third);
    assert.ok(third !== undefined && first !== undefined);
    const page = await (await sharedBrowser()).newPage();
    try {
      await page.addInitScript(
        STORE(prefixedPractice("second"), 20, {
          [`author~${first}`]: { answers: { keep: "keep" }, source: "page" },
        }),
      );
      await served(page, html);
      assert.equal(await page.getByText("Who is answering?").count(), 1);
      assert.equal(await page.locator("article.item").count(), 0);
      await page.getByRole("button", { name: "second", exact: true }).click();
      // Guards: second sees two items, none answered: author's answer is not theirs.
      assert.equal(await page.locator("article.item").count(), 2);
      assert.equal(await page.getByText("0 of 2 items complete").count(), 1);
      await page
        .locator("article.item", { hasText: first })
        .getByRole("button", { name: /Keep/ })
        .click();
      await page.waitForTimeout(100);
      assert.deepEqual(await writtenIds(page), [`answers/second~${first}`]);
      // A reload remembers who is answering.
      await page.reload();
      // (The stand-in store starts afresh on a reload: only the name is checked here.)
      assert.equal(await page.getByText("Answering as second").count(), 1);
      await page.getByRole("button", { name: "Switch" }).click();
      await page.getByRole("button", { name: "author", exact: true }).click();
      // author has not done the practice: it opens, and its answers go under author's name.
      assert.equal(
        await page.getByText("Practice: 0 of 3 answered").count(),
        1,
      );
      await page
        .locator("article.item")
        .first()
        .getByRole("button", { name: /Keep/ })
        .click();
      await page.waitForTimeout(100);
      assert.equal((await writtenIds(page)).at(-1), "practice/author~r1-P1");
    } finally {
      await page.context().close();
    }
  },
  BROWSER_TEST_MS,
);

test(
  "🔴 with answerers and no localStorage the page still works: it asks, and writes under the name picked",
  async () => {
    const { page: html } = build(setup("browser-answerers-nols", TWO_PAGE()));
    const page = await (await sharedBrowser()).newPage();
    try {
      await page.addInitScript(
        `Object.defineProperty(window, "localStorage", { get: function () { throw new Error("denied"); } });`,
      );
      await page.addInitScript(STORE(prefixedPractice("author"), 20));
      await served(page, html);
      await page.getByRole("button", { name: "author", exact: true }).click();
      assert.equal(await page.locator("article.item").count(), 3);
      await page
        .locator("article.item", { hasText: "G001" })
        .getByRole("button", { name: /Keep/ })
        .click();
      await page.waitForTimeout(100);
      assert.deepEqual(await writtenIds(page), ["answers/author~G001"]);
    } finally {
      await page.context().close();
    }
  },
  BROWSER_TEST_MS,
);

test(
  "🔴 with min_seconds a card's answer saves only after the card was that long on screen; a card never on screen stays locked; the seconds are stored",
  async () => {
    const { page: html } = build(
      setup("browser-dwell", approval({ min_seconds: 2 })),
    );
    const page = await (
      await sharedBrowser()
    ).newPage({ viewport: { width: 400, height: 700 } });
    try {
      await page.addInitScript(STORE(PRACTICE_DONE, 20));
      await page.goto("about:blank");
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      const cards = page.locator("article.item");
      const firstCard = cards.first();
      const lastCard = cards.last();
      await firstCard.scrollIntoViewIfNeeded();
      const keep = firstCard.getByRole("button", { name: /Keep/ });
      assert.equal(await keep.isDisabled(), true);
      assert.match((await firstCard.textContent()) ?? "", /answer in [12] s/);
      await keep.click({ force: true });
      assert.deepEqual(await writes(page), [], "nothing saves before the time");
      await page.waitForTimeout(2600);
      assert.equal(await keep.isDisabled(), false);
      assert.equal(
        await lastCard.getByRole("button", { name: /Keep/ }).isDisabled(),
        true,
        "the last card was never on screen",
      );
      await keep.click();
      await page.waitForTimeout(100);
      const [stored] = z
        .array(z.object({ seconds: z.number().int() }).loose())
        .parse(await page.evaluate("window.__writes"));
      assert.ok(
        stored !== undefined && stored.seconds >= 2 && stored.seconds <= 4,
        JSON.stringify(stored),
      );
      await lastCard.scrollIntoViewIfNeeded();
      await page.waitForTimeout(2600);
      assert.equal(
        await lastCard.getByRole("button", { name: /Keep/ }).isDisabled(),
        false,
      );
    } finally {
      await page.context().close();
    }
  },
  BROWSER_TEST_MS,
);

test(
  "🔴 with min_seconds a tall card's clock stops when less than its share is in view, even between the observer's steps",
  async () => {
    const { page: html } = build(
      setup("browser-dwell-tall", approval({ min_seconds: 2 })),
    );
    const page = await (
      await sharedBrowser()
    ).newPage({ viewport: { width: 400, height: 300 } });
    try {
      await page.addInitScript(STORE(PRACTICE_DONE, 20));
      await page.goto("about:blank");
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await page.addStyleTag({
        content: "article.item { min-height: 1200px; box-sizing: border-box; }",
      });
      const lastCard = page.locator("article.item").last();
      const keep = lastCard.getByRole("button", { name: /Keep/ });
      await keep.waitFor();
      // Show `px` of the last card at the bottom of the viewport. The card is 1200 px and the
      // viewport 300 px, so it is on screen with half the viewport, 150 px (12.5 %), in view.
      const show = (px: number) =>
        page.evaluate(
          `(() => { const c = document.querySelectorAll("article.item"); const r = c[c.length - 1].getBoundingClientRect(); window.scrollTo(0, window.scrollY + r.top - window.innerHeight + ${String(px)}); })()`,
        );
      await show(170); // 14.2 %: above the share
      await page.waitForTimeout(200);
      await show(140); // 11.7 %: below it, and no 5 % step is crossed on the way
      await page.waitForTimeout(2600);
      assert.equal(
        await keep.isDisabled(),
        true,
        "140 px of the card in view for 2.6 s does not count",
      );
      await show(200);
      await page.waitForTimeout(2600);
      assert.equal(
        await keep.isDisabled(),
        false,
        "200 px in view for 2.6 s counts",
      );
    } finally {
      await page.context().close();
    }
  },
  BROWSER_TEST_MS,
);

test(
  "🔴 with min_seconds a card over 20 viewports tall still unlocks when it fills the screen, and one that grows is judged at its new height",
  async () => {
    const { page: html } = build(
      setup("browser-dwell-huge", approval({ min_seconds: 2 })),
    );
    const page = await (
      await sharedBrowser()
    ).newPage({ viewport: { width: 400, height: 300 } });
    try {
      await page.addInitScript(STORE(PRACTICE_DONE, 20));
      await page.goto("about:blank");
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      const cards = page.locator("article.item");
      const huge = cards.last();
      await huge.getByRole("button", { name: /Keep/ }).waitFor();
      // The card grows after it was drawn and watched, with no render.
      await huge.evaluate((el) => {
        el.style.minHeight = "7000px";
        el.scrollIntoView({ block: "start" });
        window.scrollBy(0, 2000);
      });
      await page.waitForTimeout(2600);
      assert.equal(
        await huge.getByRole("button", { name: /Keep/ }).isDisabled(),
        false,
        "a 7000 px card filling a 300 px viewport for 2.6 s counts",
      );
    } finally {
      await page.context().close();
    }
  },
  BROWSER_TEST_MS,
);

test(
  "🔴 with min_seconds a page that loaded in a hidden tab starts the clock of a card in view when the tab comes back",
  async () => {
    const { page: html } = build(
      setup("browser-dwell-hidden", approval({ min_seconds: 2 })),
    );
    const page = await (
      await sharedBrowser()
    ).newPage({ viewport: { width: 400, height: 700 } });
    try {
      await page.addInitScript(
        `window.__vis = "hidden"; Object.defineProperty(Document.prototype, "visibilityState", { configurable: true, get: function () { return window.__vis; } });`,
      );
      await page.addInitScript(STORE(PRACTICE_DONE, 20));
      await page.goto("about:blank");
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      const firstCard = page.locator("article.item").first();
      await firstCard.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.evaluate(
        `window.__vis = "visible"; document.dispatchEvent(new Event("visibilitychange"));`,
      );
      await page.waitForTimeout(2600);
      assert.equal(
        await firstCard.getByRole("button", { name: /Keep/ }).isDisabled(),
        false,
        "the card was in view for 2.6 s after the tab came back",
      );
    } finally {
      await page.context().close();
    }
  },
  BROWSER_TEST_MS,
);

// ── the approved card (#392): a code-review note on the marked line, tap-to-see notes on terms ──
// Every element these tests touch carries `data-test`, found only by getByTestId; its values are the
// JSON in `data-test-meta`. A text that is content (the annotation, the quote) is read against the
// fixture's own value, never retyped here.
selectors.setTestIdAttribute("data-test");
const V7_FIXTURE = join(import.meta.dirname, "fixtures", "v7-cards-items.json");
const V7_CARD = z
  .object({
    source_id: z.string(),
    terms: z.array(
      z.object({
        term: z.string(),
        note: z.array(
          z
            .object({
              quote: z.string().optional(),
              url: z.string(),
              url_label: z.string(),
            })
            .loose(),
        ),
      }),
    ),
    excerpt: z.object({
      gutter_header: z.string().optional(),
      annotation: z.string(),
      lines: z.array(
        z.object({
          n: z.number(),
          mark: z.boolean(),
          context: z.boolean().optional(),
          gutter: z.string().optional(),
        }),
      ),
    }),
    answer_notes: z.object({ forbid: z.record(z.string(), z.string()) }),
  })
  .loose();
const V7_CONFIG = z
  .object({ practice: z.array(z.unknown()), items: z.array(z.unknown()) })
  .loose()
  .parse(JSON.parse(readFileSync(V7_FIXTURE, "utf8")));
const V7_CARDS = z.array(V7_CARD).parse(V7_CONFIG.items);
/** The fixture's card of that source id. */
const fixtureCard = (sourceId: string) => {
  const found = V7_CARDS.find((i) => i.source_id === sourceId);
  assert.ok(found !== undefined, sourceId);
  return found;
};
/** A fixture text as the page shows it: its `backticks` are code spans, not characters. */
const unticked = (text: string): string => text.split("`").join("");
/** The values an element carries in `data-test-meta`. */
const metaOf = async (l: Locator): Promise<unknown> =>
  JSON.parse((await l.getAttribute("data-test-meta")) ?? "null");
/** The elements of one kind, each with its values. */
const allByKind = async (scope: Page | Locator, kind: string) =>
  Promise.all(
    (await scope.getByTestId(kind).all()).map(async (loc) => ({
      loc,
      meta: await metaOf(loc),
    })),
  );
const Id = z.object({ id: z.string() });
const Term = z.object({ term: z.string() });
const Answer = z.object({ question: z.string(), value: z.string() });
const CodeLine = z.object({
  line: z.number(),
  marked: z.boolean(),
  gutter: z.string(),
  context: z.boolean(),
});
/** The three-card fixture, practice done, without its time on screen, at 400 px wide. */
async function onV7Page(
  name: string,
  steps: (
    page: Page,
    cardOf: (sourceId: string) => Promise<Locator>,
  ) => Promise<void>,
  withTime = false,
): Promise<void> {
  const { page: html, key } = build(
    setup(name, withTime ? V7_CONFIG : R.omit(V7_CONFIG, ["min_seconds"])),
  );
  const done = ["forbid", "allow", "elsewhere"];
  const page = await (
    await sharedBrowser()
  ).newPage({ viewport: { width: 400, height: 800 } });
  try {
    await page.addInitScript(
      STORE(
        Object.fromEntries(
          done.map((v, n) => [
            `r1-P${String(n + 1)}`,
            { answers: { forbid: v }, source: "page" },
          ]),
        ),
        20,
      ),
    );
    await page.goto("about:blank");
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.getByTestId("item").first().waitFor();
    const cardOf = async (sourceId: string) => {
      const id = Object.entries(key.ids).find(
        ([, v]) => v.source_id === sourceId,
      )?.[0];
      const found = (await allByKind(page, "item")).find(
        (c) => Id.parse(c.meta).id === id,
      );
      assert.ok(found !== undefined, `${sourceId} is drawn`);
      return found.loc;
    };
    await steps(page, cardOf);
  } finally {
    await page.context().close();
  }
}
/** The term of that text on a card. */
const termOf = async (card: Locator, term: string) => {
  const found = (await allByKind(card, "term")).find(
    (t) => Term.parse(t.meta).term === term,
  );
  assert.ok(found !== undefined, `${term} is a button`);
  return found.loc;
};
const answerOf = async (card: Locator, value: string) => {
  const found = (await allByKind(card, "answer")).find(
    (a) => Answer.parse(a.meta).value === value,
  );
  assert.ok(found !== undefined, `${value} is an answer`);
  return found.loc;
};
/** The open note: whether it shows, which term, its box, and the terms marked open. */
const Tip = z.object({ term: z.string(), open: z.boolean() });
const tipNow = async (page: Page) => {
  const tip = page.getByTestId("tip");
  const drawn = (await tip.count()) > 0;
  const state = drawn
    ? Tip.parse(await metaOf(tip))
    : { term: "", open: false };
  const box = drawn && state.open ? await tip.boundingBox() : null;
  const expanded = await Promise.all(
    (await allByKind(page, "term")).map(async (t) => ({
      term: Term.parse(t.meta).term,
      open: (await t.loc.getAttribute("aria-expanded")) === "true",
    })),
  );
  return {
    ...state,
    left: box?.x ?? -1,
    right: box ? box.x + box.width : -1,
    width: box?.width ?? -1,
    expanded: expanded.filter((t) => t.open).map((t) => t.term),
  };
};

/** Wait until the note reports itself closed (it closes on its own schedule). */
const noteClosed = (page: Page) =>
  page.waitForFunction(
    `JSON.parse(document.querySelector('[data-test="tip"]').getAttribute("data-test-meta")).open === false`,
    undefined,
    { timeout: 5_000 },
  );

test(
  "🔴 a dotted term opens one floating note on a tap, with its quote and its source link, anchored and inside a 400 px viewport",
  async () => {
    await onV7Page("browser-v7-tip", async (page, cardOf) => {
      const docstring = fixtureCard("card-docstring");
      const google = docstring.terms.find((t) => t.term === "Google-style");
      assert.ok(google !== undefined);
      await (await termOf(await cardOf("card-docstring"), google.term)).click();
      const tip = await tipNow(page);
      assert.deepEqual(
        [tip.term, tip.open, tip.expanded],
        [google.term, true, [google.term]],
      );
      assert.deepEqual(
        [
          await page.getByTestId("tip-quote").allTextContents(),
          (await allByKind(page, "tip-link")).map((l) => l.meta),
          await page.getByTestId("tip-link").allTextContents(),
        ],
        [
          google.note.flatMap((e) => e.quote ?? []),
          google.note.map((e) => ({ url: e.url })),
          google.note.map((e) => e.url_label),
        ],
      );
      // Inside the viewport and at most 300 px wide, for a term near either edge.
      const edges = [];
      for (const [source, term] of [
        ["card-docstring", ".github/copilot-instructions.md"],
        ["card-depth", "guard clauses"],
        ["card-call", "document.getElementById"],
      ] as const) {
        // Each term is measured on its own: the note of the one before may cover this one.
        await page.keyboard.press("Escape");
        await noteClosed(page);
        await (await termOf(await cardOf(source), term)).click();
        const t = await tipNow(page);
        edges.push([t.term, t.left >= 0 && t.right <= 400 && t.width <= 300]);
      }
      assert.deepEqual(edges, [
        [".github/copilot-instructions.md", true],
        ["guard clauses", true],
        ["document.getElementById", true],
      ]);
    });
  },
  BROWSER_TEST_MS,
);

test(
  "🔴 a tap outside the open note closes it and answers nothing; Esc closes it; a second term closes the first",
  async () => {
    await onV7Page("browser-v7-close", async (page, cardOf) => {
      const depth = await cardOf("card-depth");
      // The note covers the first answers; the tap lands on an answer it leaves visible.
      await (await termOf(depth, "guard clauses")).click();
      await (await answerOf(depth, "unsettled")).click();
      await page.waitForTimeout(100);
      assert.deepEqual(
        [(await tipNow(page)).open, (await writes(page)).length],
        [false, 0],
      );
      await (await termOf(await cardOf("card-call"), "AGENTS.md")).click();
      await page.keyboard.press("Escape");
      assert.equal((await tipNow(page)).open, false);
      const docstring = await cardOf("card-docstring");
      const d413 = fixtureCard("card-docstring").terms.find(
        (t) => t.term === "D413",
      );
      assert.ok(d413 !== undefined);
      await (await termOf(docstring, "Ruff")).click();
      await (await termOf(docstring, d413.term)).click();
      const t = await tipNow(page);
      assert.deepEqual(
        [
          t.open,
          t.expanded,
          await page.getByTestId("tip-quote").allTextContents(),
        ],
        [true, [d413.term], d413.note.flatMap((e) => e.quote ?? [])],
      );
      // With the note closed, the same answer saves.
      await page.keyboard.press("Escape");
      await (await answerOf(depth, "unsettled")).click();
      await page.waitForTimeout(100);
      assert.equal((await writes(page)).length, 1);
    });
  },
  BROWSER_TEST_MS,
);

test(
  "🔴 a note opened by hover stays open while the pointer crosses the gap to it, keeps its link reachable, and closes after the pointer leaves for good",
  async () => {
    await onV7Page("browser-v7-hover", async (page, cardOf) => {
      const docstring = await cardOf("card-docstring");
      const google = fixtureCard("card-docstring").terms.find(
        (t) => t.term === "Google-style",
      );
      assert.ok(google !== undefined);
      const term = await termOf(docstring, google.term);
      // A slow runner must not outrun the grace delay while the pointer crosses the gap.
      await page.evaluate("window.__tipGraceMs = 5000");
      // At its top left corner: a term that wraps has a box whose middle may lie over another term.
      await term.hover({ position: { x: 4, y: 4 } });
      assert.deepEqual(
        [(await tipNow(page)).term, (await tipNow(page)).open],
        [google.term, true],
      );
      // Straight down from the term, in small steps, through the gap into the note. Only the gap
      // lies between them on this path, so no other term opens on the way.
      const tip = page.getByTestId("tip");
      const from = await term.boundingBox();
      const to = await tip.boundingBox();
      assert.ok(from !== null && to !== null);
      const top = from.y + from.height;
      // The other terms do not react while the pointer crosses: only the gap is under test, and
      // which term lies in it depends on how the line wraps. The arrow bridges the gap at the
      // middle of the term, so the crossing is at its right end.
      await page.addStyleTag({
        content: 'button.term[aria-expanded="false"] { pointer-events: none; }',
      });
      const x = from.x + from.width - 8;
      assert.ok(
        to.y > top && x > to.x && x < to.x + to.width,
        "the note lies below the term and covers that column",
      );
      await page.mouse.move(x, from.y + from.height - 1);
      for (const k of R.range(0, Math.ceil((to.y + 10 - top) / 3))) {
        await page.mouse.move(x, top + 3 * k);
      }
      await page.mouse.move(x, to.y + 10);
      const inside = await tipNow(page);
      assert.deepEqual(
        [inside.term, inside.open, inside.expanded],
        [google.term, true, [google.term]],
      );
      // Guards: the link answers a click at its own position, nothing covers it.
      await page.getByTestId("tip-link").first().click({ trial: true });
      // Far from the term and the note, it closes by itself once the grace delay has run out.
      await page.evaluate("window.__tipGraceMs = 50");
      await page.mouse.move(2, 2, { steps: 20 });
      await noteClosed(page);
      assert.equal((await tipNow(page)).open, false);
    });
  },
  BROWSER_TEST_MS,
);

/** What the depth card shows around its marked line, read from the page. */
async function annotatedFacts(depth: Locator) {
  const lines = await allByKind(depth, "code-line");
  const header = depth.getByTestId("code-header");
  const anno = depth.getByTestId("annotation");
  const subs = await allByKind(depth, "answer-sub");
  return {
    annotation: [await metaOf(anno), await anno.textContent()],
    header: [
      await metaOf(header),
      await header.getByTestId("gutter").textContent(),
    ],
    lines: lines.map((l) => l.meta),
    gutters: await Promise.all(
      lines.map((l) => l.loc.getByTestId("gutter").textContent()),
    ),
    gaps: (await allByKind(depth, "gap")).map((g) => g.meta),
    subs: await Promise.all(
      subs.map(async (s) => [s.meta, await s.loc.textContent()]),
    ),
  };
}
/** The same facts, as the fixture states them. */
function annotatedExpected(fixture: z.infer<typeof V7_CARD>) {
  const rows = fixture.excerpt.lines;
  return {
    annotation: [
      { line: rows.find((l) => l.mark)?.n },
      unticked(fixture.excerpt.annotation),
    ],
    header: [
      { gutter: fixture.excerpt.gutter_header },
      fixture.excerpt.gutter_header,
    ],
    lines: rows.map((l) => ({
      line: l.n,
      marked: l.mark,
      gutter: l.gutter ?? "",
      context: l.context ?? false,
    })),
    gutters: rows.map((l) => l.gutter ?? ""),
    gaps: R.zip(rows, rows.slice(1))
      .filter(([a, b]) => b.n > a.n + 1)
      .map(([a, b]) => ({ from: a.n + 1, to: b.n - 1 })),
    subs: Object.entries(fixture.answer_notes.forbid).map(([v, text]) => [
      { question: "forbid", value: v },
      unticked(text),
    ]),
  };
}

test(
  "🔴 the annotation sits right under the marked line inside the code; the gutter column has its header and its values; each answer carries its sub-line",
  async () => {
    await onV7Page("browser-v7-card", async (page, cardOf) => {
      const depth = await cardOf("card-depth");
      const lines = await allByKind(depth, "code-line");
      const marked = lines.find((l) => CodeLine.parse(l.meta).marked);
      assert.ok(marked !== undefined, "the marked line is drawn");
      const [hit, note] = [
        await marked.loc.boundingBox(),
        await depth.getByTestId("annotation").boundingBox(),
      ];
      assert.ok(hit && note, "both drawn");
      assert.ok(
        note.y >= hit.y + hit.height && note.y - (hit.y + hit.height) < 16,
        JSON.stringify([hit, note]),
      );
      assert.deepEqual(
        await annotatedFacts(depth),
        annotatedExpected(fixtureCard("card-depth")),
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth),
        400,
      );
    });
  },
  BROWSER_TEST_MS,
);

test(
  "🔴 a card still on its time shows its wait bar with the seconds left, in the page's own words, and the answers wait",
  async () => {
    await onV7Page(
      "browser-v7-wait",
      async (page, cardOf) => {
        const { labels, min_seconds: total } = z
          .object({
            labels: z.object({ wait: z.string() }),
            min_seconds: z.number(),
          })
          .loose()
          .parse(V7_CONFIG);
        const bar = (await cardOf("card-depth")).getByTestId("wait");
        // One read of both, so a tick between two reads cannot mix them.
        const [text, raw] = z
          .tuple([z.string(), z.string()])
          .parse(
            await bar.evaluate((n) => [
              n.textContent,
              n.getAttribute("data-test-meta"),
            ]),
          );
        const meta = z
          .object({ id: z.string(), seconds: z.number() })
          .parse(JSON.parse(raw));
        assert.deepEqual(
          [
            meta.seconds > 0 && meta.seconds <= total,
            text,
            await (
              await answerOf(await cardOf("card-depth"), "forbid")
            ).isDisabled(),
          ],
          [true, labels.wait.replace("{s}", String(meta.seconds)), true],
        );
      },
      true,
    );
  },
  BROWSER_TEST_MS,
);

/** Where a part of a card sits, by its `data-test`: the first one of that kind. */
const boxOf = async (card: Locator, kind: string) =>
  card.getByTestId(kind).first().boundingBox();
const Panel = z.object({
  border: z.number(),
  radius: z.number(),
  padding: z.number(),
});
test(
  "🔴 a quote card reads once from top to bottom, quote, code, question, answers, wait bar, inside a panel of its own; its «still needs» line is not shown",
  async () => {
    await onV7Page(
      "browser-v7-order",
      async (page, cardOf) => {
        const card = await cardOf("card-docstring");
        const parts = ["quote", "excerpt-path", "question", "answer", "wait"];
        const boxes = await Promise.all(parts.map((k) => boxOf(card, k)));
        // Guards: each part starts below the one before it ends, so the eye never goes back up.
        assert.deepEqual(
          R.zip(boxes, boxes.slice(1)).map(
            ([a, b]) => a !== null && b !== null && b.y >= a.y + a.height,
          ),
          [true, true, true, true],
          JSON.stringify(boxes),
        );
        const status = card.getByTestId("status");
        assert.deepEqual(
          [await metaOf(status), await status.isVisible()],
          [{ state: "missing", missing: ["forbid"] }, false],
        );
        // A panel: a border all round, rounded, padded, and wide space before the next card.
        const panel = Panel.parse(
          await card.evaluate((e) => {
            const s = getComputedStyle(e);
            return {
              border: parseFloat(s.borderBottomWidth),
              radius: parseFloat(s.borderTopLeftRadius),
              padding: parseFloat(s.paddingLeft),
            };
          }),
        );
        assert.ok(
          panel.border >= 1 && panel.radius >= 8 && panel.padding >= 12,
          JSON.stringify(panel),
        );
        const cards = await page.getByTestId("item").all();
        const [first, second] = await Promise.all(
          cards.slice(0, 2).map(async (c) => c.boundingBox()),
        );
        assert.ok(first && second, "two cards drawn");
        assert.ok(
          second.y - (first.y + first.height) >= 32,
          JSON.stringify([first, second]),
        );
      },
      true,
    );
  },
  BROWSER_TEST_MS,
);

// ── a second language for the page's own words (#394) ──────────────────────────────────────────
const RU_FIXTURE = join(import.meta.dirname, "fixtures", "v7-cards-ru.json");
const Words = z.object({
  labels: z.object({ for_example: z.string() }).loose(),
  questions: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      options: z.array(
        z.object({
          value: z.string(),
          label: z.string(),
          example: z.string(),
          icon: z.string(),
        }),
      ),
    }),
  ),
});
const RU_WORDS = z
  .object({
    situation_question: z.string(),
    labels: z.object({ for_example: z.string() }).loose(),
    questions: z.record(
      z.string(),
      z.object({
        text: z.string(),
        options: z.record(
          z.string(),
          z.object({ label: z.string(), example: z.string() }),
        ),
      }),
    ),
  })
  .parse(JSON.parse(readFileSync(RU_FIXTURE, "utf8")));
/** The fixture's page words in one language: the base's, or the Russian translation laid over them. */
function wordsIn(lang: "en" | "ru") {
  const base = Words.parse({
    labels: { for_example: "For example: " },
    questions: z.object({ questions: z.unknown() }).loose().parse(V7_CONFIG)
      .questions,
  });
  if (lang === "en") return base;
  return {
    labels: RU_WORDS.labels,
    questions: base.questions.map((q) => ({
      ...q,
      text: RU_WORDS.questions[q.id]?.text ?? "",
      options: q.options.map((o) => ({
        ...o,
        ...RU_WORDS.questions[q.id]?.options[o.value],
      })),
    })),
  };
}
/** What the docstring card and the how-to rows say in `lang`, as the fixture states it. */
function expectedIn(lang: "en" | "ru") {
  const card = fixtureCard("card-docstring");
  const { situation, quote } = z
    .object({
      situation: z.object({ question: z.string() }),
      quote: z.object({ text: z.string() }),
    })
    .loose()
    .parse(card);
  const w = wordsIn(lang);
  const [q] = w.questions;
  assert.ok(q !== undefined);
  const notes = card.answer_notes.forbid;
  return {
    switch: { lang, langs: ["en", "ru"] },
    quote: unticked(quote.text),
    question:
      lang === "en"
        ? situation.question
        : RU_WORDS.situation_question.replace(
            "{n}",
            String(card.excerpt.lines.find((l) => l.mark)?.n),
          ),
    answers: q.options.map((o) => [
      { question: q.id, value: o.value },
      `${o.icon}${o.label}${unticked(notes[o.value] ?? "")}`,
    ]),
    howTo: [
      q.text,
      ...q.options.map(
        (o) => `${o.icon} ${o.label}${w.labels.for_example}${o.example}`,
      ),
    ],
  };
}
/** The same, read from the page. */
async function shownIn(page: Page, card: Locator) {
  const texts = async (scope: Page | Locator, kind: string) =>
    scope.getByTestId(kind).allTextContents();
  return {
    switch: await metaOf(page.getByTestId("lang-switch")),
    quote: (await texts(card, "quote")).join(""),
    question: (await texts(card, "question")).join(""),
    answers: await Promise.all(
      (await allByKind(card, "answer")).map(async (a) => [
        a.meta,
        await a.loc.textContent(),
      ]),
    ),
    howTo: [
      ...(await texts(page, "how-to-question")),
      ...(await texts(page, "how-to-answer")),
    ],
  };
}
test(
  "🔴 the language switch swaps the page's own words both ways, keeps the quote and the code as built, and is remembered over a reload",
  async () => {
    const cfg = {
      ...R.omit(V7_CONFIG, ["min_seconds"]),
      translations: { ru: JSON.parse(readFileSync(RU_FIXTURE, "utf8")) },
    };
    const { page: html, key } = build(setup("browser-v7-lang", cfg));
    const at = "http://label.test/";
    const page = await (
      await sharedBrowser()
    ).newPage({ viewport: { width: 400, height: 800 } });
    try {
      // A real origin, so the page has a localStorage; every other request is refused, none leaves.
      await page.route("**/*", (r) =>
        r.request().url() === at
          ? r.fulfill({ contentType: "text/html; charset=utf-8", body: html })
          : r.abort(),
      );
      await page.addInitScript(
        STORE(
          Object.fromEntries(
            ["forbid", "allow", "elsewhere"].map((v, n) => [
              `r1-P${String(n + 1)}`,
              { answers: { forbid: v }, source: "page" },
            ]),
          ),
          20,
        ),
      );
      await page.goto(at, { waitUntil: "domcontentloaded" });
      const id = Object.entries(key.ids).find(
        ([, v]) => v.source_id === "card-docstring",
      )?.[0];
      const card = async () => {
        await page.getByTestId("item").first().waitFor();
        const found = (await allByKind(page, "item")).find(
          (c) => Id.parse(c.meta).id === id,
        );
        assert.ok(found !== undefined, "the card is drawn");
        return found.loc;
      };
      const option = async (lang: string) =>
        (await allByKind(page, "lang-option")).find(
          (o) => z.object({ lang: z.string() }).parse(o.meta).lang === lang,
        )?.loc;
      assert.deepEqual(await shownIn(page, await card()), expectedIn("en"));
      await (await option("ru"))?.click();
      assert.deepEqual(await shownIn(page, await card()), expectedIn("ru"));
      await page.reload({ waitUntil: "domcontentloaded" });
      assert.deepEqual(await shownIn(page, await card()), expectedIn("ru"));
      await (await option("en"))?.click();
      assert.deepEqual(await shownIn(page, await card()), expectedIn("en"));
    } finally {
      await page.context().close();
    }
  },
  BROWSER_TEST_MS,
);
