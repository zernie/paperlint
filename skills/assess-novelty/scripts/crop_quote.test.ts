/**
 * crop_quote.ts: a verbatim passage is found in a PDF by its words, highlighted on its page and cropped.
 * Execution tier: the committed fixtures/crop-quote/sample.pdf (made by make_sample.py beside it), no network.
 * Run: npx vitest run skills/assess-novelty/scripts/crop_quote.test.ts
 *
 * Why: the scratch version matched the first 6 or 3 words when the whole passage did not match, and
 * took the first hit, so a crop of a paper landed on the abstract instead of the method section. Every
 * passage shown to the author as "the paper says this" rests on this match, so a wrong place must be a refusal.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { runNode, useTempDir } from "../../../test/support.ts";

const here = dirname(fileURLToPath(import.meta.url));
const TOOL = join(here, "crop_quote.ts");
const PDF = join(here, "fixtures", "crop-quote", "sample.pdf");
const SOURCES = "--conditions=paperlint-source";
/** A preload under which `@napi-rs/canvas` is not installed, whatever node_modules holds. */
const NO_CANVAS =
  "data:text/javascript," +
  encodeURIComponent(
    `import { registerHooks } from "node:module";
registerHooks({ resolve(s, c, next) {
  if (s === "@napi-rs/canvas") throw Object.assign(new Error("Cannot find package '@napi-rs/canvas'"), { code: "ERR_MODULE_NOT_FOUND" });
  return next(s, c);
} });`,
  );

const dir = useTempDir("crop-quote-");
let made = 0;

/** Yellow highlight pixels in a PNG: red and green high, blue low. */
async function yellowIn(png: string): Promise<number> {
  const img = await loadImage(readFileSync(png));
  const ctx = createCanvas(img.width, img.height).getContext("2d");
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, img.width, img.height).data;
  return Array.from({ length: px.length / 4 }, (_, i) => i * 4).filter(
    (i) =>
      (px[i] ?? 0) > 200 && (px[i + 1] ?? 0) > 180 && (px[i + 2] ?? 0) < 160,
  ).length;
}

const run = async (
  args: readonly string[],
  nodeArgs: readonly string[] = [SOURCES],
) => {
  made += 1;
  const out = join(dir, `crop-${String(made)}.png`);
  const r = runNode(TOOL, [args[0] ?? PDF, out, ...args.slice(1)], {
    nodeArgs,
  });
  const written = existsSync(out);
  return {
    code: r.status,
    out: r.stdout,
    err: r.stderr,
    written,
    yellow: written ? await yellowIn(out) : 0,
  };
};
const json = (s: string): unknown => JSON.parse(s);

describe("crop_quote — what it finds", { timeout: 60_000 }, () => {
  // ── fires: a passage on one page is found, highlighted and reported with its page ──
  it("finds a passage on one page, highlights it and reports its page", async () => {
    const r = await run([
      PDF,
      "We ran Checkstyle before and after applying the initial patch",
    ]);
    expect({ code: r.code, err: r.err, out: json(r.out) }).toEqual({
      code: 0,
      err: "",
      out: {
        page: 2,
        pages: [2],
        words: "We ran Checkstyle before and after applying the initial patch",
      },
    });
    // Guards: the crop carries the highlight, not only the page.
    expect(r.yellow).toBeGreaterThan(500);
  });

  it("matches a word split by a line-end hyphen, whatever the case and punctuation", async () => {
    const r = await run([PDF, "THE CONFIGURATIONS, of every linter"]);
    expect({ code: r.code, out: json(r.out) }).toEqual({
      code: 0,
      out: {
        page: 2,
        pages: [2],
        words: "the configu- rations of every linter",
      },
    });
  });

  it("reads two columns in column order, not across the page", async () => {
    const r = await run([
      PDF,
      "Developers can configure most linters through a file that sits next to the code",
    ]);
    expect({
      code: r.code,
      page: (json(r.out) as { page: number }).page,
    }).toEqual({
      code: 0,
      page: 3,
    });
  });
});

