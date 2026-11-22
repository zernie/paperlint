// The four-stop index in a real browser, on the exported page in out/ (so this runs after
// `next build`: `npm run test:browser`). Elements are found only by `data-test`, and their values are
// read from `data-test-meta`. Both halves of hover-to-open: a mouse resting on an entry opens its
// page; one passing over an entry faster than the delay leaves the open page as it was.
import type { AddressInfo } from "node:net";
import { chromium, selectors, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromiumPath, serve } from "./out-server.ts";

/** The `n` in the `data-test-meta` of the one page the index shows. */
const openStop = async (page: Page): Promise<string> => {
  const meta: unknown = JSON.parse(
    (await page
      .getByTestId("journey-page")
      .filter({ visible: true })
      .getAttribute("data-test-meta")) ?? "{}",
  );
  return typeof meta === "object" && meta !== null && "n" in meta
    ? String(meta.n)
    : "";
};

const entry = (page: Page, n: string) =>
  page
    .getByTestId("journey-stop")
    .filter({ visible: true })
    .and(page.locator(`[data-test-meta='${JSON.stringify({ n })}']`));

describe("the four-stop index, from a tablet up", () => {
  const server = serve();
  let browser: Browser;
  let base = "";

  beforeAll(async () => {
    selectors.setTestIdAttribute("data-test");
    await new Promise<void>((done) => server.listen(0, done));
    base = `http://localhost:${String((server.address() as AddressInfo).port)}`;
    browser = await chromium.launch({ executablePath: chromiumPath() });
  });

  afterAll(async () => {
    await browser.close();
    server.close();
  });

  const desktop = async (): Promise<Page> => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    await page.goto(base + "/");
    await page.getByTestId("journey").scrollIntoViewIfNeeded();
    return page;
  };

  it("opens a stop when the mouse rests on its entry", async () => {
    const page = await desktop();
    expect(await openStop(page)).toBe("01");
    await entry(page, "03").hover();
    await page.waitForTimeout(400);
    expect(await openStop(page)).toBe("03");
    await page.close();
  });

  it("leaves the open stop alone when the mouse only passes over an entry", async () => {
    const page = await desktop();
    await entry(page, "02").hover();
    await page.waitForTimeout(30);
    await page.getByTestId("journey").hover({ position: { x: 4, y: 4 } });
    await page.waitForTimeout(400);
    expect(await openStop(page)).toBe("01");
    await page.close();
  });

  it("still opens a stop on a click", async () => {
    const page = await desktop();
    await entry(page, "04").click();
    expect(await openStop(page)).toBe("04");
    await page.close();
  });
});
