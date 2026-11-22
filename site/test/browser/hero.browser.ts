// The hero's cycling venue in a real browser, on the exported page in out/ (`npm run test:browser`):
// while the names change, the headline keeps one height at every width, so the page below never
// moves. The clock is Playwright's, stepped through one whole cycle; both halves are read from the
// page: the heights, and every name it showed (a cycle that never moved would pass on height alone).
import type { AddressInfo } from "node:net";
import { chromium, selectors, type Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromiumPath, serve } from "./out-server.ts";

/** The narrowest phone, two common ones, a tablet, a small and a wide laptop. */
const WIDTHS = [320, 375, 414, 768, 1024, 1280] as const;
/** VenueCycle's interval, and the step the page is sampled at (mid-transition frames included). */
const EVERY = 2600;
const STEP = 200;

/** The names a `data-test-meta` lists, or its one name. */
const namesIn = (raw: string | null): readonly string[] =>
  (JSON.parse(raw ?? "{}") as { names?: string[] }).names ?? [];
const nameIn = (raw: string | null): string =>
  (JSON.parse(raw ?? "{}") as { name?: string }).name ?? "";

describe("the hero's cycling venue", () => {
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

  it.each(WIDTHS)(
    "at %ipx the headline keeps one height through every name",
    async (width) => {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.clock.install();
      await page.goto(base + "/");
      // Measured in the page's own fonts: the fallback is narrower and wraps where they do not.
      await page.evaluate(() => document.fonts.ready);
      const title = page.getByTestId("hero-title");
      const names = namesIn(
        await page.getByTestId("venue-cycle").getAttribute("data-test-meta"),
      );
      // The names ON SCREEN (an exiting and an entering one may overlap), not the component's state.
      const shown = async (): Promise<string> =>
        (
          await page
            .getByTestId("venue-name")
            .evaluateAll((els) =>
              els.map((e) => e.getAttribute("data-test-meta")),
            )
        )
          .map(nameIn)
          .join(" + ");
      const sample = async () => ({
        height: (await title.boundingBox())?.height ?? -1,
        name: await shown(),
      });
      const samples = await Array.from(
        { length: Math.ceil((names.length * EVERY) / STEP) + 1 },
        (_, i) => i,
      ).reduce<Promise<readonly { height: number; name: string }[]>>(
        async (acc, i) => {
          const done = await acc;
          if (i > 0) await page.clock.runFor(STEP);
          const during = await sample();
          // Motion fades on the Web Animations timeline, which the fake clock does not drive:
          // finish them, so the next name mounts, and measure the settled frame too.
          await page.evaluate(() => {
            document.getAnimations().forEach((a) => {
              a.finish();
            });
          });
          return [...done, during, await sample()];
        },
        Promise.resolve([]),
      );
      await page.close();
      expect({
        heights: [...new Set(samples.map((s) => s.height))],
        seen: [...new Set(samples.flatMap((s) => s.name.split(" + ")))]
          .filter(Boolean)
          .sort(),
      }).toEqual({
        heights: [samples[0]?.height],
        seen: [...names].sort(),
      });
    },
  );
});
