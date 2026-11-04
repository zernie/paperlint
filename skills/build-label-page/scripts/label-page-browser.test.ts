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
} from "playwright-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, test } from "vitest";
import { z } from "zod";
import { chromiumPath } from "../../../test/chromium.ts";
import {
  APPROVAL_PRACTICE,
  approval,
  build,
  setup,
} from "../../../test/label-page-kit.ts";

/** A store that keeps every write and echoes it back as a snapshot after `echoMs`. */
const STORE = (practice: Record<string, unknown>, echoMs: number): string => `
  window.__writes = [];
  (function () {
    var docs = { answers: {}, groups: {}, practice: ${JSON.stringify(practice)} };
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
  "witness-items.json",
);
/** The generic witness page, every practice card answered as expected, at phone width. */
async function onWitnessPage(
  name: string,
  steps: (page: Page) => Promise<void>,
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
    await page.addInitScript(STORE(done, 20));
    await page.goto("about:blank");
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await steps(page);
  } finally {
    await page.context().close();
  }
}

test(
  "🔴 at phone width a witness card lights the caught line in its numbered code, keeps its settings folded, opens a long text on «more», and nothing pushes the page sideways",
  async () => {
    await onWitnessPage("browser-witness", async (page) => {
      const card = page.locator("article.item", { hasText: "seed_db.py" });
      assert.equal(
        await card.locator("pre.numbered .hit").textContent(),
        '18print(f"seeded {len(rows)} rows")',
      );
      // Guards: the settings are folded, and the question sits below the code.
      assert.deepEqual(
        await card
          .locator("details")
          .evaluateAll((els) => els.map((e) => (e as HTMLDetailsElement).open)),
        [false, false],
      );
      const code = await card.locator("pre.numbered").boundingBox();
      const ask = await card.locator(".ask").boundingBox();
      assert.ok(code && ask && ask.y > code.y + code.height);
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
  "🔴 under 'Next unanswered' the card just answered stays, with Change, until the next card is answered",
  async () => {
    await onWitnessPage("browser-witness-next", async (page) => {
      await page.getByRole("button", { name: "Next unanswered" }).click();
      const cards = page.locator("article.item");
      assert.equal(await cards.count(), 3);
      await cards
        .nth(0)
        .getByRole("button", { name: /words cover it/ })
        .click();
      await page.waitForTimeout(100);
      assert.equal(await cards.count(), 3, "the answered card is still there");
      assert.equal(
        await cards.nth(0).getByRole("button", { name: "Change" }).count(),
        1,
      );
      await cards
        .nth(1)
        .getByRole("button", { name: /words cover it/ })
        .click();
      await page.waitForTimeout(100);
      assert.equal(await cards.count(), 2, "the first one has gone");
    });
  },
  BROWSER_TEST_MS,
);
