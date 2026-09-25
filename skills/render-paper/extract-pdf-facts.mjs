#!/usr/bin/env node
/**
 * extract-pdf-facts.mjs — measure a finished PDF and write its FACTS into
 * `<paper>/_build/paper.facts.json`. It judges nothing; lint rules judge the file.
 *
 * 🔴 A THIN SHIM. The measuring and the writing are `writeFacts` in `src/facts-file.ts`, the one
 * writer of that file; `rpp build` calls the same function right after it compiles a paper. This
 * script exists for two callers the build does not serve: a PDF rpp did not build (a paper that
 * declares its artifact elsewhere in `venue.json`), and CI steps that name this script by path.
 * It reaches the package's compiled code through `../../dist/`, resolved from this file's real
 * location, so it works the same from a checkout, from `node_modules` and through a symlink.
 *
 * WHAT IT MEASURES WITH. pdf.js (the `unpdf` package, installed with rpp) for the page count, the
 * fonts and the last page — nothing to install. `banal` (the page-geometry script HotCRP's format
 * checker runs) for paper size, columns and font sizes — run by perl on XML rpp writes from the same
 * pdf.js read, no poppler. `npx rpp toolchain` installs it; `$BANAL` or a project's `vendor/banal`
 * take precedence (`src/banal.ts`).
 *
 * ── THE EXIT-CODE CONTRACT (callers branch on it) ─────────────────────────────
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
import { declaredVenue, writeFacts } from "../../dist/facts-file.js";
import { readPdf } from "../../dist/pdf-facts.js";

export { declaredVenue };

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

/**
 * Accept either a path to a PDF or a PAPER DIRECTORY — and in the second case find the artifact on
 * its own: the path the paper declares in the `pdf` field of `venue.json`, else `paper.pdf` beside
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

/** Parse the command line, or exit with the contract's code. */
function parseCommandLine(argv) {
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
  return { strict, target, venue, kind };
}

/** Say why no facts were written, and exit with the contract's code for that mode. */
function refuse(lines, strict) {
  const msg = lines.join("; ");
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

// 🔴 `isMain`, NOT a comparison of `import.meta.url` with `process.argv[1]`. Node resolves the entry
// point to its REAL path for `import.meta.url` but leaves `process.argv[1]` as typed, so through a
// symlink the two differ and the CLI silently does nothing, exiting 0. Observed 2026-09-14 on run
// 34784079821: `extract-pdf-facts.mjs --strict` returned RC=0 and created no facts file.
if (isMain(import.meta.url)) {
  const { strict, target, venue, kind } = parseCommandLine(
    process.argv.slice(2),
  );
  const { paperDir, pdf } = resolveTarget(target);
  if (!existsSync(pdf)) {
    console.error(
      `🛑 no artifact ${pdf} — the paper declared it in venue.json, but it is not built`,
    );
    process.exit(3);
  }
  // Command-line arguments override the declaration — for a one-off check of someone else's PDF.
  const r = await writeFacts(paperDir, pdf, {
    readPdf,
    venue: venue ?? null,
    kind: kind ?? null,
    banal: strict ? "required" : "optional",
    projectRoot: ROOT,
  });
  if (!r.ok) refuse(r.lines, strict);
  if (r.geometryMissing)
    console.error(
      `⚠️  ${r.geometryMissing} — page size, columns and font sizes are null in the facts (run with --strict to require them)`,
    );
  console.log(
    `✅ ${basename(pdf)} → ${relative(ROOT, r.path) || r.path} (${r.facts.fonts.length} faces, ${r.facts.npages} pp.)`,
  );
}
