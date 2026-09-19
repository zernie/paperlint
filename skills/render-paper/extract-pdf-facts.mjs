#!/usr/bin/env node
/**
 * extract-pdf-facts.mjs — measure a finished PDF and write the FACTS into JSON. It judges nothing.
 *
 * WHY THE SPLIT. Until 26.08 measuring and judging lived in one function (`check-geometry.mjs`),
 * that is, on the fifth rung of the ladder — in a script of our own. The judging moves into ESLint
 * rules (a registry, severity from the config, suppression with a reason, positions). What stays
 * here is the plumbing.
 *
 * This is NOT our invention: veraPDF, the only PDF validator with user-defined rules, is built that
 * way — verbatim, it "doesn't parse PDF documents directly. Instead it processes the machine
 * readable report output". The binary never reaches the rule engine at all.
 *
 * WHAT WE MEASURE WITH. Eddie Kohler's `banal` (the one HotCRP's `checkformat.php` calls inside) —
 * geometry. `pdffonts` — the fonts banal does not know about by construction (the words
 * `type3`/`embed` do not appear once in its 1901 lines). Two tools, two halves, neither duplicating
 * the other.
 *
 * 🔴 GOING STALE. The facts are derived from the PDF, and the PDF is NOT COMMITTED to git
 * (the consumer excludes the built `paper.pdf` in its own `.gitignore`). So the facts must not be
 * committed either: that would produce exactly `api:check`, which read a `dist/` from the previous
 * build and printed "verified, no drift".
 * So the file is written into `_build/` (gitignored) and carries `pdf_sha256` — the first rule
 * checks it against the file on disk, and stale facts become a finding rather than silence.
 *
 * 🔴 TWO MODES OF A MISSING TOOL. Locally `banal` may not be installed — that is a legitimate skip.
 * In CI a missing tool is an ENVIRONMENT error, and staying silent about it is not allowed: a
 * skipped step is indistinguishable from a passing one in the interface. Hence `--strict` (CI always
 * passes it).
 */
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, basename } from "node:path";
import { isMain } from "../paper-pipeline/scripts/consumer.mjs";

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

/** Parsing the output of pdffonts: face, type, whether it is embedded. */
export function readFonts(text) {
  const rows = text
    .split("\n")
    .slice(2)
    .filter((l) => l.trim());
  return rows.map((l) => {
    const c = l
      .trim()
      .split(/\s{2,}|\s(?=yes|no)/)
      .filter(Boolean);
    return {
      name: (c[0] || "").replace(/^[A-Z]{6}\+/, ""),
      type: c[1] || "",
      embedded: /\byes\b/.test(l),
    };
  });
}

export function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * The heights of the two columns of the LAST page, in points, or null. It judges nothing — the
 * threshold belongs to the rule.
 *
 * WHY. On 29.08 the publisher (Conference Publishing) sent an ACCEPTED paper back with "Please
 * correct the last page balancing": the bibliography filled the first column to 625 pt and the
 * second to 304. Not one of our gates saw it: `banal` counts pages and font sizes, not the
 * distribution of material across columns, and `pdflatex` knows nothing about its own output.
 *
 * 🔴 MEASURE GEOMETRY, NOT LINES. The first version of the measurement that day counted lines from
 * `pdftotext -layout` and declared "balanced" on a page with a 377 pt difference: the layout glues
 * the columns together line by line, and both end up with the same number of lines BY CONSTRUCTION.
 *
 * 🔴 SPLIT BY THE MIDDLE OF THE PAGE, NOT BY THE EDGES OF THE WORDS. The second version took the
 * middle between the outermost words — and on a page where only the left column is filled, the cut
 * fell inside it, giving "77 / 731" where on paper there are six lines at the top left.
 *
 * 🔴 WE DO NOT JUDGE A REVIEW BUILD, and that is not a relaxation. The line numbers in the margins
 * run down the WHOLE height of the page, so a column with a dozen lines of text measures as full: a
 * measurement on 29.08 gave "656.8 / 654.8" for a page whose right column is filled to one sixth.
 * Balancing, however, is required of a camera-ready, not of the version for reviewers — so the right
 * answer here is "there is nothing to measure", not a fudged number. The tell: short integers in the
 * outer margins.
 *
 * The third and fourth heuristics (cutting off a "footer" by the gap between lines) were TRIED AND
 * REJECTED on 29.08: on a real paper the cut fired on a legitimate gap inside a column and left 31
 * pt of 657 of it. There is deliberately nothing of the sort here — the fewer heuristics, the fewer
 * ways to lie.
 */