describe("crop_quote — a passage across two pages", { timeout: 60_000 }, () => {
  it("a passage that runs past the page highlights the part on it, and says so", async () => {
    const r = await run([
      PDF,
      "rules a linter checks. This sentence fills the first page",
    ]);
    expect({ code: r.code, err: r.err, out: json(r.out) }).toEqual({
      code: 0,
      err: "",
      out: {
        page: 1,
        pages: [1],
        words: "rules a linter checks. This sentence fills the first page",
      },
    });
    const across = await run([
      PDF,
      "not quoted by any test. Introduction. Rules written",
    ]);
    expect({
      code: across.code,
      err: across.err,
      out: json(across.out),
    }).toEqual({
      code: 0,
      err: "passage runs past page 1: highlighted the part on it\n",
      out: { page: 1, pages: [1], words: "not quoted by any test." },
    });
  });
});

describe("crop_quote — what it refuses", { timeout: 60_000 }, () => {
  // ── quiet: a passage the PDF does not hold writes nothing ──
  it("a near miss is NOT FOUND, never a shorter match", async () => {
    const r = await run([
      PDF,
      "Rules written only in prose are broken more often than",
    ]);
    expect(r).toEqual({
      code: 1,
      out: "",
      err: "NOT FOUND: Rules written only in prose are broken more often than\n",
      written: false,
      yellow: 0,
    });
    const empty = await run([PDF, "—"]);
    expect({ code: empty.code, written: empty.written }).toEqual({
      code: 1,
      written: false,
    });
  });

  // ── refuses: the same passage on two pages (abstract and body) without --page ──
  it("refuses a passage on two pages without --page", async () => {
    const r = await run([
      PDF,
      "Rules written only in prose are broken as often",
    ]);
    expect(r).toEqual({
      code: 3,
      out: "",
      err: "ON SEVERAL PAGES [1, 2]: pass --page to pick one\n",
      written: false,
      yellow: 0,
    });
  });
});

describe("crop_quote — --page", { timeout: 60_000 }, () => {
  it("--page picks one, and a page the passage is not on is NOT ON PAGE", async () => {
    const r = await run([
      PDF,
      "Rules written only in prose are broken as often",
      "--page",
      "2",
    ]);
    expect({ code: r.code, out: json(r.out) }).toEqual({
      code: 0,
      out: {
        page: 2,
        pages: [1, 2],
        words: "Rules written only in prose are broken as often",
      },
    });
    const wrong = await run([
      PDF,
      "We ran Checkstyle before and after",
      "--page",
      "1",
    ]);
    expect({
      code: wrong.code,
      err: wrong.err,
      written: wrong.written,
    }).toEqual({
      code: 1,
      err: "NOT ON PAGE 1: found on pages [2]\n",
      written: false,
    });
  });
});

// ── a PDF it cannot read, a missing renderer and a wrong call are exit 2, never a NOT FOUND ──
describe("crop_quote — what stops it", { timeout: 60_000 }, () => {
  it("a PDF pdf.js cannot read is exit 2 with its reason", async () => {
    const broken = join(dir, "broken.pdf");
    writeFileSync(broken, "%PDF-1.4\n% not a real pdf\n");
    const r = await run([broken, "anything"]);
    expect(r).toEqual({
      code: 2,
      out: "",
      err: `could not read ${broken} with pdf.js (unreadable): InvalidPDFException: Invalid PDF structure.\n`,
      written: false,
      yellow: 0,
    });
  });

  it("without @napi-rs/canvas it is exit 2, naming the command that installs it", async () => {
    const r = await run(
      [PDF, "We ran Checkstyle"],
      [SOURCES, "--import", NO_CANVAS],
    );
    expect(r).toEqual({
      code: 2,
      out: "",
      err:
        "crop_quote draws the crop with @napi-rs/canvas, which is not installed: " +
        "npm install --save-dev @napi-rs/canvas (Cannot find package '@napi-rs/canvas')\n",
      written: false,
      yellow: 0,
    });
  });

  it("a wrong call is a usage error", () => {
    const usage =
      'usage: node crop_quote.js <pdf> <out.png> "<passage>" [--page N]\n';
    const calls = [
      [],
      [PDF, "out.png"],
      [PDF, "out.png", "x", "--page", "0"],
      [PDF, "out.png", "x", "--bogus"],
    ];
    expect(
      calls.map((a) => {
        const r = runNode(TOOL, a, { nodeArgs: [SOURCES] });
        return { status: r.status, stdout: r.stdout, stderr: r.stderr };
      }),
    ).toEqual(calls.map(() => ({ status: 2, stdout: "", stderr: usage })));
  });
});
