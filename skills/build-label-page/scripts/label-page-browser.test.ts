/**
 * The generator's page in a real Chromium, against a stand-in store whose writes come back as a
 * snapshot a moment later (as the claude.ai store does). What the fake DOM of label-page-html.test.ts
 * cannot show: focus, typing, and a page that is left without the box ever losing focus.
 */
import assert from "node:assert/strict";
import { chromium, type Page } from "playwright-core";
import { test } from "vitest";
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
    (t) => {
      const w = (
        window as { __writes?: { reasons?: Record<string, string> }[] }
      ).__writes;
      return w?.at(-1)?.reasons?.["keep"] === t;
    },
    text,
    { timeout: 10_000 },
  );
  assert.equal(await storedReason(page), text);
}

/** A browser test launches Chromium and types: far above vitest's 5 s default on a slow runner. */
const BROWSER_TEST_MS = 60_000;

async function onApprovalPage(
  name: string,
  echoMs: number,
  steps: (page: Page) => Promise<void>,
  filter: "all" | "next" = "all",
): Promise<void> {
  const { page: html } = build(setup(name, approval()));
  const browser = await chromium.launch({
    executablePath: chromiumPath(),
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.addInitScript(STORE(PRACTICE_DONE, echoMs));
    await page.goto("about:blank");
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    if (filter === "next")
      await page.getByRole("button", { name: "Next unanswered" }).click();
    await page.getByRole("button", { name: /Drop/ }).first().click();
    await steps(page);
  } finally {
    await browser.close();
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
  "a Keep needs no reason and writes none: the page stays quiet",
  async () => {
    const { page: html } = build(setup("browser-keep", approval()));
    const browser = await chromium.launch({
      executablePath: chromiumPath(),
      args: ["--no-sandbox"],
    });
    try {
      const page = await browser.newPage();
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
      await browser.close();
    }
  },
  BROWSER_TEST_MS,
);