export function lastPageColumns(pdf, npages, pageWidthPt) {
  if (!npages || npages < 1 || !pageWidthPt) return null;
  let xml;
  try {
    xml = execFileSync(
      "pdftotext",
      ["-bbox", "-f", String(npages), "-l", String(npages), pdf, "-"],
      {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      },
    );
  } catch {
    return null; // pdftotext may not be installed locally; in CI the caller's --strict catches that
  }
  return columnHeights(xml, pageWidthPt);
}

/**
 * Parsing `pdftotext -bbox` → two heights or null. Pulled out of the function above FOR THE SAKE OF
 * A TEST: in one day, 29.08, this measurement had four errors in a row, and a test over a live PDF
 * would have caught none of them — they are all about parsing coordinates. There is not a single
 * disk access here, so the cases are fed in as hand-written markup, including the ones the corpus
 * does not contain today.
 */
export function columnHeights(xml, pageWidthPt) {
  if (!pageWidthPt) return null;
  const words = [
    ...xml.matchAll(
      /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g,
    ),
  ].map((m) => [+m[1], +m[2], +m[3], +m[4], m[5]]);
  if (words.length < 60) return null; // a stub of a page: there is nothing to balance there

  const margin = pageWidthPt * 0.08;
  const lineNumbers = words.filter(
    (w) =>
      /^\d{1,4}$/.test(w[4].trim()) &&
      (w[2] < margin || w[0] > pageWidthPt - margin),
  );
  if (lineNumbers.length >= 5) return null; // a build for reviewers — balancing is not required of it

  const mid = pageWidthPt / 2;
  const h = (side) => {
    const c = words.filter(side);
    if (!c.length) return 0;
    return +(
      Math.max(...c.map((w) => w[3])) - Math.min(...c.map((w) => w[1]))
    ).toFixed(1);
  };
  return [h((w) => w[0] < mid), h((w) => w[0] >= mid)];
}

/**
 * Collect the facts. Throws if a tool is unavailable — the decision "skip or refuse" is taken by the
 * caller, because it depends on whether this is a local run or CI.
 */
export function extract(pdf, { venue, kind, banalPath } = {}) {
  const bp = banalPath || process.env.BANAL || join(ROOT, "vendor/banal");
  if (!existsSync(bp)) throw new Error(`banal not found: ${bp}`);
  const banal = JSON.parse(
    execFileSync("perl", [bp, "-no-time", "-json", pdf], { encoding: "utf8" }),
  );
  const fonts = readFonts(
    execFileSync("pdffonts", [pdf], { encoding: "utf8" }),
  );

  // banal returns papersize as [height, width] in POINTS — the order was checked against live
  // output 26.08
  const ps = Array.isArray(banal.papersize)
    ? banal.papersize.map((x) => x / 72)
    : null;
  const pages = banal.pages || [];
  const bib = pages.find((x) => x.type === "bib" && x.reffontsize != null);

  // 🔴 banal OMITS the `type` field when it equals "body" (its line 1022:
  // `push ... if $page->{type} ne "body"`). So `filter(x => x.type === "body")` returns ZERO for any
  // paper in the world — and that is exactly how the first version of the page-limit gate in
  // `check-geometry.mjs` was written. It printed "0 findings" and could not fire even once:
  // `if (bodyPages && ...)` short-circuits on zero. The same class as the dead relative-dates check
  // in kb-lint — a check whose failure is indistinguishable from its success.
  // banal's full set of types: blank · cover · appendix · bib · figure · body (the default).
  const byType = {};
  for (const x of pages)
    byType[x.type ?? "body"] = (byType[x.type ?? "body"] || 0) + 1;
  // The "body" for the page limit is everything that is not the bibliography and not an appendix:
  // cover and figure take up room in the limit just as ordinary text does.
  const refPages = byType.bib || 0;
  const appendixPages = byType.appendix || 0;

  return {
    schema: 1,
    pdf: pdf.startsWith(ROOT) ? pdf.slice(ROOT.length + 1) : pdf,
    pdf_sha256: sha256(pdf),
    venue: venue ?? null,
    kind: kind ?? null,
    page_w_in: ps ? +ps[1].toFixed(3) : null,
    page_h_in: ps ? +ps[0].toFixed(3) : null,
    columns: banal.columns ?? null,
    body_pt: banal.bodyfontsize ?? null,
    ref_pt: bib ? bib.reffontsize : null,
    body_pages: pages.length - refPages - appendixPages,
    ref_pages: refPages,
    appendix_pages: appendixPages,
    pages_by_type: byType,
    npages: pages.length,
    last_page_cols_pt: lastPageColumns(
      pdf,
      pages.length,
      Array.isArray(banal.papersize) ? banal.papersize[1] : null,
    ),
    fonts,
  };
}

