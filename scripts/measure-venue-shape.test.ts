/**
 * The venue-shape measurement: a corpus of papers read and counted into a preset's `shape`, on fake
 * readers for the decisions and on two real PDFs served from a local HTTP server for the edge —
 * an IEEEtran and an acmart build of `fixtures/venue-shape/`, whose shapes are known (each one's
 * `.tex` says it). Never the network. Both halves: what was measured is written, what was not is
 * named, and a run that measured nothing leaves the preset alone.
 */
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";
import { parsePreset } from "../src/tex-requirements.ts";
import { useTempDir } from "../test/support.ts";
import {
  argsOf,
  main,
  measureCorpus,
  pdfReader,
  summaryOf,
  titleFound,
  withShape,
  type Corpus,
  type ReadPaper,
  type Row,
} from "./measure-venue-shape.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FIX = join(ROOT, "fixtures", "venue-shape");
const SCRIPT = join(ROOT, "scripts", "measure-venue-shape.ts");
const TITLE = "Counting the Shape of a Small Paper";

/** The two fixtures as pdf.js reads them (measured once; each `.tex` states the shape). */
const IEEE_ROW = {
  pages: 1,
  body_words: 81,
  figures: 2,
  tables: 1,
  abstract_words: 26,
  references: 5,
};
const ACM_ROW = { ...IEEE_ROW, body_words: 85 };

const PRESET = `// A venue preset of the test's own.
{
  "type": "venue",
  "name": "ShapeConf",
  "url": "https://example.org/cfp",
  // the template family
  "extends": "paperlint:ieee-conference",
}
`;

const page = (title: string): readonly string[] => [
  `${title}\nAbstract—one two\nIndex Terms—x\nFig. 1. a\nREFERENCES\n[1] A.\n`,
];
const fakeRead =
  (byUrl: Readonly<Record<string, readonly string[] | string>>): ReadPaper =>
  async (url) => {
    const r = byUrl[url];
    return Promise.resolve(
      Array.isArray(r)
        ? { ok: true, pageTexts: r }
        : { ok: false, why: typeof r === "string" ? r : "no such url" },
    );
  };
const CORPUS: Corpus = {
  source: "ShapeConf 2025 accepted papers",
  url: "https://example.org/accepted",
  papers: [
    { paper: "A Good Paper", url: "https://example.org/a.pdf" },
    { paper: "A Gone Paper", url: "https://example.org/b.pdf" },
    { paper: "The Paper Named Wrong", url: "https://example.org/c.pdf" },
  ],
};
const READ = fakeRead({
  "https://example.org/a.pdf": page("A Good Paper"),
  "https://example.org/b.pdf": "HTTP 404",
  "https://example.org/c.pdf": page("Some Other Paper Entirely"),
});

describe("measureCorpus", () => {
  test("measures what it can read, names what it cannot, flags a PDF without its title", async () => {
    const row = {
      pages: 1,
      body_words: 9,
      figures: 1,
      tables: 0,
      abstract_words: 2,
      references: 1,
    };
    expect(await measureCorpus(CORPUS, READ)).toEqual({
      rows: [
        { paper: "A Good Paper", url: "https://example.org/a.pdf", ...row },
        {
          paper: "The Paper Named Wrong",
          url: "https://example.org/c.pdf",
          ...row,
          body_words: 10,
        },
      ],
      failed: ["A Gone Paper (https://example.org/b.pdf): HTTP 404"],
      unsure: ["The Paper Named Wrong (https://example.org/c.pdf)"],
    });
  });
});

describe("titleFound", () => {
  test("the title's first six words, across a line break and in another case", () => {
    expect(
      titleFound("Does It Work? A Study of Many Things", [
        "DOES IT WORK? A\nSTUDY OF things\n",
      ]),
    ).toBe(true);
    expect(titleFound("Does It Work?", ["Something else\n"])).toBe(false);
  });
});

describe("withShape — on the JSONC's syntax tree, comments kept", () => {
  const value = { source: "s", url: "https://x.org", measured: "2026-10-11" };
  test("no `shape` yet: added as the last property, after the trailing comma", async () => {
    expect(await withShape(PRESET, "p.jsonc", value)).toBe(
      PRESET.replace(
        "}\n",
        '\n  "shape": {\n    "source": "s",\n    "url": "https://x.org",\n    "measured": "2026-10-11",\n  },\n}\n',
      ),
    );
  });
  test("a last property with no comma gets one", async () => {
    expect(await withShape('{ "type": "venue" }', "p.jsonc", { a: 1 })).toBe(
      '{\n  "type": "venue",\n\n  "shape": {\n    "a": 1,\n  },\n}\n',
    );
  });
  test("an existing `shape` is replaced where it stands, nothing else moves", async () => {
    const once = await withShape(PRESET, "p.jsonc", { a: 1 });
    const twice = await withShape(once, "p.jsonc", { b: 2 });
    expect(twice).toBe(once.replace('"a": 1', '"b": 2'));
  });
  test("a file that is not an object is refused", async () => {
    await expect(withShape("[1]", "p.jsonc", {})).rejects.toThrow(
      "p.jsonc: not a JSON object",
    );
  });
});

