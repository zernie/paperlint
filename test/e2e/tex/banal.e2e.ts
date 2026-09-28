/**
 * The REAL banal, installed by `paperlint toolchain`, measuring the committed PDF
 * fixtures through paperlint's own path: pdf.js → pdftohtml-style XML → `perl banal`. No poppler.
 *
 * 🔴 THE EXPECTED NUMBERS ARE NOT OURS. Each one is what the same banal (1.2, HotCRP f3e4352)
 * printed when it read the same PDF the way HotCRP does, through poppler's `pdftohtml` 24.02.0 —
 * recorded 2026-09-25 on the machine that measured issue #61. So a pass is agreement with banal
 * on real pdftohtml, i.e. with what HotCRP shows at upload, not agreement with an earlier run of
 * this code. Rerecord them only with real pdftohtml, never from this test's own output.
 *
 * What it asserts, in order:
 *   1. every fixture's geometry, through `measureLayout`, equals the recorded one — with a PATH
 *      that holds perl and nothing else, so no pdftohtml can be what answered;
 *   2. the four conditions `adapters/banal/xml.ts` names are each load-bearing on `hidden-text.pdf`: switch
 *      one off and the measurement changes (a condition that changes nothing is untested);
 *   3. without a pdftohtml to answer `-v`, banal does not run, and a stub answering an old version
 *      moves the body size — so both the stub and the version it answers are load-bearing;
 *   4. `extract-pdf-facts.mjs --strict` writes the facts with `geometry_source: "banal"`.
 *
 * Needs banal where `paperlint toolchain` puts it (or `$BANAL`). Without it the tests are skipped;
 * under CI (after `paperlint toolchain`) that is a failure (`../need.ts`).
 *
 *   npm run test:e2e:tex
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { missing } from "../need.ts";
// The third composition root: the real adapters, the settings parsed from the environment here.
import {
  banalMeasurer,
  parseBanalSettings,
} from "../../../dist/adapters/banal/index.js";
import {
  hostDirs,
  nodeAdapters,
  nodeFiles,
} from "../../../dist/adapters/node/index.js";
import { lookupOrder, pickBanal } from "../../../dist/adapters/banal/locate.js";
import { describeLine } from "../../../dist/adapters/banal/failure.js";
import {
  flatGeometry,
  whyNoGeometry,
  type FlatGeometry,
} from "../../../dist/domain/geometry.js";
import { pdf2xml } from "../../../dist/adapters/banal/xml.js";
import type { PageLayout, TextBox } from "../../../dist/domain/page-layout.js";
import type { AbsolutePath } from "../../../dist/domain/paths.js";
import { readPdf } from "../../../dist/pdf-facts.js";

/** An absolute path is what the brand promises; this checks it rather than asserting it. */
const isAbsolutePath = (p: string): p is AbsolutePath => isAbsolute(p);

const HERE_ROOT = dirname(
  dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
);
if (!isAbsolutePath(HERE_ROOT))
  throw new Error(`${HERE_ROOT}: the repository root is not absolute`);
const ROOT: AbsolutePath = HERE_ROOT;
const FIX = join(ROOT, "fixtures", "pdf-facts");

/** The two fields of banal's JSON, and of the facts file, this run reads. */
const BanalJson = z.object({ bodyfontsize: z.unknown().optional() });
const FactsFile = z.record(z.string(), z.unknown());