/**
 * Where the paper is submitted — from `<paper-dir>/venue.json`. Until 26.08 this was declared
 * NOWHERE machine-readably: a comment in `venues/agenticdev.yaml` referred to `paper.yaml`, which
 * does not exist. A classic case of a construction described in prose and never built.
 */
export function declaredVenue(paperDir) {
  const f = join(paperDir, "venue.json");
  if (!existsSync(f)) return null;
  const d = JSON.parse(readFileSync(f, "utf8"));
  return d.venue
    ? { venue: d.venue, kind: d.kind ?? null, pdf: d.pdf ?? null }
    : null;
}

/**
 * Accept either a path to a PDF or a PAPER DIRECTORY — and in the second case find the artifact on
 * its own.
 *
 * 🔴 Why it became necessary: `compile-rules-2026` does not keep its PDF beside the source. It is
 * written in `paper.md` and built by a script into `build/acl_latex.pdf`. Hardcoding `paper.pdf`
 * into the CI walk would mean silently skipping exactly that paper — the same class as skipping
 * `aisec-2026` because of a missing `venue.json`, only one step later.
 *
 * The path is declared by the paper itself, in the `pdf` field of `venue.json`; the default is
 * `paper.pdf` next to it. The facts, meanwhile, ALWAYS go into `<paper directory>/_build/` and not
 * next to the PDF: otherwise for this paper they would have gone to `build/_build/`, where neither
 * the config's glob nor a human ever looks.
 */
export function resolveTarget(arg) {
  const isDir = existsSync(arg) && statSync(arg).isDirectory();
  const paperDir = isDir ? arg : dirname(arg);
  const decl = declaredVenue(paperDir);
  const pdf = isDir ? join(paperDir, decl?.pdf || "paper.pdf") : arg;
  return { paperDir, pdf, decl: decl || {} };
}

// 🔴 `isMain`, NOT `import.meta.url === `file://${process.argv[1]}``. Node resolves the entry point
// to its REAL path for `import.meta.url` but leaves `process.argv[1]` as typed, so through a symlink
// the two are not equal and the CLI silently does not execute — the process exits 0 having done
// nothing. The consumer reaches these scripts precisely through a symlink. Observed 14.09 on run
// 34784079821: `extract-pdf-facts.mjs --strict` returned RC=0 and created no facts file.
if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const strict = argv.includes("--strict");
  const [target, venue, kind] = argv.filter((a) => a !== "--strict");
  if (!target) {
    console.error(
      "usage: extract-pdf-facts.mjs <paper.pdf | paper directory> [venue] [kind] [--strict]",
    );
    process.exit(2);
  }
  if (!existsSync(target)) {
    console.error(`🛑 no such path ${target}`);
    process.exit(1);
  }
  const { paperDir, pdf } = resolveTarget(target);
  if (!existsSync(pdf)) {
    // 🔴 CODE 3, NOT 1 (2026-08-31, external review). "The artifact is not built" and "extraction
    // crashed" are different events, and the caller must tell them apart. Both used to give 1, so
    // the CI step could not do anything other than treat ANY failure as expected: it wrote "not
    // built by this job" and moved on. The consequence — a venue whose `--strict` failed for a real
    // reason (no pdffonts, a broken PDF, a parse crash) silently lost ALL the font, geometry and
    // page-limit checks, and the job exited zero.
    // The knowledge of where the PDF lies lives here (venue.json + resolveTarget), so this script is
    // the one that must tell them apart. An existence check on the caller's side would be a second
    // source of truth about paths.
    console.error(
      `🛑 no artifact ${pdf} — the paper declared it in venue.json, but it is not built`,
    );
    process.exit(3);
  }
  // Command-line arguments override the declaration — for a one-off check of someone else's PDF.
  const decl = declaredVenue(paperDir) || {};
  const v = venue ?? decl.venue ?? null;
  const k = kind ?? decl.kind ?? null;
  let facts;
  try {
    facts = extract(pdf, { venue: v, kind: k });
  } catch (e) {
    const msg = e.message.split("\n")[0];
    if (strict) {
      console.error(
        `🛑 facts not taken: ${msg} — in CI this is an environment error, not a skip`,
      );
      process.exit(1);
    }
    console.error(
      `⏭️  facts not taken: ${msg} (a local run, without --strict). THE PDF IS NOT CHECKED`,
    );
    process.exit(0);
  }
  const out = join(paperDir, "_build", "paper.facts.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(facts, null, 2) + "\n");
  console.log(
    `✅ ${basename(pdf)} → ${out.slice(ROOT.length + 1)} (${facts.fonts.length} faces, ${facts.npages} pp.)`,
  );
}