describe("summaryOf", () => {
  test("five numbers per measure, and a measure no paper carries said as such", () => {
    const row = (n: number): Row => ({
      paper: "p",
      url: "https://x.org",
      pages: 1,
      body_words: n,
      figures: n,
      tables: n,
      abstract_words: n,
      references: null,
    });
    expect(summaryOf([row(1), row(3)])).toEqual([
      "body_words: n=2  min 1 · q1 1.5 · median 2 · q3 2.5 · max 3",
      "figures: n=2  min 1 · q1 1.5 · median 2 · q3 2.5 · max 3",
      "tables: n=2  min 1 · q1 1.5 · median 2 · q3 2.5 · max 3",
      "abstract_words: n=2  min 1 · q1 1.5 · median 2 · q3 2.5 · max 3",
      "references: counted on none",
    ]);
  });
});

const dir = useTempDir("paperlint-venue-shape-");
const run = async (preset: string, corpus: string | null, read = READ) => {
  const lines: string[] = [];
  const rc = await main({
    preset,
    corpus,
    read,
    today: "2026-10-11",
    log: (l) => lines.push(l),
  });
  return { rc, lines };
};
/** A fresh copy of PRESET and a corpus file holding `corpus`, under `name`. */
const files = (name: string, corpus: unknown): readonly [string, string] => {
  const preset = join(dir, `${name}.jsonc`);
  const file = join(dir, `${name}.corpus.json`);
  writeFileSync(preset, PRESET);
  writeFileSync(file, JSON.stringify(corpus));
  return [preset, file];
};

describe("main — what it writes", () => {
  test("a corpus measured into the preset: written, summarised, the failures named — exit 0", async () => {
    const [preset, corpus] = files("a", CORPUS);
    const { rc, lines } = await run(preset, corpus);
    expect([rc, lines[0], lines[1], lines.at(-1)]).toEqual([
      0,
      "✗ not measured: A Gone Paper (https://example.org/b.pdf): HTTP 404",
      "? the title is not on its first pages — check the PDF by hand: The Paper Named Wrong (https://example.org/c.pdf)",
      `✓ measured 2 of 3 papers into ${preset}`,
    ]);
    const shape = parsePreset(readFileSync(preset, "utf8"), preset).shape;
    expect([shape?.measured, shape?.papers.map((p) => p.paper)]).toEqual([
      "2026-10-11",
      ["A Good Paper", "The Paper Named Wrong"],
    ]);
  });

  test("without --corpus, the papers the preset lists are measured again", async () => {
    const [preset, corpus] = files("b", {
      ...CORPUS,
      papers: [CORPUS.papers[0]],
    });
    await run(preset, corpus);
    const noFigure = page("A Good Paper").map((p) =>
      p.replace("Fig. 1. a\n", ""),
    );
    const again = await run(
      preset,
      null,
      fakeRead({ "https://example.org/a.pdf": noFigure }),
    );
    expect(again.rc).toBe(0);
    expect(
      parsePreset(readFileSync(preset, "utf8"), preset).shape?.papers[0]?.shape
        .figures,
    ).toBe(0);
  });
});

describe("main — what it refuses", () => {
  test("nothing measured: exit 1, the preset untouched", async () => {
    const [preset, corpus] = files("c", {
      ...CORPUS,
      papers: [CORPUS.papers[1]],
    });
    const { rc, lines } = await run(preset, corpus);
    expect([rc, lines.at(-1), readFileSync(preset, "utf8")]).toEqual([
      1,
      `✗ measured 0 of 1 papers — ${preset} not written`,
      PRESET,
    ]);
  });

  test("a corpus file that is not a corpus, or a preset with no shape and no corpus: exit 1, saying which", async () => {
    const [preset, corpus] = files("d", { source: "s", papers: [] });
    const bad = await run(preset, corpus);
    expect([
      bad.rc,
      bad.lines[0]?.startsWith(`✗ ${corpus} is not a corpus:`),
    ]).toEqual([1, true]);
    expect(await run(preset, null)).toEqual({
      rc: 1,
      lines: [
        `✗ ${preset} has no "shape" to measure again — name the papers with --corpus`,
      ],
    });
  });
});