/** banal 1.2 on poppler pdftohtml 24.02.0, 2026-09-25 — see the header. */
const EXPECTED = {
  "corrupt-font.pdf": {
    page_w_in: 8.264,
    page_h_in: 11.694,
    columns: 1,
    body_pt: 10.3,
    ref_pt: null,
    body_pages: 1,
    ref_pages: 0,
    appendix_pages: 0,
    pages_by_type: { cover: 1 },
  },
  "hidden-text.pdf": {
    page_w_in: 8.5,
    page_h_in: 11,
    columns: 2,
    body_pt: 10.3,
    ref_pt: null,
    body_pages: 3,
    ref_pages: 0,
    appendix_pages: 0,
    pages_by_type: { body: 2, blank: 1 },
  },
  "t3-all.pdf": {
    page_w_in: 8.264,
    page_h_in: 11.694,
    columns: 1,
    body_pt: 10.3,
    ref_pt: null,
    body_pages: 1,
    ref_pages: 0,
    appendix_pages: 0,
    pages_by_type: { cover: 1 },
  },
  "t3-mixed.pdf": {
    page_w_in: 8.264,
    page_h_in: 11.694,
    columns: 1,
    body_pt: 10.3,
    ref_pt: null,
    body_pages: 1,
    ref_pages: 0,
    appendix_pages: 0,
    pages_by_type: { cover: 1 },
  },
  "ttf.pdf": {
    page_w_in: 8.264,
    page_h_in: 11.694,
    columns: 1,
    body_pt: 14.3,
    ref_pt: null,
    body_pages: 2,
    ref_pages: 0,
    appendix_pages: 0,
    pages_by_type: { cover: 1, figure: 1 },
  },
} satisfies Record<string, FlatGeometry>;

const found = pickBanal(
  lookupOrder(parseBanalSettings(process.env, hostDirs()), ROOT),
  (p) => nodeFiles.isFile(p),
);
const where = found.ok ? found.value : null;

/** What every test below shares: a PATH holding perl only, and the measurer over it. */
interface Rig {
  readonly work: string;
  readonly env: { PATH: string; HOME: string };
  readonly banal: string;
  readonly measure: (
    pages: readonly PageLayout[],
  ) => string | Record<string, unknown>;
}

/** A work directory whose PATH holds perl ONLY: whatever answers banal's `pdftohtml -v`, it is not poppler. */
function rig(banal: string): Rig {
  const work = realpathSync(
    mkdtempSync(join(tmpdir(), "paperlint-banal-e2e-")),
  );
  const bin = join(work, "bin");
  mkdirSync(bin);
  const perl = spawnSync("perl", ["-e", "print $^X"], {
    encoding: "utf8",
  }).stdout;
  symlinkSync(perl, join(bin, "perl"));
  const env = { PATH: bin, HOME: work };
  // The banal found above, run with a PATH holding perl only.
  const settings = parseBanalSettings({ ...env, BANAL: banal }, hostDirs());
  const measurer = banalMeasurer(
    nodeAdapters({ tmpDir: settings.tmpDir }),
    settings,
    ROOT,
  );
  // The geometry as the facts file spells it (the recorded numbers are in its field names).
  const measure = (
    pages: readonly PageLayout[],
  ): string | Record<string, unknown> => {
    const g = measurer.measure(pages);
    if (g.kind === "unmeasured") return whyNoGeometry(g);
    return Object.fromEntries(
      Object.entries(flatGeometry(g)).filter(([k]) => k !== "geometry_source"),
    );
  };
  return { work, env, banal, measure };
}

/** A fixture's layout as pdf.js reads it; a fixture it cannot read fails the test that asked. */
async function layoutOf(name: string): Promise<readonly PageLayout[]> {
  const r = await readPdf(join(FIX, name));
  if (!r.ok) throw new Error(`${name}: pdf.js could not read it: ${r.reason}`);
  return r.facts.layout;
}

/** `extract-pdf-facts.mjs --strict` on hidden-text.pdf, the way CI calls it, and its verdict. */
function extractFacts(r: Rig): void {
  const paper = join(r.work, "papers", "hidden");
  mkdirSync(paper, { recursive: true });
  cpSync(join(FIX, "hidden-text.pdf"), join(paper, "paper.pdf"));
  const run = spawnSync(
    process.execPath,
    [
      join(ROOT, "skills", "render-paper", "extract-pdf-facts.mjs"),
      paper,
      "--strict",
    ],
    {
      encoding: "utf8",
      cwd: r.work,
      env: { ...r.env, CLAUDE_PROJECT_DIR: r.work, BANAL: r.banal },
    },
  );
  const file = join(paper, "_build", "paper.facts.json");
  const facts = existsSync(file)
    ? FactsFile.parse(JSON.parse(readFileSync(file, "utf8")))
    : {};
  const base = EXPECTED["hidden-text.pdf"];
  const picked = Object.fromEntries(
    Object.keys(base).map((k) => [k, facts[k]]),
  );
  expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);
  expect(facts.geometry_source).toBe("banal");
  expect(picked).toEqual(base);
}

