/**
 * The Chromium a browser test drives: CHROMIUM_PATH, a build in PLAYWRIGHT_BROWSERS_PATH, or the
 * Chrome a GitHub runner ships, so nothing is downloaded. playwright-core is what package.json declares.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const BROWSERS_DIR = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
const SYSTEM_CHROME = [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", // the macOS runner's Chrome
];

export const chromiumPath = (): string => {
  const builds = existsSync(BROWSERS_DIR)
    ? readdirSync(BROWSERS_DIR)
        .filter((d) => /^chromium-\d+$/.test(d))
        .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))
        .flatMap((d) =>
          ["chrome-linux64", "chrome-linux"].map((sub) =>
            join(BROWSERS_DIR, d, sub, "chrome"),
          ),
        )
    : [];
  const found = [process.env.CHROMIUM_PATH, ...builds, ...SYSTEM_CHROME].find(
    (p) => p && existsSync(p),
  );
  if (!found)
    throw new Error(
      `no Chromium: set CHROMIUM_PATH, or install one in ${BROWSERS_DIR}, or at ${SYSTEM_CHROME.join(", ")}`,
    );
  return found;
};
