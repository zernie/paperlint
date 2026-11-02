/**
 * crop_quote.py: a verbatim passage is found in a PDF by its words, highlighted on its page and cropped.
 * Execution tier: the committed fixtures/crop-quote/sample.pdf (made by make_sample.py beside it), no network.
 * Run: npx vitest run skills/assess-novelty/scripts/crop_quote.test.ts
 *
 * Why: the scratch version matched the first 6 or 3 words when the whole passage did not match, and
 * took the first hit, so a crop of a paper landed on the abstract instead of the method section. Every
 * passage shown to the author as "the paper says this" rests on this match, so a wrong place must be a refusal.
 */
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "vitest";

test("crop_quote", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const TOOL = join(here, "crop_quote.py");
  const PDF = join(here, "fixtures", "crop-quote", "sample.pdf");
  // -E -P is -I without -s. On the CI runner pip installs PyMuPDF into the user's site-packages (it is not
  // root), which -I hides: run 40937989243 failed with neither pymupdf nor fitz importable. -E and -P still keep
  // PYTHON* variables out and the current and script directories off sys.path.
  const PY = ["-E", "-P"];

  const run = (passage: string, ...extra: string[]) => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "crop-quote-")));
    try {
      const out = join(dir, "crop.png");
      const r = spawnSync(
        "python3",
        [...PY, TOOL, PDF, out, passage, ...extra],
        {
          encoding: "utf8",
        },
      );
      // Yellow highlight pixels in the crop: red and green high, blue low.
      const yellow = existsSync(out)
        ? Number(
            spawnSync(
              "python3",
              [
                ...PY,
                "-c",
                "import sys\nimport pymupdf\npx = pymupdf.Pixmap(sys.argv[1]); s, n = px.samples, px.n; " +
                  "print(sum(1 for i in range(0, len(s), n) if s[i] > 200 and s[i + 1] > 180 and s[i + 2] < 160))",
                out,
              ],
              { encoding: "utf8" },
            ).stdout.trim(),
          )
        : 0;
      return {
        code: r.status,
        out: r.stdout,
        err: r.stderr,
        written: existsSync(out),
        yellow,
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const json = (s: string) => JSON.parse(s.trim());

  // ── fires: a passage on one page is found, highlighted and reported with its page ──
  {
    const r = run(
      "We ran Checkstyle before and after applying the initial patch",
    );
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(json(r.out), {
      page: 2,
      pages: [2],
      words: "We ran Checkstyle before and after applying the initial patch",
    });
    assert.ok(
      r.yellow > 500,
      `the crop carries the highlight (yellow pixels: ${r.yellow})`,
    );
  }

  // ── a word split by a line-end hyphen still matches, and case and punctuation do not matter ──
  {
    const r = run("THE CONFIGURATIONS, of every linter");
    assert.equal(r.code, 0, r.err);
    assert.equal(json(r.out).words, "the configu- rations of every linter");
  }

  // ── two columns: a sentence over two lines of the left column is read in column order, not across the page ──
  {
    const r = run(
      "Developers can configure most linters through a file that sits next to the code",
    );
    assert.equal(r.code, 0, r.err);
    assert.equal(json(r.out).page, 3);
  }

  // ── quiet: a passage the PDF does not hold writes nothing ──
  {
    const r = run("Rules written only in prose are broken more often than");
    assert.equal(r.code, 1, "a near miss is NOT FOUND, never a shorter match");
    assert.match(r.err, /NOT FOUND/);
    assert.equal(r.written, false);
  }

  // ── refuses: the same passage on two pages (abstract and body) without --page ──
  {
    const r = run("Rules written only in prose are broken as often");
    assert.equal(r.code, 3);
    assert.match(r.err, /ON SEVERAL PAGES \[1, 2\]: pass --page/);
    assert.equal(r.written, false);
  }

  // ── --page picks one, and a page the passage is not on is NOT FOUND ──
  {
    const r = run(
      "Rules written only in prose are broken as often",
      "--page",
      "2",
    );
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(json(r.out).pages, [1, 2]);
    assert.equal(json(r.out).page, 2);
    const wrong = run("We ran Checkstyle before and after", "--page", "1");
    assert.equal(wrong.code, 1);
    assert.match(wrong.err, /NOT ON PAGE 1: found on pages \[2\]/);
  }
}, 300_000);
