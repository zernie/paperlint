// The exported page in out/, served over HTTP as a static host serves it, and the Chromium that
// drives it. Shared by the browser tests; nothing is downloaded.
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join } from "node:path";

const OUT = join(import.meta.dirname, "../../out");

/**
 * The Chromium to drive: CHROMIUM_PATH, or the Chrome a GitHub runner ships; otherwise Playwright's
 * own build in PLAYWRIGHT_BROWSERS_PATH. Nothing is downloaded.
 */
export const chromiumPath = (): string | undefined =>
  [
    process.env.CHROMIUM_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((p) => p !== undefined && existsSync(p));

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
};

/** out/ over HTTP, as a static host serves it: `/x` is `x.html`, `/` is `index.html`. */
export const serve = (): Server =>
  createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    const file = [url.endsWith("/") ? url + "index.html" : url, url + ".html"]
      .map((p) => join(OUT, p))
      .find((p) => existsSync(p) && statSync(p).isFile());
    if (file === undefined) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    });
    res.end(readFileSync(file));
  });