// Guards: each filter is load-bearing on this fixture; one that changed nothing would be
// untested here, however right it looks.
const variants: Record<string, (b: TextBox) => TextBox> = {
  "rotated text written as if upright": (b) => ({ ...b, upright: true }),
  "invisible text written": (b) =>
    b.fill.kind === "invisible" ? { ...b, fill: { kind: "unknown" } } : b,
  "light text written without its colour": (b) =>
    b.fill.kind === "rgb" ? { ...b, fill: { kind: "unknown" } } : b,
};

const skip = missing(
  "banal",
  where !== null,
  found.ok ? "" : describeLine({ kind: "banal-missing", missing: found.error }),
);

describe.skipIf(skip)("the real banal, on the XML paperlint writes", () => {
  let r: Rig;
  beforeAll(() => {
    if (where === null) throw new Error("unreachable: skipped without banal");
    console.log(`banal: ${where.path} (from ${where.provenance.kind})`);
    r = rig(where.path);
  });
  afterAll(() => {
    rmSync(r.work, { recursive: true, force: true });
  });

  // Guards: the whole option-1 claim — the real banal on paperlint's XML gives HotCRP's numbers.
  it.each(Object.entries(EXPECTED))(
    "1. %s: pdf.js → XML → banal equals banal on real pdftohtml",
    async (name, want) => {
      expect(r.measure(await layoutOf(name))).toEqual(want);
    },
  );

  it.each(Object.entries(variants))(
    "2. hidden-text.pdf, %s → a different measurement (the condition in adapters/banal/xml.ts is load-bearing)",
    async (_, f) => {
      const hidden = await layoutOf("hidden-text.pdf");
      const got = r.measure(
        hidden.map((p) => ({ ...p, boxes: p.boxes.map(f) })),
      );
      expect(typeof got).toBe("object");
      expect(got).not.toEqual(EXPECTED["hidden-text.pdf"]);
    },
  );

  /** banal on t3-mixed.pdf's XML, with `pdftohtml` answering `-v` from the given program. */
  const banalWith = async (pdftohtml: string) => {
    const xml = join(r.work, "t3-mixed.xml");
    writeFileSync(xml, pdf2xml(await layoutOf("t3-mixed.pdf")));
    return spawnSync("perl", [r.banal, "-no-time", "-json", xml], {
      encoding: "utf8",
      env: { ...r.env, PDFTOHTML: pdftohtml },
    });
  };

  // Guards: the stub's existence — banal asks `pdftohtml -v` before reading ANY input, the XML
  // included, and stops when nothing answers.
  it("3. with no pdftohtml to answer -v, banal does not measure at all", async () => {
    const none = await banalWith(join(r.work, "no-such-pdftohtml"));
    expect(none.status).not.toBe(0);
    expect(none.stderr).toMatch(/Failed to run/);
  });

  // Guards: the version the stub answers — below 0.85 banal adds a larger font-size correction,
  // and the body size moves off the recorded 10.3.
  it("3. a stub answering an OLD version moves the body size — the version is load-bearing", async () => {
    const old = join(r.work, "old-pdftohtml");
    writeFileSync(old, '#!/bin/sh\necho "pdftohtml version 0.84"\n', {
      mode: 0o755,
    });
    const json: unknown = JSON.parse((await banalWith(old)).stdout);
    const body = BanalJson.parse(json).bodyfontsize;
    expect(typeof body).toBe("number");
    expect(body).not.toBe(EXPECTED["t3-mixed.pdf"].body_pt);
  });

  it("4. extract-pdf-facts.mjs --strict, as CI calls it: exit 0, geometry_source banal, the recorded geometry", () => {
    extractFacts(r);
  });
});
