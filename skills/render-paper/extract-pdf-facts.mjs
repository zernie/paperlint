#!/usr/bin/env node
/**
 * extract-pdf-facts.mjs — measure a finished PDF and write its FACTS into
 * `<paper>/_build/paper.facts.json`. It judges nothing; lint rules judge the file.
 *
 * 🔴 A THIN SHIM. The measuring and the writing are `measurePaper` and `writeFactsFile` in
 * `src/facts-file.ts`, the one writer of that file; `paperlint build` calls the same functions right after
 * it compiles a paper. This file is a composition root: it reads the environment and builds the real
 * adapters (`dist/adapters/node/`), and it owns the `--strict` policy. This
 * script exists for two callers the build does not serve: a PDF paperlint did not build (a paper that
 * declares its artifact elsewhere in `paperlint.json`), and CI steps that name this script by path.
 * It reaches the package's compiled code through `../../dist/`, resolved from this file's real
 * location, so it works the same from a checkout, from `node_modules` and through a symlink.
 *
 * WHAT IT MEASURES WITH. pdf.js (the `unpdf` package, installed with paperlint) for the page count, the
 * fonts and the last page — nothing to install. `banal` (the page-geometry script HotCRP's format
 * checker runs) for paper size, columns and font sizes — run by perl on XML paperlint writes from the same
 * pdf.js read, no poppler. `npx paperlint toolchain` installs it; `$BANAL` or a project's `vendor/banal`
 * take precedence (`src/adapters/banal/`).
 *
 * ── THE EXIT-CODE CONTRACT (callers branch on it; the table is `src/exit-code.ts`) ──
 *   0  facts written — or, without `--strict`, not written and said so (a local run may lack banal)
 *   1  no such path; or, with `--strict`, the facts could not be taken (no banal, no perl, banal
 *      failed, unreadable PDF).
 *      In CI a missing tool is an ENVIRONMENT error, and a skipped step looks like a passed one
 *   2  usage
 *   3  the paper declares an artifact that is not built — a different event from "extraction
 *      crashed", and the caller must be able to tell them apart (external review, 2026-08-31)
 */
import { existsSync, statSync } from "node:fs";
import { join, dirname, basename, relative } from "node:path";
import { isMain } from "../paper-pipeline/scripts/consumer.mjs";
import {
  declaredVenue as declaredIn,
  measurePaper,
  writeFactsFile,
} from "../../dist/facts-file.js";
import { readPdf } from "../../dist/pdf-facts.js";
import {
  banalMeasurer,
  parseBanalSettings,
} from "../../dist/adapters/banal/index.js";
import {
  hostDirs,
  nodeAdapters,
  nodeFiles,
} from "../../dist/adapters/node/index.js";
import { whyNoGeometry } from "../../dist/domain/geometry.js";
import { exitCodeFor } from "../../dist/exit-code.js";

/** The venue the paper's `paperlint.json` declares, read from disk. */
export const declaredVenue = (paperDir) => declaredIn(nodeFiles, paperDir);

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

/**
 * Accept either a path to a PDF or a PAPER DIRECTORY — and in the second case find the artifact on
 * its own: the path the paper declares in the `pdf` field of `paperlint.json`, else `paper.pdf` beside
 * it. A paper written in markdown and built by its own script into `build/acl_latex.pdf` would
 * otherwise be skipped silently. The facts ALWAYS go into `<paper directory>/_build/`, not next to
 * the PDF, where neither a rule's glob nor a human looks.
 */
export function resolveTarget(arg) {
  const isDir = existsSync(arg) && statSync(arg).isDirectory();
  const paperDir = isDir ? arg : dirname(arg);
  const decl = declaredVenue(paperDir);
  const pdf = isDir ? join(paperDir, decl?.pdf || "paper.pdf") : arg;
  return { paperDir, pdf, decl: decl || {} };
}

/**
 * The ONE `process.exit`: print what happened, then exit with the contract's code for this outcome
 * in this mode.
 */
function finish(outcome, strict, say = null) {
  if (say) console.error(say);
  process.exit(exitCodeFor(outcome, { strict }));
}

/** Parse the command line, or finish with the contract's code. */
function parseCommandLine(argv) {
  const strict = argv.includes("--strict");
  const [target, venue, kind] = argv.filter((a) => a !== "--strict");
  if (!target)
    finish(
      "usage",
      strict,
      "usage: extract-pdf-facts.mjs <paper.pdf | paper directory> [venue] [kind] [--strict]",
    );
  if (!existsSync(target))
    finish("no-such-path", strict, `🛑 no such path ${target}`);
  return { strict, target, venue, kind };
}

/** Why no facts were taken, in the words for this mode. */
const refusal = (msg, strict) =>
  strict
    ? `🛑 facts not taken: ${msg} — in CI this is an environment error, not a skip`
    : `⏭️  facts not taken: ${msg} (a local run, without --strict). THE PDF IS NOT CHECKED`;

// 🔴 `isMain`, NOT a comparison of `import.meta.url` with `process.argv[1]`. Node resolves the entry
// point to its REAL path for `import.meta.url` but leaves `process.argv[1]` as typed, so through a
// symlink the two differ and the CLI silently does nothing, exiting 0. Observed 2026-09-14 on run
// 34784079821: `extract-pdf-facts.mjs --strict` returned RC=0 and created no facts file.
if (isMain(import.meta.url)) {
  const { strict, target, venue, kind } = parseCommandLine(
    process.argv.slice(2),
  );
  const { paperDir, pdf } = resolveTarget(target);
  if (!existsSync(pdf))
    finish(
      "no-artifact",
      strict,
      `🛑 no artifact ${pdf} — the paper declared it in paperlint.json, but it is not built`,
    );
  // The composition root: banal as the measurer, wired from this process's environment.
  const settings = parseBanalSettings(process.env, hostDirs());
  const measure = banalMeasurer(
    nodeAdapters({ tmpDir: settings.tmpDir }),
    settings,
    ROOT,
  );
  // Command-line arguments override the declaration — for a one-off check of someone else's PDF.
  const m = await measurePaper(paperDir, pdf, {
    readPdf,
    venue: venue ?? null,
    kind: kind ?? null,
    measure,
    files: nodeFiles,
  });
  if (!m.ok) finish("unreadable", strict, refusal(m.error, strict));
  const { facts, geometry } = m.value;
  const why = geometry.kind === "unmeasured" ? whyNoGeometry(geometry) : null;
  if (why && strict) finish("no-geometry", strict, refusal(why, strict));
  const out = writeFactsFile(nodeFiles, paperDir, facts);
  if (why)
    console.error(
      `⚠️  ${why} — page size, columns and font sizes are null in the facts (run with --strict to require them)`,
    );
  console.log(
    `✅ ${basename(pdf)} → ${relative(ROOT, out) || out} (${facts.fonts.length} faces, ${facts.npages} pp.)`,
  );
  finish("written", strict);
}
