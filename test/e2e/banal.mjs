#!/usr/bin/env node
/**
 * test/e2e/banal.mjs — the REAL banal, installed by `rpp toolchain`, measuring the committed PDF
 * fixtures through rpp's own path: pdf.js → pdftohtml-style XML → `perl banal`. No poppler.
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
 *   2. the four conditions `pdf-layout.ts` names are each load-bearing on `hidden-text.pdf`: switch
 *      one off and the measurement changes (a condition that changes nothing is untested);
 *   3. without a pdftohtml to answer `-v`, banal does not run, and a stub answering an old version
 *      moves the body size — so both the stub and the version it answers are load-bearing;
 *   4. `extract-pdf-facts.mjs --strict` writes the facts with `geometry_source: "banal"`.
 *
 * Needs banal where `rpp toolchain` puts it (or `$BANAL`). Without it the run is a declared skip
 * (77); under --strict (CI, after `rpp toolchain`) a failure.
 *
 *   node test/e2e/banal.mjs [--strict]
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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const FIX = join(ROOT, "fixtures", "pdf-facts");
const strict = process.argv.includes("--strict");
const { findBanal, measureLayout, missingBanal } = await import(
  join(ROOT, "dist", "banal.js")
);
const { pdf2xml } = await import(join(ROOT, "dist", "pdf-layout.js"));
const { readPdf } = await import(join(ROOT, "dist", "pdf-facts.js"));
const { geometryOf } = await import(
  join(ROOT, "dist", "core", "banal", "output.js")
);
const { describeLine } = await import(
  join(ROOT, "dist", "core", "banal", "failure.js")
);
const { spawnProcess } = await import(
  join(ROOT, "dist", "adapters", "node", "process.js")
);

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
};

const where = findBanal(process.env, ROOT);
if (!where) {
  const say = `banal-e2e: skipped — ${missingBanal(process.env)}`;
  if (!strict) {
    console.log(say);
    process.exit(77);
  }
  console.error(
    `${say}\nIn --strict this is a FAILURE: CI runs \`rpp toolchain\` first.`,
  );
  process.exit(2);
}
console.log(`banal: ${where.path} (from ${where.from})`);

let bad = 0;
const check = (label, cond, detail = "") => {
  console.log(
    `  ${cond ? "✓" : "✗"} ${label}${detail && !cond ? ` — ${detail}` : ""}`,
  );
  if (!cond) bad++;
};

const work = realpathSync(mkdtempSync(join(tmpdir(), "rpp-banal-e2e-")));
try {
  // A PATH holding perl ONLY: whatever answers banal's `pdftohtml -v`, it is not poppler.
  const bin = join(work, "bin");
  mkdirSync(bin);
  const perl = spawnSync("perl", ["-e", "print $^X"], {
    encoding: "utf8",
  }).stdout;
  symlinkSync(perl, join(bin, "perl"));
  const env = { PATH: bin, HOME: work };
  const measure = (pages, e = env) => {
    const r = measureLayout(where.path, pages, { run: spawnProcess(), env: e });
    return r.ok ? geometryOf(r.value) : describeLine(r.error);
  };

  console.log(
    "\n1. each fixture, pdf.js → XML → banal, equals banal on real pdftohtml",
  );
  const layouts = {};
  for (const [name, want] of Object.entries(EXPECTED)) {
    const r = await readPdf(join(FIX, name));
    if (!r.ok) {
      check(name, false, `pdf.js could not read it: ${r.reason}`);
      continue;
    }
    layouts[name] = r.facts.layout;
    const got = measure(r.facts.layout);
    // Guards: the whole option-1 claim — the real banal on rpp's XML gives HotCRP's numbers.
    check(name, isDeepStrictEqual(got, want), JSON.stringify(got));
  }

  console.log(
    "\n2. each condition in pdf-layout.ts changes the measurement when switched off",
  );
  const hidden = layouts["hidden-text.pdf"] ?? [];
  const base = EXPECTED["hidden-text.pdf"];
  const off = (f) => hidden.map((p) => ({ ...p, boxes: p.boxes.map(f) }));
  const variants = {
    "rotated text written as if upright": off((b) => ({ ...b, upright: true })),
    "invisible text written": off((b) =>
      b.fill.kind === "invisible" ? { ...b, fill: { kind: "unknown" } } : b,
    ),
    "light text written without its colour": off((b) =>
      b.fill.kind === "rgb" ? { ...b, fill: { kind: "unknown" } } : b,
    ),
  };
  for (const [label, pages] of Object.entries(variants)) {
    const got = measure(pages);
    // Guards: each filter is load-bearing on this fixture; one that changed nothing would be
    // untested here, however right it looks.
    check(
      `${label} → a different measurement`,
      typeof got === "object" && !isDeepStrictEqual(got, base),
      JSON.stringify(got),
    );
  }

  console.log("\n3. the pdftohtml -v stub, and the version it answers");
  {
    const xml = join(work, "t3-mixed.xml");
    writeFileSync(xml, pdf2xml(layouts["t3-mixed.pdf"] ?? []));
    const banal = (pdftohtml) =>
      spawnSync("perl", [where.path, "-no-time", "-json", xml], {
        encoding: "utf8",
        env: { ...env, PDFTOHTML: pdftohtml },
      });
    const none = banal(join(work, "no-such-pdftohtml"));
    // Guards: the stub's existence — banal asks `pdftohtml -v` before reading ANY input, the XML
    // included, and stops when nothing answers.
    check(
      "with no pdftohtml to answer -v, banal does not measure at all",
      none.status !== 0 && /Failed to run/.test(none.stderr),
      `${none.status} ${none.stderr}`,
    );
    const old = join(work, "old-pdftohtml");
    writeFileSync(old, '#!/bin/sh\necho "pdftohtml version 0.84"\n', {
      mode: 0o755,
    });
    let body = null;
    try {
      body = JSON.parse(banal(old).stdout).bodyfontsize;
    } catch {
      body = "no JSON";
    }
    // Guards: the version the stub answers — below 0.85 banal adds a larger font-size correction,
    // and the body size moves off the recorded 10.3.
    check(
      "a stub answering an OLD version moves the body size — the version is load-bearing",
      typeof body === "number" && body !== EXPECTED["t3-mixed.pdf"].body_pt,
      String(body),
    );
  }

  console.log("\n4. extract-pdf-facts.mjs --strict, as CI calls it");
  {
    const paper = join(work, "papers", "hidden");
    mkdirSync(paper, { recursive: true });
    cpSync(join(FIX, "hidden-text.pdf"), join(paper, "paper.pdf"));
    const r = spawnSync(
      process.execPath,
      [
        join(ROOT, "skills", "render-paper", "extract-pdf-facts.mjs"),
        paper,
        "--strict",
      ],
      {
        encoding: "utf8",
        cwd: work,
        env: { ...env, CLAUDE_PROJECT_DIR: work, BANAL: where.path },
      },
    );
    const file = join(paper, "_build", "paper.facts.json");
    const facts = existsSync(file)
      ? JSON.parse(readFileSync(file, "utf8"))
      : {};
    const picked = Object.fromEntries(
      Object.keys(base).map((k) => [k, facts[k]]),
    );
    check(
      "exit 0, geometry_source banal, and the recorded geometry",
      r.status === 0 &&
        facts.geometry_source === "banal" &&
        isDeepStrictEqual(picked, base),
      `${r.stdout}${r.stderr}${JSON.stringify(picked)}`,
    );
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(
  bad === 0
    ? "\n✅ banal e2e: everything matched"
    : `\n🔴 banal e2e: ${bad} mismatch(es)`,
);
process.exit(bad === 0 ? 0 : 1);