describe("argsOf", () => {
  test("the preset, the corpus, the cache; a default cache under the temp directory", () => {
    expect(
      argsOf(["--corpus", "c.json", "p.jsonc", "--cache", "/tmp/x"]),
    ).toEqual({
      preset: "p.jsonc",
      corpus: "c.json",
      cache: "/tmp/x",
    });
    expect(argsOf(["p.jsonc", "--corpus"]).corpus).toBeNull();
    const d = argsOf([]);
    expect([
      d.preset,
      d.corpus,
      d.cache.endsWith("paperlint-venue-shape"),
    ]).toEqual([null, null, true]);
  });
});

// ── the edge: real PDFs over HTTP, read by pdf.js ─────────────────────────────────────────────

const served = new Map<string, Uint8Array>([
  ["/ieee.pdf", readFileSync(join(FIX, "ieee.pdf"))],
  ["/acm.pdf", readFileSync(join(FIX, "acm.pdf"))],
  ["/not.pdf", new TextEncoder().encode("not a PDF")],
]);
const server: Server = createServer((req, res) => {
  const body = served.get(req.url ?? "");
  res.statusCode = body === undefined ? 404 : 200;
  res.end(body ?? "gone");
});
const base = { url: "" };
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const a = server.address();
  base.url = `http://127.0.0.1:${String(typeof a === "object" && a !== null ? a.port : 0)}`;
});
afterAll(() => {
  server.close();
});

/** What one read gave: the page count, or why there is none. */
const readOf = async (cache: string, url: string): Promise<number | string> => {
  const r = await pdfReader(join(dir, cache))(url);
  return r.ok ? r.pageTexts.length : r.why;
};

describe("pdfReader, on PDFs served locally", () => {
  test("a PDF is read; a 404, a file that is not a PDF and a closed port each say why", async () => {
    expect(await readOf("cache", `${base.url}/ieee.pdf`)).toBe(1);
    expect(await readOf("cache", `${base.url}/gone.pdf`)).toBe("HTTP 404");
    expect(String(await readOf("cache", `${base.url}/not.pdf`))).toMatch(
      /^unreadable: /u,
    );
    expect(String(await readOf("c2", "http://127.0.0.1:1/x.pdf"))).toMatch(
      /^unreachable: /u,
    );
  });

  test("a PDF read once is read from the cache after the server lost it", async () => {
    const url = `${base.url}/ieee.pdf`;
    expect(await readOf("cache-once", url)).toBe(1);
    served.delete("/ieee.pdf");
    expect(await readOf("cache-once", url)).toBe(1);
    served.set("/ieee.pdf", readFileSync(join(FIX, "ieee.pdf")));
  });
});

const Failed = z.object({ code: z.number(), stderr: z.string() });

describe("the script, as a maintainer runs it", () => {
  test(
    "an IEEEtran and an acmart build: both rows written as their sources say, exit 0",
    { timeout: 60_000 },
    async () => {
      const [preset, corpus] = files("http", {
        source: "two fixtures",
        url: "https://example.org/accepted",
        papers: [
          { paper: TITLE, url: `${base.url}/ieee.pdf` },
          { paper: TITLE, url: `${base.url}/acm.pdf` },
        ],
      });
      // Asynchronously: the local server answers from THIS process, which a synchronous spawn blocks.
      const r = await promisify(execFile)(process.execPath, [
        SCRIPT,
        preset,
        "--corpus",
        corpus,
        "--cache",
        join(dir, "cache-script"),
      ]); // rejects on a non-zero exit, with the output
      expect(r.stdout).toMatch(/✓ measured 2 of 2 papers into /u);
      const shape = parsePreset(readFileSync(preset, "utf8"), preset).shape;
      expect(
        shape?.papers.map((p) => ({ pages: p.pages, ...p.shape })),
      ).toEqual([IEEE_ROW, ACM_ROW]);
    },
  );

  test("without a preset: the usage line, exit 2", async () => {
    const failed = await promisify(execFile)(process.execPath, [SCRIPT]).then(
      () => null,
      (e: unknown) => Failed.parse(e),
    );
    expect(failed).toEqual({
      code: 2,
      stderr:
        "usage: node scripts/measure-venue-shape.ts <preset.jsonc> [--corpus <corpus.json>] [--cache <dir>]\n",
    });
  });
});
