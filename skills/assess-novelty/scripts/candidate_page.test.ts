/**
 * candidate_page.ts: the author's add / cite / skip page for candidate neighbours, and its decisions back into
 * the candidate files. Execution tier: the built page in the pre-installed Chromium, with claude.ai's `db` and
 * `mcp` replaced by stand-ins that record calls; no network, no model.
 * Run: npx vitest run skills/assess-novelty/scripts/candidate_page.test.ts
 *
 * What this does not reach: the claude.ai viewer itself (its frame, its consent prompts, the real store and the
 * real Claude Code Remote connector). Those are exercised once by hand after each publish.
 */
/// <reference lib="dom" />
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const TOOL = join(here, "candidate_page.ts");
const FIXTURE = join(here, "fixtures", "novelty");
import { chromium } from "playwright-core";
import { chromiumPath } from "../../../test/chromium.ts";
import { test } from "vitest";

test("candidate_page", async () => {
  // A 1x1 PNG, enough for an <img> to load.
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const SENTENCE =
    "We ran Checkstyle before and after applying the initial patch and the final patch.";
  const ABSTRACT =
    "We study whether code review removes the coding convention violations a linter reports.";
  const CONCLUSION = [
    "Review removes some violations, and most of the rest stay in the code after the merge.",
    "Tool builders may want to revisit which checks are on by default for code review.",
  ];

  const candidate = {
    id: "roe20",
    title: "Does code review really remove style violations?",
    authors: "Roe, Poe",
    venue: "SomeConf",
    year: 2020,
    url: "https://example.org/roe20",
    text: "siblings/data/roe20.txt",
    found_by: [
      { claim: "P5-1", file: "siblings/2026-10-29-novelty-refutation-P5-1.md" },
    ],
    summary: "Runs a linter on review patches before and after review.",
    abstract: { page: 1, text: ABSTRACT },
    conclusion: { page: 9, text: CONCLUSION.join("\n\n") },
    passages: [
      {
        claim: "P5-1",
        page: 4,
        quote: SENTENCE,
        crop: "siblings/data/crops/roe20-1.png",
        meaning: "The before/after linter run is an established instrument.",
      },
    ],
    suggestion: "cite",
    suggestion_why: "Same instrument, not the same object.",
  };

  const paperDir = () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "cand-page-")));
    cpSync(FIXTURE, dir, { recursive: true });
    for (const d of ["candidates", "data/crops"])
      mkdirSync(join(dir, "siblings", d), { recursive: true });
    writeFileSync(
      join(dir, "siblings", "candidates", "roe20.json"),
      JSON.stringify(candidate, null, 2) + "\n",
    );
    writeFileSync(
      join(dir, "siblings", "data", "roe20.txt"),
      [ABSTRACT, SENTENCE, ...CONCLUSION, ""].join("\n"),
    );
    writeFileSync(join(dir, "siblings", "data", "crops", "roe20-1.png"), PNG);
    writeFileSync(
      join(dir, "siblings", "candidate-page.json"),
      JSON.stringify({
        artifact: "https://claude.ai/artifact/x",
        session: "session_test",
        pdfs: { roe20: "https://example.org/roe20.pdf" },
      }),
    );
    return dir;
  };
  const py = (...args: string[]) =>
    spawnSync(process.execPath, [TOOL, ...args], { encoding: "utf8" });

  // The stand-ins claude.ai would provide. `withClaude: false` is a copy of the page opened outside the viewer.
  const STUB = `
  window.__writes = []; window.__sent = [];
  var listeners = [], docs = {};
  var snap = function () { return { docs: Object.keys(docs).map(function (k) { return { id: k, data: function () { return docs[k]; } }; }) }; };
  var db = { collection: function (c) { return {
    onSnapshot: function (ok) { listeners.push(ok); setTimeout(function () { ok(snap()); }, 0); return function () {}; },
    doc: function (id) { return { set: function (body) { window.__writes.push({ c: c, id: id, body: body });
      docs[id] = body; listeners.forEach(function (f) { f(snap()); });
      // window.__hold keeps a save open until the test calls window.__release(), as a slow store would.
      return window.__hold ? new Promise(function (ok) { window.__release = ok; }) : Promise.resolve(); } }; } }; } };
  var mcp = { callTool: function (s, t, input) { window.__sent.push({ s: s, t: t, input: input }); return Promise.resolve({ content: [] }); } };
  window.claude = { use: function (n) { return Promise.resolve(n === "db" ? db : n === "mcp" ? mcp : null); } };`;

  const browse = async (
    html: string,
    withClaude: boolean,
    steps: (page: any) => Promise<void>,
  ) => {
    const browser = await chromium.launch({
      executablePath: chromiumPath(),
      args: ["--no-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.route("**/*", (r: any) =>
        r.request().url().startsWith("data:") ? r.continue() : r.abort(),
      );
      if (withClaude) await page.addInitScript(STUB);
      await page.goto("about:blank");
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await steps(page);
    } finally {
      await browser.close();
    }
  };

  const dir = paperDir();
  try {
    // ── build: refuses a candidate whose crop is missing, then builds one tab per candidate ──
    const out = join(dir, "page.html");
    rmSync(join(dir, "siblings", "data", "crops", "roe20-1.png"));
    const missing = py("build", dir, out);
    assert.equal(missing.status, 1);
    assert.match(
      missing.stderr,
      /crop siblings\/data\/crops\/roe20-1.png does not exist/,
    );
    writeFileSync(join(dir, "siblings", "data", "crops", "roe20-1.png"), PNG);
    const built = py("build", dir, out);
    assert.equal(built.status, 0, built.stderr);
    const html = readFileSync(out, "utf8");
    assert.match(html, /data:image\/png;base64,/, "the crop is embedded");

    // ── the page: tabs, saving on press, skip needs a reason, send names every decision ──
    await browse(html, true, async (page) => {
      await page.waitForFunction(
        () =>
          document.getElementById("progress")?.textContent === "0 of 1 decided",
      );
      const tabs = await page.$$eval(".tab", (b: any[]) =>
        b.map((x) => x.textContent),
      );
      assert.deepEqual(tabs, ["Overview", "Roe 2020"]);
      await page.click("text=Roe 2020");
      await page.waitForSelector("#choice-roe20-skip:not([disabled])");
      assert.equal(
        await page.getAttribute("a:has-text('Open the PDF')", "href"),
        "https://example.org/roe20.pdf",
      );
      assert.match(
        (await page.textContent("blockquote")) as string,
        /We ran Checkstyle/,
      );
      assert.equal(
        await page
          .getAttribute(".passage img", "src")
          .then((s: string) => s.slice(0, 22)),
        "data:image/png;base64,",
      );

      // The authors' own abstract and conclusion come first, each with its page; a long conclusion folds after
      // its first paragraph.
      assert.equal(
        await page.textContent("#own-roe20-abstract figcaption"),
        "Abstract  ·  PDF p. 1",
      );
      assert.equal(await page.textContent("#own-roe20-abstract > p"), ABSTRACT);
      assert.equal(
        await page.textContent("#own-roe20-conclusion figcaption"),
        "Conclusion  ·  PDF p. 9",
      );
      assert.equal(
        await page.textContent("#own-roe20-conclusion > p"),
        CONCLUSION[0],
      );
      assert.equal(
        await page.isVisible(
          `#own-roe20-conclusion details p:has-text("${CONCLUSION[1]}")`,
        ),
        false,
      );
      await page.click("#own-roe20-conclusion summary");
      assert.equal(
        await page.isVisible(
          `#own-roe20-conclusion details p:has-text("${CONCLUSION[1]}")`,
        ),
        true,
      );
      assert.equal(
        await page.evaluate(() => {
          const own = document.getElementById("own-roe20-abstract"),
            fig = document.querySelector(".passage");
          return (
            !!own &&
            !!fig &&
            !!(
              own.compareDocumentPosition(fig) &
              Node.DOCUMENT_POSITION_FOLLOWING
            )
          );
        }),
        true,
        "the authors' words sit above the passages",
      );

      await page.click("#choice-roe20-skip");
      assert.match(
        (await page.textContent(".status.warn")) as string,
        /Skip needs a reason/,
      );
      assert.deepEqual(
        await page.evaluate(() => (window as any).__writes),
        [],
        "an empty-reason skip saves nothing",
      );

      await page.fill("#reason-roe20", "the instrument only");
      await page.click("#choice-roe20-cite");
      await page.waitForFunction(
        () =>
          document.getElementById("progress")?.textContent === "1 of 1 decided",
      );
      const writes = await page.evaluate(() => (window as any).__writes);
      assert.equal(writes.length, 1);
      assert.equal(writes[0].c, "decisions");
      assert.equal(writes[0].id, "roe20");
      assert.deepEqual(
        { ...writes[0].body, at: "t" },
        {
          choice: "cite",
          reason: "the instrument only",
          at: "t",
          source: "page",
        },
      );
      assert.equal(
        await page.getAttribute("#choice-roe20-cite", "aria-pressed"),
        "true",
      );

      await page.click("#send");
      await page.waitForFunction(() =>
        /Sent to Claude/.test(
          document.getElementById("sendstatus")?.textContent || "",
        ),
      );
      const sent = await page.evaluate(() => (window as any).__sent);
      assert.equal(sent.length, 1);
      assert.equal(sent[0].s, "Claude Code Remote");
      assert.equal(sent[0].t, "send_message");
      assert.equal(sent[0].input.session_id, "session_test");
      assert.match(
        sent[0].input.message,
        /- roe20: cite \(the instrument only\)/,
      );

      // A reason typed while a save is still in flight survives the save's success.
      await page.evaluate(() => {
        (window as any).__hold = true;
      });
      await page.fill("#reason-roe20", "first reason");
      await page.click("#choice-roe20-add");
      await page.waitForSelector("#choice-roe20-add[disabled]");
      // Send waits for the write: sent now, it would hand Claude the previous choice.
      assert.equal(
        await page.isDisabled("#send"),
        true,
        "Send is off while a decision is saving",
      );
      await page.fill("#reason-roe20", "first reason, then a second thought");
      await page.evaluate(() => (window as any).__release());
      await page.waitForSelector("#choice-roe20-add:not([disabled])");
      assert.equal(
        await page.inputValue("#reason-roe20"),
        "first reason, then a second thought",
      );
      assert.equal(
        await page.isDisabled("#send"),
        false,
        "Send is back once the write succeeded",
      );
    });

    // ── outside the viewer: read-only, said so, no send button ──
    await browse(html, false, async (page) => {
      await page.click("text=Roe 2020");
      assert.match(
        (await page.textContent(".banner")) as string,
        /cannot be saved in this view/,
      );
      assert.equal(await page.isDisabled("#choice-roe20-add"), true);
      assert.equal(await page.isHidden("#send"), true);
    });

    // ── export: decisions into the candidate file; an unknown id or choice writes nothing ──
    const dump = join(dir, "dump", "decisions");
    mkdirSync(dump, { recursive: true });
    const file = join(dir, "siblings", "candidates", "roe20.json");
    const before = readFileSync(file, "utf8");
    writeFileSync(
      join(dump, "nobody99.json"),
      JSON.stringify({ choice: "add", at: "2026-10-29T17:00:00Z" }),
    );
    writeFileSync(
      join(dump, "roe20.json"),
      JSON.stringify({
        choice: "cite",
        reason: "the instrument only",
        at: "2026-10-29T17:00:00Z",
        source: "page",
      }),
    );
    const refused = py("export", dir, join(dir, "dump"));
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /nobody99: no candidate with this id/);
    assert.equal(
      readFileSync(file, "utf8"),
      before,
      "a refused export writes nothing",
    );
    rmSync(join(dump, "nobody99.json"));
    const ok = py("export", dir, join(dir, "dump"));
    assert.equal(ok.status, 0, ok.stderr);
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")).decision, {
      choice: "cite",
      reason: "the instrument only",
      at: "2026-10-29T17:00:00Z",
      source: "page",
    });
    assert.match(
      py("export", dir, join(dir, "dump")).stdout,
      /roe20: unchanged \(cite\)/,
    );
    // The exported decision settles the candidate in the checker too.
    const check = spawnSync(
      "python3",
      ["-I", join(here, "check_novelty.py"), dir],
      { encoding: "utf8" },
    );
    assert.doesNotMatch(
      check.stdout + check.stderr,
      /roe20/,
      check.stdout + check.stderr,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 300_000);
